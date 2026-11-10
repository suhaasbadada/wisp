use serde_json::{json, Value};
use std::{
    fs,
    io::{BufRead, BufReader, Write},
    path::PathBuf,
    process::{Command, Output, Stdio},
    sync::atomic::{AtomicU64, Ordering},
};
static NEXT: AtomicU64 = AtomicU64::new(0);
struct Fixture(PathBuf);
impl Fixture {
    fn new(source: &str) -> Self {
        let root = std::env::temp_dir().join(format!(
            "wisp-adapter-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir(&root).unwrap();
        fs::write(root.join("source.wisp"), source).unwrap();
        fs::write(
            root.join("suite.json"),
            r#"{"version":1,"target":"f","cases":[]}"#,
        )
        .unwrap();
        fs::write(
            root.join("project.json"),
            r#"{"version":1,"policies":[{"id":"p","source":"source.wisp","suite":"suite.json"}]}"#,
        )
        .unwrap();
        Self(root)
    }
    fn command(&self) -> Command {
        let mut c = Command::new(env!("CARGO_BIN_EXE_wisp"));
        c.args([
            "project",
            "serve",
            self.0.join("project.json").to_str().unwrap(),
        ]);
        c
    }
    fn run(&self, input: &[u8]) -> Output {
        let mut child = self
            .command()
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap();
        // Concurrent writer avoids pipe deadlocks for multi-frame boundary tests.
        let mut stdin = child.stdin.take().unwrap();
        let input = input.to_vec();
        let writer = std::thread::spawn(move || {
            let _ = stdin.write_all(&input);
        });
        let output = child.wait_with_output().unwrap();
        writer.join().unwrap();
        output
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.0).unwrap();
    }
}
fn frames(o: &Output) -> Vec<Value> {
    std::str::from_utf8(&o.stdout)
        .unwrap()
        .lines()
        .map(|s| serde_json::from_str(s).unwrap())
        .collect()
}
fn request() -> Value {
    json!({"id":"one","policy":"p","function":"f","args":["2"]})
}
#[test]
fn typed_calls_no_top_level_execution_and_exact_standalone_report_bytes() {
    let source="record R { z: Int, a: String } fn f(x:R)->R { print(x.a); x } print(999); probe n in 1..=2 { false }";
    let f = Fixture::new(source);
    let args = r#"[ {"z":"9223372036854775807","a":"é😀\n\u0000"} ]"#;
    let input = format!(r#"{{"id":"one","policy":"p","function":"f","args":{args}}}"#);
    let out = f.run(input.as_bytes());
    assert!(out.status.success());
    assert!(out.stderr.is_empty());
    let rows = frames(&out);
    assert_eq!(rows.len(), 2);
    assert_eq!(rows[0]["adapter"]["phase"], "ready");
    let response = &rows[1];
    assert_eq!(response["status"], "Complete");
    assert_eq!(response["report"]["output"], "é😀\n\0\n");
    assert_eq!(response["report"]["probes"], json!([]));
    assert_eq!(response["adapter"]["new_execution"], true);
    assert_eq!(
        response["adapter"]["source_revision"],
        response["report"]["revision"]
    );
    assert_eq!(response["adapter"]["approval"], "not_granted");
    let core = wisp::dispatch(&format!(
        "{{\"op\":\"call\",\"source\":{},\"function\":\"f\",\"args\":{args}}}",
        json!(source)
    ));
    let raw = std::str::from_utf8(&out.stdout)
        .unwrap()
        .lines()
        .nth(1)
        .unwrap();
    assert!(raw.ends_with(&format!("\"report\":{core}}}")));
}
#[test]
fn strict_frames_and_unknown_policy_continue_without_execution() {
    let f = Fixture::new("fn f(x:Int)->Int{x}");
    let mut unknown = request();
    unknown["policy"] = json!("missing");
    let inputs = [
        "{}".to_string(),
        "null".into(),
        " ".into(),
        request()
            .to_string()
            .replace("\"id\":\"one\"", "\"id\":\"one\",\"i\\u0064\":\"two\""),
        unknown.to_string(),
        request().to_string(),
    ];
    let out = f.run(inputs.join("\n").as_bytes());
    assert!(out.status.success());
    let rows = frames(&out);
    assert_eq!(rows.len(), 7);
    for row in &rows[1..6] {
        assert_eq!(row["status"], "Error");
        assert_eq!(row["adapter"]["new_execution"], false);
        assert!(row.get("report").is_none());
    }
    assert_eq!(rows[5]["adapter"]["request_id"], "one");
    assert_eq!(rows[6]["status"], "Complete");
    let mut bad_utf8 = vec![255, b'\n'];
    bad_utf8.extend(request().to_string().as_bytes());
    let out = f.run(&bad_utf8);
    let rows = frames(&out);
    assert!(out.status.success());
    assert_eq!(rows[1]["status"], "Error");
    assert_eq!(rows[2]["status"], "Complete");
}
#[test]
fn typed_errors_faults_unknown_and_later_success_are_distinct() {
    let f = Fixture::new(
        "fn f(x:Int)->Int { if x == 0 { x / 0 } else { if x == 1 { f(x) } else { x } } }",
    );
    let mut requests = Vec::new();
    for arg in [json!(2), json!("0"), json!("1"), json!("2")] {
        let mut q = request();
        q["args"] = json!([arg]);
        requests.push(q.to_string());
    }
    let out = f.run(requests.join("\n").as_bytes());
    let rows = frames(&out);
    assert!(out.status.success());
    for (i, status, executed) in [
        (1, "Error", false),
        (2, "Error", true),
        (3, "Unknown", true),
        (4, "Complete", true),
    ] {
        assert_eq!(rows[i]["status"], status);
        assert_eq!(rows[i]["adapter"]["new_execution"], executed);
    }
    assert!(rows[1]["report"].get("usage").is_none());
    assert_eq!(rows[4]["report"]["result"]["value"], "2");
}
#[test]
fn record_duplicates_reach_core_and_cannot_inject_outer_fields() {
    let f = Fixture::new("record R { a:Int } fn f(x:R)->Int{x.a}");
    let out = f.run(br#"{"id":"one","policy":"p","function":"f","args":[{"a":"2","\u0061":"3"}]}"#);
    let rows = frames(&out);
    assert_eq!(
        rows[1]["report"]["diagnostics"][0]["code"],
        "E_INPUT_FIELD_DUPLICATE"
    );
    assert_eq!(rows[1]["adapter"]["new_execution"], false);
    let out = f.run(br#"{"id":"one","policy":"p","function":"f","args":[],"source":"print(7);"}"#);
    assert_eq!(
        frames(&out)[1]["diagnostics"][0]["code"],
        "ADAPTER_REQUEST_INVALID"
    );
}

#[test]
fn positional_arrays_are_not_objects_and_never_execute_or_echo_ids() {
    let f = Fixture::new("fn f(x:Int)->Int{x}");
    let out = f.run(b"[\"one\",\"p\",\"f\",[\"2\"]]\n");
    assert!(out.status.success());
    let rows = frames(&out);
    assert_eq!(rows[1]["diagnostics"][0]["code"], "ADAPTER_REQUEST_INVALID");
    assert_eq!(rows[1]["adapter"]["new_execution"], false);
    assert!(rows[1].get("report").is_none());
    assert!(rows[1]["adapter"].get("request_id").is_none());
    assert!(rows[1]["adapter"].get("policy_id").is_none());
    for manifest in [
        r#"[1,[{"id":"p","source":"source.wisp","suite":"suite.json"}]]"#,
        r#"{"version":1,"policies":[["p","source.wisp","suite.json"]]}"#,
    ] {
        fs::write(f.0.join("project.json"), manifest).unwrap();
        let out = f.run(b"");
        assert_eq!(out.status.code(), Some(2));
        assert!(out.stdout.is_empty());
    }
}

#[test]
fn envelope_types_id_bounds_and_core_preflight_remain_separate() {
    let f = Fixture::new("fn f(x:Int)->Int{x}");
    let mut requests = Vec::new();
    for field in ["id", "policy", "function"] {
        let mut q = request();
        q[field] = Value::Null;
        requests.push(q);
    }
    for id in ["".to_string(), "é".to_string(), "a".repeat(65)] {
        let mut q = request();
        q["id"] = json!(id);
        requests.push(q);
    }
    let mut q = request();
    q["extra"] = json!(true);
    requests.push(q);
    let mut q = request();
    q["function"] = json!("missing");
    requests.push(q);
    let mut q = request();
    q["args"] = Value::Null;
    requests.push(q);
    let mut q = request();
    q["id"] = json!("a".repeat(64));
    requests.push(q);
    let out = f.run(
        requests
            .iter()
            .map(Value::to_string)
            .collect::<Vec<_>>()
            .join("\r\n")
            .as_bytes(),
    );
    assert!(out.status.success());
    let rows = frames(&out);
    for row in &rows[1..8] {
        assert_eq!(row["diagnostics"][0]["code"], "ADAPTER_REQUEST_INVALID");
        assert!(row.get("report").is_none());
    }
    assert_eq!(
        rows[8]["report"]["diagnostics"][0]["code"],
        "E_INPUT_TARGET"
    );
    assert_eq!(rows[9]["report"]["diagnostics"][0]["code"], "E_INPUT_TYPE");
    assert_eq!(rows[10]["status"], "Complete");
    fs::write(f.0.join("source.wisp"), "fn f(x:Int)->Int{true}").unwrap();
    let out = f.run(request().to_string().as_bytes());
    let rows = frames(&out);
    assert_eq!(rows[0]["status"], "Ready");
    assert_eq!(rows[1]["status"], "Error");
    assert_eq!(rows[1]["adapter"]["new_execution"], false);
}
#[test]
fn ready_snapshot_is_pinned_despite_source_manifest_and_suite_changes() {
    let f = Fixture::new("fn f(x:Int)->Int{x}");
    let mut child = f
        .command()
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let mut stdout = BufReader::new(child.stdout.take().unwrap());
    let mut line = String::new();
    stdout.read_line(&mut line).unwrap();
    let ready: Value = serde_json::from_str(&line).unwrap();
    fs::write(f.0.join("source.wisp"), "fn f(x:Int)->Int{x+1}").unwrap();
    fs::write(f.0.join("project.json"), "null").unwrap();
    fs::write(f.0.join("suite.json"), "null").unwrap();
    let mut stdin = child.stdin.take().unwrap();
    writeln!(stdin, "{}", request()).unwrap();
    stdin.flush().unwrap();
    line.clear();
    stdout.read_line(&mut line).unwrap();
    let response: Value = serde_json::from_str(&line).unwrap();
    assert_eq!(response["report"]["result"]["value"], "2");
    assert_eq!(
        response["adapter"]["manifest_hash"],
        ready["adapter"]["manifest_hash"]
    );
    assert_eq!(
        response["adapter"]["source_revision"],
        ready["adapter"]["policies"][0]["source_revision"]
    );
    assert_eq!(
        response["adapter"]["suite_file_hash"],
        ready["adapter"]["policies"][0]["suite_file_hash"]
    );
    drop(stdin);
    assert!(child.wait().unwrap().success());
}
#[test]
fn line_and_request_caps_are_exact_bounded_and_fail_transport() {
    let f = Fixture::new("fn f(x:Int)->Int{x}");
    let q = request().to_string();
    for (size, code, count) in [(131072, 0, 2), (131073, 2, 1)] {
        let bytes = format!("{}{}\n", q, " ".repeat(size - q.len()));
        let out = f.run(bytes.as_bytes());
        assert_eq!(out.status.code(), Some(code));
        assert_eq!(frames(&out).len(), count);
    }
    // Invalid requests still count: bound session work even without executions.
    let out = f.run("{}\n".repeat(1024).as_bytes());
    assert!(out.status.success());
    assert_eq!(frames(&out).len(), 1025);
    let out = f.run("{}\n".repeat(1025).as_bytes());
    assert_eq!(out.status.code(), Some(2));
    assert_eq!(frames(&out).len(), 1025);
    let out = f.run(b"");
    assert!(out.status.success());
    assert_eq!(frames(&out).len(), 1);
}
