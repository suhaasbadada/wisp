use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Output, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use wisp::DiagnosticCode as C;

fn hash(raw: &str) -> String {
    format!("{:x}", Sha256::digest(raw.as_bytes()))
}
fn request(raw: &str) -> Value {
    serde_json::from_str(&wisp::dispatch(raw)).unwrap()
}
fn validate(source: &str, target: &str, args: &str, limits: Value) -> Value {
    request(&format!(
        r#"{{"op":"validate-call","source":{},"function":{},"args":{args},"limits":{limits}}}"#,
        json!(source),
        json!(target)
    ))
}
fn nonexecuting(r: &Value) {
    assert_eq!(r["output"], "", "{r}");
    assert_eq!(r["probes"], json!([]), "{r}");
    for key in [
        "result",
        "usage",
        "invocation",
        "execution_key",
        "__encoded_call_value",
    ] {
        assert!(r.get(key).is_none(), "unexpected {key}: {r}");
    }
    if let Some(marker) = r.get("input_validation") {
        assert_eq!(marker["contract_version"], 1);
        assert_eq!(marker["new_execution"], false);
        assert!(marker.get("execution_key").is_none());
    }
}
fn validated(r: &Value, target: &str, count: usize, raw: &str) {
    nonexecuting(r);
    assert_eq!(r["status"], "Ready", "{r}");
    assert_eq!(r["compiler"], "wisp-0.1.0-semantics-7");
    assert_eq!(
        r["input_validation"],
        json!({
            "contract_version":1,"phase":"validated","new_execution":false,
            "target":target,"argument_count":count,"argument_hash":hash(raw)
        })
    );
}
fn rejected(r: &Value, status: &str, code: C, path: Option<&str>) {
    nonexecuting(r);
    assert_eq!(r["status"], status, "{r}");
    assert_eq!(r["diagnostics"][0]["code"], code.wire(), "{r}");
    if let Some(path) = path {
        assert_eq!(r["diagnostics"][0]["path"], path);
    }
    if let Some(marker) = r.get("input_validation") {
        assert_eq!(marker["phase"], "preflight");
        assert!(marker.get("argument_count").is_none());
        assert!(marker.get("argument_hash").is_none());
    }
}

