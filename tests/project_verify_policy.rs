use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::PathBuf,
    process::{Command, Output},
    sync::atomic::{AtomicU64, Ordering},
};

static NEXT: AtomicU64 = AtomicU64::new(0);
const SOURCE: &str = "fn f(x:Int)->Int{x}";
const SUITE: &str = r#"{"version":1,"target":"f","cases":[{"id":"one","args":["2"],"expect":{"result":{"type":"Int","value":"2"},"output":""}}]}"#;

struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!(
            "wisp-project-verify-policy-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir(&path).unwrap();
        let f = Self(path);
        f.put("source.wisp", SOURCE);
        f.put("suite.json", SUITE);
        f.manifest(json!([{"id":"a","source":"source.wisp","suite":"suite.json"}]));
        f
    }
    fn put(&self, path: &str, text: &str) {
        fs::write(self.0.join(path), text).unwrap();
    }
    fn manifest(&self, policies: Value) {
        self.put(
            "project.json",
            &json!({"version":1,"policies":policies}).to_string(),
        );
    }
    fn run(&self, policy: &str, options: &[&str]) -> Output {
        Command::new(env!("CARGO_BIN_EXE_wisp"))
            .args(["project", "verify-policy"])
            .arg(self.0.join("project.json"))
            .arg(policy)
            .args(options)
            .output()
            .unwrap()
    }
    fn report(&self, options: &[&str], code: i32) -> Value {
        decode(self.run("a", options), code)
    }
    fn pins(&self) -> Vec<String> {
        vec![
            "--expected-manifest".into(),
            self.file_hash("project.json"),
            "--expected-revision".into(),
            self.file_hash("source.wisp"),
            "--expected-suite".into(),
            self.file_hash("suite.json"),
            "--expected-compiler".into(),
            wisp::COMPILER.into(),
        ]
    }
    fn file_hash(&self, name: &str) -> String {
        format!("{:x}", Sha256::digest(fs::read(self.0.join(name)).unwrap()))
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.0).unwrap();
    }
}
fn decode(output: Output, code: i32) -> Value {
    assert_eq!(
        output.status.code(),
        Some(code),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert!(output.stderr.is_empty());
    let r: Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(r["output"], "");
    assert_eq!(r["project"]["approval"], "not_granted");
    assert_eq!(r["project"]["mode"], "verify-policy");
    assert_eq!(r["project"]["contract_version"], 1);
    r
}
fn host(output: Output) {
    assert_eq!(output.status.code(), Some(2));
    assert!(output.stdout.is_empty());
    assert!(!output.stderr.is_empty());
}
fn core(source: &str, suite: &str) -> Value {
    serde_json::from_str(&wisp::dispatch(&format!(
        "{{\"op\":\"review\",\"source\":{},\"candidate\":{},\"suite\":{suite}}}",
        json!(source),
        json!(source)
    )))
    .unwrap()
}
fn parity(f: &Fixture, source: &str, suite: &str, status: &str, code: i32) -> Value {
    f.put("source.wisp", source);
    f.put("suite.json", suite);
    let r = f.report(&[], code);
    assert_eq!(r["report"], core(source, suite));
    assert_eq!(r["status"], status);
    assert_eq!(r["status"], r["report"]["status"]);
    assert_eq!(
        r["project"]["new_execution"],
        r["report"]["review"]["new_execution"] == true
    );
    assert_eq!(r["project"]["phase"], "verified");
    assert_eq!(r["project"]["guard_status"], "not_requested");
    assert_eq!(r["diagnostics"], json!([]));
    r
}

#[test]
fn pass_fail_runtime_error_and_unknown_preserve_entire_shared_report_and_exit() {
    let f = Fixture::new();
    for (source, status, code) in [
        (SOURCE, "Pass", 0),
        ("fn f(x:Int)->Int{x+1}", "Fail", 1),
        ("fn f(x:Int)->Int{x/0}", "Error", 1),
        ("fn f(x:Int)->Int{f(x)}", "Unknown", 3),
    ] {
        let r = parity(&f, source, SUITE, status, code);
        assert_eq!(r["project"]["new_execution"], true);
        assert_eq!(r["report"]["review"]["summary"]["attempted_invocations"], 2);
        let direct = Command::new(env!("CARGO_BIN_EXE_wisp"))
            .arg("verify")
            .arg(f.0.join("source.wisp"))
            .arg("--suite")
            .arg(f.0.join("suite.json"))
            .output()
            .unwrap();
        assert_eq!(direct.status.code(), Some(code));
        assert_eq!(
            r["report"],
            serde_json::from_slice::<Value>(&direct.stdout).unwrap()
        );
    }
}

#[test]
fn preflight_errors_unknown_and_case_bounds_retain_no_execution_markers() {
    let f = Fixture::new();
    for (source, suite, status, code) in [
        ("fn f(", SUITE, "Error", 1),
        ("fn f(x:Int)->Int{true}", SUITE, "Error", 1),
        (SOURCE, "null", "Error", 1),
        (
            SOURCE,
            r#"{"version":1,"target":"f","cases":[]}"#,
            "Error",
            1,
        ),
    ] {
        let r = parity(&f, source, suite, status, code);
        assert_eq!(r["project"]["new_execution"], false);
    }
    let nested = format!(
        "fn f(x:Int)->Int{{{}x{}}}",
        "(".repeat(1000),
        ")".repeat(1000)
    );
    assert_eq!(
        parity(&f, &nested, SUITE, "Unknown", 3)["project"]["new_execution"],
        false
    );
    for count in [16, 17] {
        let cases: Vec<_> = (0..count).map(|i| json!({"id":format!("c{i}"),"args":["2"],"expect":{"result":{"type":"Int","value":"2"},"output":""}})).collect();
        let suite = json!({"version":1,"target":"f","cases":cases}).to_string();
        let r = parity(
            &f,
            SOURCE,
            &suite,
            if count == 16 { "Pass" } else { "Unknown" },
            if count == 16 { 0 } else { 3 },
        );
        assert_eq!(r["project"]["new_execution"], count == 16);
        if count == 16 {
            assert_eq!(
                r["report"]["review"]["summary"]["attempted_invocations"],
                32
            );
        }
    }
}

#[test]
fn only_selected_policy_is_checked_all_sorted_pins_are_exposed_and_files_unchanged() {
    let f = Fixture::new();
    // Top-level execution and probes must not run during saved-suite review.
    let source = "fn f(x:Int)->Int{x} print(1/0); probe n in 0..=0 { f(n)==0 }";
    f.put("source.wisp", source);
    f.put("other.wisp", "fn broken(");
    f.put("other.json", "null");
    f.manifest(json!([{"id":"z","source":"other.wisp","suite":"other.json"},{"id":"a","source":"source.wisp","suite":"suite.json"}]));
    let names = [
        "source.wisp",
        "suite.json",
        "other.wisp",
        "other.json",
        "project.json",
    ];
    let before: Vec<_> = names
        .iter()
        .map(|n| fs::read(f.0.join(n)).unwrap())
        .collect();
    let r = f.report(&[], 0);
    assert_eq!(r["report"], core(source, SUITE));
    assert_eq!(r["report"]["output"], "");
    assert_eq!(r["report"]["probes"], json!([]));
    assert_eq!(r["project"]["manifest_hash"], f.file_hash("project.json"));
    assert_eq!(r["project"]["policy_id"], "a");
    assert_eq!(r["project"]["source_revision"], f.file_hash("source.wisp"));
    assert_eq!(r["project"]["suite_file_hash"], f.file_hash("suite.json"));
    assert_eq!(
        r["project"]["policies"],
        json!([
            {"id":"a","source_revision":f.file_hash("source.wisp"),"suite_file_hash":f.file_hash("suite.json")},
            {"id":"z","source_revision":f.file_hash("other.wisp"),"suite_file_hash":f.file_hash("other.json")}
        ])
    );
    for (name, bytes) in names.iter().zip(before) {
        assert_eq!(fs::read(f.0.join(name)).unwrap(), bytes);
    }
    assert_eq!(fs::read_dir(&f.0).unwrap().count(), names.len());
    // Not even the selected review may start until every snapshot has loaded.
    f.put("other.json", "{");
    host(f.run("a", &[]));
}

#[test]
fn matching_pins_and_all_four_mismatches_precede_semantic_preflight() {
    let f = Fixture::new();
    let pins = f.pins();
    let refs: Vec<_> = pins.iter().map(String::as_str).collect();
    assert_eq!(f.report(&refs, 0)["project"]["guard_status"], "matched");
    // Reject drift even when source and saved cases cannot pass preflight.
    f.put("source.wisp", "fn f(");
    f.put("suite.json", "null");
    let pins = f.pins();
    for index in [1, 3, 5, 7] {
        let mut changed = pins.clone();
        changed[index] = if index == 7 {
            "other-compiler".into()
        } else {
            "0".repeat(64)
        };
        let r = f.report(&changed.iter().map(String::as_str).collect::<Vec<_>>(), 1);
        assert_eq!(r["project"]["phase"], "guard");
        assert_eq!(r["project"]["guard_status"], "rejected");
        assert_eq!(r["project"]["new_execution"], false);
        assert_eq!(r["diagnostics"][0]["code"], "PROJECT_SNAPSHOT_DRIFT");
        assert!(r["report"].is_null());
    }
    let refs: Vec<_> = pins.iter().map(String::as_str).collect();
    let r = f.report(&refs, 1);
    assert_eq!(r["project"]["guard_status"], "matched");
    assert_eq!(r["project"]["phase"], "verified");
    assert_eq!(r["report"], core("fn f(", "null"));
}

#[test]
fn full_suite_bytes_not_json_value_are_guarded() {
    let f = Fixture::new();
    f.put("suite.json", &format!(" \n{SUITE} \n"));
    let pins = f.pins();
    let refs: Vec<_> = pins.iter().map(String::as_str).collect();
    let r = f.report(&refs, 0);
    assert_eq!(r["project"]["suite_file_hash"], f.file_hash("suite.json"));
    assert_eq!(r["report"], core(SOURCE, SUITE));
    f.put("suite.json", SUITE);
    let r = f.report(&refs, 1);
    assert_eq!(r["project"]["guard_status"], "rejected");
    assert!(r["report"].is_null());
}

#[test]
fn raw_duplicates_and_numeric_tokens_reach_shared_decoder_without_roundtrip() {
    let f = Fixture::new();
    for suite in [
        SUITE.replacen("\"version\":1", "\"version\":1,\"ver\\u0073ion\":1", 1),
        SUITE.replacen("\"version\":1", "\"version\":1.0", 1),
        SUITE.replacen("\"version\":1", "\"version\":1e0", 1),
        SUITE.replacen("\"version\":1", "\"version\":18446744073709551616", 1),
        SUITE.replace("\"args\":[\"2\"]", "\"args\":[2.0]"),
    ] {
        let r = parity(&f, SOURCE, &suite, "Error", 1);
        assert_eq!(r["project"]["new_execution"], false);
        assert_eq!(
            r["report"]["diagnostics"][0]["code"],
            if suite.contains("[2.0]") {
                "E_INPUT_TYPE"
            } else {
                "E_REVIEW_REQUEST"
            }
        );
    }
}

#[test]
fn unknown_policy_never_evaluates_supplied_guard() {
    let f = Fixture::new();
    let mut pins = f.pins();
    pins[1] = "0".repeat(64);
    for options in [vec![], pins.iter().map(String::as_str).collect()] {
        let r = decode(f.run("absent", &options), 1);
        assert_eq!(r["diagnostics"][0]["code"], "PROJECT_POLICY_UNKNOWN");
        assert_eq!(
            r["project"]["guard_status"],
            if options.is_empty() {
                "not_requested"
            } else {
                "not_evaluated"
            }
        );
        assert_eq!(r["project"]["phase"], "selector");
        assert_eq!(r["project"]["new_execution"], false);
        assert!(r["project"]["source_revision"].is_null());
        assert!(r["project"]["suite_file_hash"].is_null());
        assert!(r["report"].is_null());
    }
}

#[test]
fn malformed_options_fail_usage_before_any_file_access() {
    let f = Fixture::new();
    let pins = f.pins();
    fs::remove_file(f.0.join("project.json")).unwrap();
    let mut malformed: Vec<Vec<String>> = vec![
        vec!["--budget".into(), "1".into()],
        vec!["--limits".into(), "1".into()],
        vec!["extra".into()],
        vec!["--expected-manifest".into()],
    ];
    for slot in 0..4 {
        malformed.push(pins[slot * 2..slot * 2 + 2].to_vec());
        let mut duplicate = pins.clone();
        duplicate.extend_from_slice(&pins[slot * 2..slot * 2 + 2]);
        malformed.push(duplicate);
        for bad in ["", "--flag"] {
            let mut invalid = pins.clone();
            invalid[slot * 2 + 1] = bad.into();
            malformed.push(invalid);
        }
    }
    for slot in [1, 3, 5] {
        for bad in [
            "A".repeat(64),
            "g".repeat(64),
            "a".repeat(63),
            "a".repeat(65),
        ] {
            let mut invalid = pins.clone();
            invalid[slot] = bad;
            malformed.push(invalid);
        }
    }
    for options in malformed {
        let o = f.run("a", &options.iter().map(String::as_str).collect::<Vec<_>>());
        assert!(String::from_utf8_lossy(&o.stderr).starts_with("usage: wisp"));
        host(o);
    }
    for policy in ["", "é", "a/b", &"a".repeat(65)] {
        let o = f.run(policy, &[]);
        assert!(String::from_utf8_lossy(&o.stderr).starts_with("usage: wisp"));
        host(o);
    }
    for manifest in ["", "-", "--flag"] {
        host(
            Command::new(env!("CARGO_BIN_EXE_wisp"))
                .args(["project", "verify-policy", manifest, "a"])
                .output()
                .unwrap(),
        );
    }
}

#[test]
fn bounded_confined_loader_is_reused_for_all_snapshots() {
    let f = Fixture::new();
    for path in [
        "../source.wisp",
        "./source.wisp",
        "/source.wisp",
        "x//source.wisp",
        "x\\source.wisp",
        "C:source.wisp",
    ] {
        f.manifest(json!([{"id":"a","source":path,"suite":"suite.json"}]));
        host(f.run("a", &[]));
    }
    f.manifest(json!([{"id":"a","source":"source.wisp","suite":"suite.json"}]));
    for (name, cap) in [
        ("source.wisp", wisp::SOURCE_BYTES),
        ("suite.json", wisp::REVIEW_BYTES),
        ("project.json", 16384),
    ] {
        let old = fs::read(f.0.join(name)).unwrap();
        let mut padded = old.clone();
        padded.resize(cap, b' ');
        fs::write(f.0.join(name), &padded).unwrap();
        f.report(&[], 0);
        padded.push(b' ');
        fs::write(f.0.join(name), padded).unwrap();
        host(f.run("a", &[]));
        fs::write(f.0.join(name), old).unwrap();
    }
    f.manifest(json!([{"id":"a","source":"source.wisp","suite":"suite.json"},{"id":"z","source":"missing.wisp","suite":"suite.json"}]));
    host(f.run("a", &[]));
}

#[cfg(unix)]
#[test]
fn symlinks_are_rejected_for_manifest_files_and_components() {
    use std::os::unix::fs::symlink;
    for name in ["source.wisp", "suite.json", "project.json"] {
        let f = Fixture::new();
        fs::rename(f.0.join(name), f.0.join("real")).unwrap();
        symlink("real", f.0.join(name)).unwrap();
        host(f.run("a", &[]));
    }
    let f = Fixture::new();
    fs::create_dir(f.0.join("real")).unwrap();
    f.put("real/source.wisp", SOURCE);
    symlink("real", f.0.join("link")).unwrap();
    f.manifest(json!([{"id":"a","source":"link/source.wisp","suite":"suite.json"}]));
    host(f.run("a", &[]));
}
