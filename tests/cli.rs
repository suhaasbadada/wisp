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
