use serde_json::Value;
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Output, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};

struct Temp(PathBuf);
impl Temp {
    fn new() -> Self {
        static NEXT: AtomicU64 = AtomicU64::new(0);
        let path = std::env::temp_dir().join(format!(
            "wisp-cli-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir(&path).unwrap();
        Self(path)
    }
    fn file(&self, name: &str, text: &str) -> String {
        let p = self.0.join(name);
        fs::write(&p, text).unwrap();
        p.to_str().unwrap().into()
    }
    fn path(&self, name: &str) -> String {
        self.0.join(name).to_str().unwrap().into()
    }
}
impl Drop for Temp {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.0).unwrap();
    }
}
fn cli(args: &[&str], stdin: Option<&str>) -> Output {
    let mut child = Command::new(env!("CARGO_BIN_EXE_wisp"))
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    if let Some(s) = stdin {
        let _ = child.stdin.take().unwrap().write_all(s.as_bytes());
    } else {
        drop(child.stdin.take());
    }
    child.wait_with_output().unwrap()
}
fn report(o: &Output, code: i32, status: &str) -> Value {
    assert_eq!(
        o.status.code(),
        Some(code),
        "{}",
        String::from_utf8_lossy(&o.stderr)
    );
    let v: Value = serde_json::from_slice(&o.stdout).unwrap();
    assert_eq!(v["status"], status, "{v}");
    v
}
#[test]
fn compiler_discovery_and_cli_created_diagnostics_use_shared_codes() {
    let expected: Value =
        serde_json::from_str(&wisp::dispatch(r#"{"op":"capabilities","source":""}"#)).unwrap();
    let native = cli(&["capabilities"], None);
    assert_eq!(report(&native, 0, "Ready"), expected);
    assert!(native.stderr.is_empty());
    assert!(native.stdout.len() <= wisp::CAPABILITIES_BYTES + 1);
    let t = Temp::new();
    let source = t.file("plain.wisp", "fn f()->Int{1}");
    let r = report(&cli(&["focus", &source, "missing"], None), 1, "Error");
    assert_eq!(r["diagnostics"][0]["code"], "E_FOCUS_UNKNOWN");
    assert_eq!(r["diagnostics"][0]["kind"], "Request");
    assert!(r["diagnostics"][0].get("path").is_none());
    let out = t.path("never-created.json");
    let r = report(&cli(&["archive", &source, "--out", &out], None), 1, "Error");
    assert_eq!(r["diagnostics"][0]["code"], "E_ARCHIVE_SELECTION");
    assert!(!std::path::Path::new(&out).exists());
    let r = report(
        &cli(&["--json"], Some(r#"{"op":"run","source":"print(1/0);"}"#)),
        0,
        "Error",
    );
    assert_eq!(r["diagnostics"][0]["code"], "E_DIV_ZERO");
    let o = cli(&["capabilities", "unexpected"], None);
    assert_eq!(o.status.code(), Some(2));
    assert!(o.stdout.is_empty());
}
#[test]
fn typed_call_native_files_stdin_defaults_and_shared_transport() {
    let t = Temp::new();
    let src = "record Item {quantity:Int,unit_price:Int} fn total(item:Item)->Int{item.quantity*item.unit_price} print(1/0);";
    let file = t.file("invoice.wisp", src);
    let raw = r#"[{"quantity":"9","unit_price":"100"}]"#;
    let args = t.file("input.json", raw);
    let native = report(
        &cli(&["call", &file, "total", "--args-file", &args], None),
        0,
        "Complete",
    );
    let request = format!(
        r#"{{"op":"call","source":{},"function":"total","args":{raw}}}"#,
        serde_json::json!(src)
    );
    let core: Value = serde_json::from_str(&wisp::dispatch(&request)).unwrap();
    assert_eq!(native, core);
    assert_eq!(native["result"]["value"], "900");
    assert_eq!(native["output"], "");
    assert_eq!(
        report(
            &cli(&["call", &file, "total", "--args-file", "-"], Some(raw)),
            0,
            "Complete"
        ),
        core
    );
    assert_eq!(
        report(
            &cli(&["call", "-", "total", "--args-file", &args], Some(src)),
            0,
            "Complete"
        ),
        core
    );
    let noargs = t.file("noargs.wisp", "fn f()->Int{42}");
    assert_eq!(
        report(&cli(&["call", &noargs, "f"], None), 0, "Complete")["result"]["value"],
        "42"
    );
    assert_eq!(
        cli(&["call", "-", "f", "--args-file", "-"], None)
            .status
            .code(),
        Some(2)
    );
    for a in [
        vec!["call", &file],
        vec!["call", &file, "total", "--args", raw],
        vec!["call", &file, "total", "--args-file"],
    ] {
        assert_eq!(cli(&a, None).status.code(), Some(2));
    }
}

#[test]
fn typed_call_cli_invalid_data_bounds_exit_codes_and_raw_order() {
    let t = Temp::new();
    let file = t.file("source.wisp", "record A{z:Int,a:Int} fn f(x:A)->A{x}");
    for raw in [
        r#"[{"z":"1","z":"2","a":"3"}]"#,
        r#"[{"z":1,"a":"2"}]"#,
        r#"[],"op":"run"}"#,
        "[",
        "null",
    ] {
        let args = t.file("args.json", raw);
        let r = report(
            &cli(&["call", &file, "f", "--args-file", &args], None),
            1,
            "Error",
        );
        assert_eq!(r["invocation"]["new_execution"], false);
        assert_eq!(r["diagnostics"][0]["kind"], "Input");
    }
    let args = t.file("args.json", r#"[{"a":"2","z":"1"}]"#);
    let output = cli(&["call", &file, "f", "--args-file", &args], None);
    report(&output, 0, "Complete");
    assert!(String::from_utf8(output.stdout)
        .unwrap()
        .contains(r#""value":{"z":"1","a":"2"}"#));
    let large = t.file("large.json", &" ".repeat(wisp::ARGUMENT_BYTES + 1));
    assert_eq!(
        cli(&["call", &file, "f", "--args-file", &large], None)
            .status
            .code(),
        Some(2)
    );
    let invalid = t.path("invalid.json");
    fs::write(&invalid, [0xff, 0xfe]).unwrap();
    assert_eq!(
        cli(&["call", &file, "f", "--args-file", &invalid], None)
            .status
            .code(),
        Some(2)
    );
    assert_eq!(
        cli(
            &["call", &file, "f", "--args-file", &t.path("absent")],
            None
        )
        .status
        .code(),
        Some(2)
    );
    let recursive = t.file("recursive.wisp", "fn f()->Int{f()}");
    report(&cli(&["call", &recursive, "f"], None), 3, "Unknown");
    let broken = t.file("fault.wisp", "fn f()->Int{1/0}");
    report(&cli(&["call", &broken, "f"], None), 1, "Error");
}
#[test]
fn records_use_identical_native_core_for_check_run_focus_and_artifacts() {
    let t = Temp::new();
    let invoice = include_str!("../examples/invoice.wisp");
    let file = t.file("invoice.wisp", invoice);
    let native = report(&cli(&["run", &file], None), 0, "Complete");
    let core: Value = serde_json::from_str(&wisp::dispatch(
        &serde_json::json!({"op":"run","source":invoice}).to_string(),
    ))
    .unwrap();
    assert_eq!(native, core);
    let checked = report(&cli(&["check", &file], None), 0, "Ready");
    assert_eq!(checked["graph"]["records"].as_array().unwrap().len(), 2);
    assert_eq!(checked["output"], "");
    let focused = report(&cli(&["focus", &file, "total"], None), 0, "Ready");
    assert!(focused["agent_view"]["text"]
        .as_str()
        .unwrap()
        .contains("record Item"));
    let broken = t.file(
        "broken-record.wisp",
        "record A {x:Int} fn value()->A {new A {x:0}} probe n in 1..=1 {value().x == n}",
    );
    let artifact = t.path("record.ghost.json");
    report(
        &cli(
            &["archive", &broken, "--probe", "0", "--out", &artifact],
            None,
        ),
        0,
        "Ready",
    );
    let inspected = report(&cli(&["inspect", &artifact], None), 0, "Ready");
    assert!(inspected["artifact"]["source"]
        .as_str()
        .unwrap()
        .contains("record A"));
}
#[test]
fn artifact_files_cannot_escape_into_outer_request_fields() {
    let t = Temp::new();
    let source = t.file("broken.wisp", include_str!("../examples/snacks.wisp"));
    let repaired = t.file(
        "fixed.wisp",
        include_str!("../examples/snacks-repaired.wisp"),
    );
    let artifact_path = t.path("ghost.json");
    report(
        &cli(&["archive", &source, "--out", &artifact_path], None),
        0,
        "Ready",
    );
    let raw = fs::read_to_string(&artifact_path).unwrap();
    for suffix in [",\"limits\":{\"cases\":0}", ",\"op\":\"run\""] {
        let injected = format!("{}{suffix}", raw.trim_end());
        let inspected = report(&cli(&["inspect", "-"], Some(&injected)), 1, "Error");
        assert!(inspected.get("artifact").is_none());
        let replayed = report(
            &cli(&["replay", &repaired, "--artifact", "-"], Some(&injected)),
            1,
            "Error",
        );
        assert!(replayed.get("replay").is_none());
    }
}
#[test]
fn request_limits_preserve_null_and_duplicate_field_rejection() {
    for limits in ["null", "{\"fuel\":1,\"fuel\":1}"] {
        let raw = format!("{{\"op\":\"run\",\"source\":\"print(1);\",\"limits\":{limits}}}");
        report(&cli(&["--json"], Some(&raw)), 0, "Error");
    }
}
#[test]
fn explicit_commands_statuses_and_legacy_compatibility() {
    let t = Temp::new();
    for (source, status, code) in [
        ("print(1);", "Complete", 0),
        ("probe n in 1..=1 { false }", "Fail", 1),
        ("print(true + 1);", "Error", 1),
        ("probe n in 1..=1001 { true }", "Unknown", 3),
    ] {
        let p = t.file("source.wisp", source);
        report(&cli(&["run", &p], None), code, status);
        report(&cli(&[&p], None), 0, status);
        let raw = serde_json::json!({"op":"run","source":source}).to_string();
        report(&cli(&["--json"], Some(&raw)), 0, status);
    }
    for args in [
        vec![],
        vec!["run"],
        vec!["--bad"],
        vec!["focus", "x", "f", "--budget", "-1"],
    ] {
        assert_eq!(cli(&args, None).status.code(), Some(2));
    }
    assert!(String::from_utf8(cli(&["--help"], None).stdout)
        .unwrap()
        .contains("wisp archive"));
}
#[test]
fn check_and_focus_do_not_execute_and_focus_budget_is_explicit() {
    let t = Temp::new();
    let p = t.file(
        "source.wisp",
        "fn foo() -> Int { 1 } print(1 / 0); probe n in 1..=1001 { false }",
    );
    let c = report(&cli(&["check", &p], None), 0, "Ready");
    assert_eq!(c["output"], "");
    assert_eq!(c["probes"], serde_json::json!([]));
    let f = report(
        &cli(&["focus", &p, "foo", "--budget", "1"], None),
        0,
        "Ready",
    );
    assert_eq!(f["agent_view"]["focus"], "foo");
    assert_eq!(f["agent_view"]["used_bytes"], 1);
    assert_eq!(f["agent_view"]["overflow"], true);
    assert_eq!(f["output"], "");
    report(&cli(&["focus", &p, "absent"], None), 1, "Error");
}
#[test]
fn archive_inspect_replay_and_no_overwrite() {
    let t = Temp::new();
    let broken = include_str!("../examples/snacks.wisp");
    let b = t.file("broken.wisp", broken);
    let r = t.file(
        "repaired.wisp",
        include_str!("../examples/snacks-repaired.wisp"),
    );
    let a = t.path("failure.json");
    let archived = report(&cli(&["archive", &b, "--out", &a], None), 0, "Ready");
    let bytes = fs::read(&a).unwrap();
    let artifact: Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(artifact, archived["artifact"]);
    assert_eq!(artifact["ghost"]["input"], "9");
    report(&cli(&["inspect", &a], None), 0, "Ready");
    let replay = report(&cli(&["replay", &r, "--artifact", &a], None), 0, "Pass");
    assert_eq!(replay["artifact"], artifact);
    report(&cli(&["replay", &b, "--artifact", &a], None), 1, "Fail");
    for out in [&a, &b] {
        let o = cli(&["archive", &b, "--out", out], None);
        assert_eq!(o.status.code(), Some(2));
        assert!(o.stdout.is_empty());
    }
    assert_eq!(fs::read(&a).unwrap(), bytes);
    assert_eq!(fs::read_to_string(&b).unwrap(), broken);
    let bad_out = t.path("absent/failure.json");
    let o = cli(&["archive", &b, "--out", &bad_out], None);
    assert_eq!(o.status.code(), Some(2));
    assert!(o.stdout.is_empty());
    report(
        &cli(&["archive", &r, "--out", &t.path("clear.json")], None),
        1,
        "Error",
    );
    report(
        &cli(
            &[
                "archive",
                &b,
                "--out",
                &t.path("none.json"),
                "--probe",
                "999",
            ],
            None,
        ),
        1,
        "Error",
    );
    let malformed = t.file("malformed.json", "not JSON");
    report(&cli(&["inspect", &malformed], None), 1, "Error");
}
#[test]
fn bounded_files_stdin_and_selected_probe() {
    let t = Temp::new();
    let huge_source = " ".repeat(wisp::SOURCE_BYTES + 1);
    let p = t.file("huge.wisp", &huge_source);
    assert_eq!(cli(&["run", &p], None).status.code(), Some(2));
    assert_eq!(
        cli(&["run", "-"], Some(&huge_source)).status.code(),
        Some(2)
    );
    let huge = " ".repeat(wisp::TRANSPORT_BYTES + 1);
    let p = t.file("huge.json", &huge);
    assert_eq!(cli(&["inspect", &p], None).status.code(), Some(2));
    assert_eq!(cli(&["--json"], Some(&huge)).status.code(), Some(2));
    let p = t.file(
        "two.wisp",
        "probe n in 1..=1 { true } probe n in 2..=2 { false }",
    );
    let a = t.path("two.json");
    let r = report(
        &cli(&["archive", &p, "--probe", "1", "--out", &a], None),
        0,
        "Ready",
    );
    assert_eq!(r["artifact"]["ghost"]["input"], "2");
    report(
        &cli(&["inspect", "-"], Some(&fs::read_to_string(a).unwrap())),
        0,
        "Ready",
    );
    let p = t.file("unknown.wisp", "probe n in 1..=1001 { false }");
    report(
        &cli(&["archive", &p, "--out", &t.path("unknown.json")], None),
        3,
        "Unknown",
    );
}