#[test]
fn complete_typed_preflight_never_runs_any_language_code_or_spends_runtime_budgets() {
    let limits = json!({"fuel":0,"allocation_bytes":0,"output_bytes":0,
        "call_depth":0,"evaluation_depth":0,"cases":0});
    for source in [
        "fn f(n:Int)->Int {print(n); n / 0} print(1/0); probe n in 0..=0 {1/0==0}",
        "fn f(n:Int)->Int {f(n)} print(9); probe n in 0..=0 {false}",
    ] {
        let r = validate(source, "f", r#"["2"]"#, limits.clone());
        validated(&r, "f", 1, r#"["2"]"#);
        assert_eq!(r["revision"], hash(source));
        for (name, value) in limits.as_object().unwrap() {
            assert_eq!(r["limits"][name], *value);
        }
    }
}

#[test]
fn every_argument_is_checked_before_success_and_lists_remain_bounded() {
    let source = "fn f(xs:[Int])->Int {print(9); 1/0}";
    let mut xs = vec![json!("1"); 1024];
    xs[1023] = json!(false);
    rejected(
        &validate(source, "f", &json!([xs]).to_string(), json!({})),
        "Error",
        C::InputType,
        Some("/args/0/1023"),
    );
    rejected(
        &validate(
            source,
            "f",
            &json!([vec!["1"; 1025]]).to_string(),
            json!({}),
        ),
        "Unknown",
        C::LimitListElements,
        Some("/args/0"),
    );
    validated(&validate(source, "f", "[[]]", json!({})), "f", 1, "[[]]");
}

#[test]
fn shared_raw_decoder_retains_duplicates_numeric_width_and_canonical_int_rules() {
    let source = "record A {x:Int} fn f(a:A)->Int {print(9);a.x}";
    rejected(
        &validate(source, "f", r#"[{"x":"1","\u0078":"2"}]"#, json!({})),
        "Error",
        C::InputFieldDuplicate,
        Some("/args/0/x"),
    );
    rejected(
        &validate(source, "f", r#"[{"x":1e400}]"#, json!({})),
        "Error",
        C::InputType,
        Some("/args/0/x"),
    );
    for bad in ["+1", "01", "-0", " 1", "1.0", "9223372036854775808"] {
        rejected(
            &validate(source, "f", &json!([{"x":bad}]).to_string(), json!({})),
            "Error",
            C::InputIntCanonical,
            Some("/args/0/x"),
        );
    }
    for (raw, code, path) in [
        (r#"[{}]"#, C::InputFieldMissing, "/args/0/x"),
        (
            r#"[{"x":"1","z":"PRIVATE"}]"#,
            C::InputFieldUnknown,
            "/args/0/z",
        ),
    ] {
        rejected(
            &validate(source, "f", raw, json!({})),
            "Error",
            code,
            Some(path),
        );
    }
}

#[test]
fn whole_program_checking_precedes_input_target_arity_and_shape() {
    for source in [
        "fn f()->Int {1} fn unused()->Int {true}",
        "fn f()->Int {1} print(missing);",
        "fn f()->Int {1} probe n in 0..=0 {print(n);true}",
    ] {
        let r = validate(source, "missing", "null", json!({}));
        nonexecuting(&r);
        assert_eq!(r["status"], "Error", "{r}");
        assert_ne!(r["diagnostics"][0]["kind"], "Input");
        assert_eq!(r["input_validation"]["phase"], "preflight");
    }
    let source = "fn f(n:Int)->Int {n}";
    rejected(
        &validate(source, "missing", "null", json!({})),
        "Error",
        C::InputTarget,
        Some("/function"),
    );
    for args in ["[]", r#"["1","2"]"#] {
        rejected(
            &validate(source, "f", args, json!({})),
            "Error",
            C::InputArity,
            Some("/args"),
        );
    }
    rejected(
        &request(&json!({"op":"validate-call","source":source}).to_string()),
        "Error",
        C::InputTarget,
        Some("/function"),
    );
}

#[test]
fn exact_source_and_retained_raw_arguments_determine_metadata_not_function_success() {
    let source = "fn f(s:String)->Int {1/0}";
    for raw in [r#"["PRIVATE"]"#, "[ \n \"PRIVATE\"\t ]"] {
        let r = validate(source, "f", raw, json!({}));
        validated(&r, "f", 1, raw);
        assert_eq!(r["revision"], hash(source));
        assert!(!r.to_string().contains("PRIVATE"));
    }
    let a = validate(source, "f", r#"["x"]"#, json!({}));
    let b = validate(source, "f", r#"[ "x" ]"#, json!({}));
    assert_ne!(
        a["input_validation"]["argument_hash"],
        b["input_validation"]["argument_hash"]
    );
    let r = request(r#"{"op":"validate-call","source":"fn f()->Int {1/0}","function":"f"}"#);
    validated(&r, "f", 0, "[]");
    // RawValue retains whitespace inside the value, not envelope separator whitespace.
    let r = validate(source, "f", " \r\n [ \"x\" ] \t", json!({}));
    validated(&r, "f", 1, "[ \"x\" ]");
    let r = validate(&format!("{source}\n"), "f", r#"["x"]"#, json!({}));
    assert_ne!(a["revision"], r["revision"]);
}

#[test]
fn source_argument_byte_and_json_depth_limits_still_apply() {
    let source = "fn f(x:String)->String {x}";
    rejected(
        &validate(source, "f", r#"[""]"#, json!({"source_bytes":0})),
        "Unknown",
        C::LimitSource,
        None,
    );
    let raw = format!("[\"{}\"]", "x".repeat(65533));
    rejected(
        &validate(source, "f", &raw, json!({})),
        "Unknown",
        C::LimitInputBytes,
        Some("/args"),
    );
    let raw = format!("{}0{}", "[".repeat(18), "]".repeat(18));
    rejected(
        &validate(source, "f", &raw, json!({})),
        "Unknown",
        C::LimitInputDepth,
        Some("/args"),
    );
}

#[test]
fn operation_field_and_presence_policy_matches_call_without_execution() {
    let base = json!({"op":"validate-call","source":"fn f()->Int {1}","function":"f"});
    for field in ["candidate", "suite", "change"] {
        for value in [Value::Null, json!({})] {
            let mut r = base.clone();
            r[field] = value;
            rejected(&request(&r.to_string()), "Error", C::RequestInvalid, None);
        }
    }
    for field in ["ghost", "artifact"] {
        let mut r = base.clone();
        r[field] = json!({"invalid":true});
        rejected(&request(&r.to_string()), "Error", C::RequestInvalid, None);
        r[field] = Value::Null;
        validated(&request(&r.to_string()), "f", 0, "[]");
    }
    for (field, value) in [
        ("function", Value::Null),
        ("limits", Value::Null),
        ("unexpected", json!(1)),
    ] {
        let mut r = base.clone();
        r[field] = value;
        rejected(&request(&r.to_string()), "Error", C::RequestInvalid, None);
    }
    let mut r = base;
    r["args"] = Value::Null;
    rejected(
        &request(&r.to_string()),
        "Error",
        C::InputType,
        Some("/args"),
    );
    rejected(
        &request(r#"{"op":"validate-call","source":"","source":""}"#),
        "Error",
        C::RequestInvalid,
        None,
    );
}

struct Temp(PathBuf);
impl Temp {
    fn new() -> Self {
        static NEXT: AtomicU64 = AtomicU64::new(0);
        let path = std::env::temp_dir().join(format!(
            "wisp-input-validation-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir(&path).unwrap();
        Self(path)
    }
    fn file(&self, name: &str, bytes: impl AsRef<[u8]>) -> String {
        let path = self.0.join(name);
        fs::write(&path, bytes).unwrap();
        path.to_str().unwrap().into()
    }
}
impl Drop for Temp {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.0).unwrap();
    }
}
fn cli(args: &[&str], stdin: &[u8]) -> Output {
    let mut child = Command::new(env!("CARGO_BIN_EXE_wisp"))
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let _ = child.stdin.take().unwrap().write_all(stdin);
    child.wait_with_output().unwrap()
}
fn cli_report(output: Output, code: i32) -> Value {
    assert_eq!(
        output.status.code(),
        Some(code),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert!(output.stderr.is_empty());
    serde_json::from_slice(&output.stdout).unwrap()
}

#[test]
fn native_validate_uses_raw_files_or_either_single_stdin_and_never_mutates_inputs() {
    let temp = Temp::new();
    let source = "fn f(x:Int)->Int {print(x);1/0} print(1/0);";
    let path = temp.file("source.wisp", source);
    let raw = " \r\n [ \"2\" ] \t";
    let input = temp.file("args.json", raw);
    let args = ["validate", &path, "f", "--args-file", &input];
    let r = cli_report(cli(&args, b""), 0);
    validated(&r, "f", 1, "[ \"2\" ]");
    assert_eq!(
        r,
        cli_report(
            cli(
                &["validate", &path, "f", "--args-file", "-"],
                raw.as_bytes()
            ),
            0
        )
    );
    assert_eq!(
        r,
        cli_report(
            cli(
                &["validate", "-", "f", "--args-file", &input],
                source.as_bytes()
            ),
            0
        )
    );
    assert_eq!(fs::read_to_string(&path).unwrap(), source);
    assert_eq!(fs::read_to_string(&input).unwrap(), raw);
    let zero = temp.file("zero.wisp", "fn f()->Int {1/0}");
    validated(
        &cli_report(cli(&["validate", &zero, "f"], b""), 0),
        "f",
        0,
        "[]",
    );
}

#[test]
fn native_semantic_exits_strict_invalid_json_and_legacy_json_exit_are_preserved() {
    let temp = Temp::new();
    let path = temp.file("source.wisp", "record A{x:Int} fn f(a:A)->Int {a.x}");
    for (raw, code) in [
        (r#"[{"x":"1","\u0078":"2"}]"#, C::InputFieldDuplicate),
        (r#"[{"x":1e400}]"#, C::InputType),
        (r#"null,"op":"run"}"#, C::InputType),
        ("[", C::InputType),
    ] {
        let r = cli_report(
            cli(
                &["validate", &path, "f", "--args-file", "-"],
                raw.as_bytes(),
            ),
            1,
        );
        rejected(&r, "Error", code, None);
    }
    let path = temp.file("list.wisp", "fn f(xs:[Int])->Int {1/0}");
    let raw = json!([vec!["1"; 1025]]).to_string();
    rejected(
        &cli_report(
            cli(
                &["validate", &path, "f", "--args-file", "-"],
                raw.as_bytes(),
            ),
            3,
        ),
        "Unknown",
        C::LimitListElements,
        Some("/args/0"),
    );
    let request =
        json!({"op":"validate-call","source":"fn f(x:Int)->Int{x}","function":"f","args":[]})
            .to_string();
    rejected(
        &cli_report(cli(&["--json"], request.as_bytes()), 0),
        "Error",
        C::InputArity,
        Some("/args"),
    );
}

#[test]
fn native_host_errors_are_bounded_utf8_single_physical_stdin_and_usage_failures() {
    let temp = Temp::new();
    let path = temp.file("source.wisp", "fn f()->Int {1}");
    for raw in [vec![b' '; 65537], vec![0xff]] {
        let output = cli(&["validate", &path, "f", "--args-file", "-"], &raw);
        assert_eq!(output.status.code(), Some(2));
        assert!(output.stdout.is_empty());
        assert!(!output.stderr.is_empty());
        let output = cli(&["validate", "-", "f"], &raw);
        assert_eq!(output.status.code(), Some(2));
        assert!(output.stdout.is_empty());
    }
    for args in [
        vec!["validate", "-", "f", "--args-file", "-"],
        vec!["validate", &path],
        vec!["validate"],
        vec!["validate", &path, "f", "--unknown"],
        vec![
            "validate",
            &path,
            "f",
            "--args-file",
            "/no-such-wisp-input-validation-file",
        ],
    ] {
        let output = cli(&args, b"");
        assert_eq!(output.status.code(), Some(2));
        assert!(output.stdout.is_empty());
        assert!(!output.stderr.is_empty());
    }
}

#[test]
fn discovery_advertises_additive_validation_contract_without_changing_interface_or_compiler() {
    assert_eq!(wisp::INPUT_VALIDATION_CONTRACT_VERSION, 1);
    assert_eq!(wisp::INTERFACE_CONTRACT_VERSION, 2);
    let r = request(r#"{"op":"capabilities","source":""}"#);
    assert_eq!(r["capabilities"]["input_validation_contract_version"], 1);
    let op = r["capabilities"]["operations"]
        .as_array()
        .unwrap()
        .iter()
        .find(|op| op["op"] == "validate-call")
        .unwrap();
    assert_eq!(op["required_fields"], json!(["op", "source", "function"]));
    assert_eq!(
        op["optional_fields"],
        json!(["args", "focus", "budget", "limits"])
    );
    let example = r["capabilities"]["examples"]
        .as_array()
        .unwrap()
        .iter()
        .find(|e| e["request"]["op"] == "validate-call")
        .unwrap();
    let report = request(&example["request"].to_string());
    assert_eq!(report["status"], example["expected_status"]);
    nonexecuting(&report);
}
