use serde_json::{json, Value};
use std::{
    fs,
    path::PathBuf,
    process::{Command, Output},
    sync::atomic::{AtomicU64, Ordering},
};
static NEXT: AtomicU64 = AtomicU64::new(0);
struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        let p = std::env::temp_dir().join(format!(
            "wisp-project-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir(&p).unwrap();
        let f = Self(p);
        f.put("source.wisp", "fn f(x:Int)->Int{x}");
        f.put("suite.json", &json!({"version":1,"target":"f","cases":[{"id":"one","args":["2"],"expect":{"result":{"type":"Int","value":"2"},"output":""}}]}).to_string());
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
    fn path(&self) -> String {
        self.0.join("project.json").to_str().unwrap().into()
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.0).unwrap();
    }
}
fn run(args: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_wisp"))
        .args(args)
        .output()
        .unwrap()
}
fn report(args: &[&str], code: i32) -> Value {
    let o = run(args);
    assert_eq!(
        o.status.code(),
        Some(code),
        "{}",
        String::from_utf8_lossy(&o.stderr)
    );
    assert!(o.stderr.is_empty());
    serde_json::from_slice(&o.stdout).unwrap()
}
fn host(args: &[&str]) {
    let o = run(args);
    assert_eq!(o.status.code(), Some(2));
    assert!(o.stdout.is_empty());
    assert!(!o.stderr.is_empty());
}
#[test]
fn shipped_project_workflow_and_no_writes() {
    let before = "examples/policies/project-before.json";
    let after = "examples/policies/project.json";
    let source = fs::read("examples/policies/reservations-after.wisp").unwrap();
    let suite = fs::read("examples/policies/cases.json").unwrap();
    let r = report(&["project", "review", before, after], 0);
    assert_eq!(
        r["project"]["policies"][0]["report"]["review"]["summary"]["changed"],
        2
    );
    assert_eq!(r["project"]["summary"]["attempted_invocations"], 14);
    assert_eq!(r["project"]["approval"], "not_granted");
    report(&["project", "verify", after], 0);
    report(&["project", "verify", before], 1);
    assert_eq!(
        source,
        fs::read("examples/policies/reservations-after.wisp").unwrap()
    );
    assert_eq!(suite, fs::read("examples/policies/cases.json").unwrap());
}
#[test]
fn drift_fails_closed_including_outer_whitespace_and_removed_policies() {
    let a = Fixture::new();
    let b = Fixture::new();
    let original = fs::read_to_string(b.0.join("suite.json")).unwrap();
    for changed in [format!(" {original}"), original.replace("\"2\"", "\"3\"")] {
        b.put("suite.json", &changed);
        let r = report(&["project", "review", &a.path(), &b.path()], 1);
        assert_eq!(r["diagnostics"][0]["code"], "PROJECT_SPEC_DRIFT");
        assert_eq!(r["project"]["new_execution"], false);
        assert_eq!(r["project"]["policies"], json!([]));
    }
    b.put("suite.json", &original);
    b.manifest(json!([{"id":"b","source":"source.wisp","suite":"suite.json"}]));
    assert_eq!(
        report(&["project", "review", &a.path(), &b.path()], 1)["project"]["phase"],
        "preflight"
    );
}
#[test]
fn config_strictness_caps_and_confined_paths() {
    let f = Fixture::new();
    for manifest in [
        "{}",
        "null",
        "{\"version\":1,\"version\":1,\"policies\":[]}",
        "{\"version\":1,\"policies\":[],\"limits\":{}}",
    ] {
        f.put("project.json", manifest);
        host(&["project", "verify", &f.path()]);
    }
    for policies in [
        json!([]),
        json!([{"id":"a","source":"source.wisp","suite":"suite.json","extra":1}]),
        json!([{"id":"é","source":"source.wisp","suite":"suite.json"}]),
        json!([{"id":"a","source":"source.wisp","suite":"suite.json"},{"id":"a","source":"source.wisp","suite":"suite.json"}]),
    ] {
        f.manifest(policies);
        host(&["project", "verify", &f.path()]);
    }
    for path in [
        "../source.wisp",
        "/source.wisp",
        "./source.wisp",
        "x//source.wisp",
        "x/../source.wisp",
        "x\\source.wisp",
        "C:source.wisp",
        "",
    ] {
        f.manifest(json!([{"id":"a","source":path,"suite":"suite.json"}]));
        host(&["project", "verify", &f.path()]);
    }
    f.manifest(json!([{"id":"a","source":"source.wisp","suite":"suite.json"}]));
    f.put("source.wisp", &" ".repeat(65537));
    host(&["project", "verify", &f.path()]);
    fs::write(f.0.join("source.wisp"), [255]).unwrap();
    host(&["project", "verify", &f.path()]);
    host(&["project", "verify", "-"]);
    host(&["project"]);
}
#[test]
fn raw_duplicate_suite_keys_reach_core_and_all_files_load_before_execution() {
    let f = Fixture::new();
    f.put(
        "suite.json",
        r#"{"version":1,"ver\u0073ion":1,"target":"f","cases":[]}"#,
    );
    let r = report(&["project", "verify", &f.path()], 1);
    assert_eq!(r["project"]["new_execution"], false);
    assert_eq!(
        r["project"]["policies"][0]["report"]["diagnostics"][0]["code"],
        "E_REVIEW_REQUEST"
    );
    f.manifest(json!([{"id":"a","source":"source.wisp","suite":"suite.json"},{"id":"z","source":"missing","suite":"suite.json"}]));
    host(&["project", "verify", &f.path()]);
}
#[test]
fn sorted_rows_continue_after_faults_and_aggregate_precedence() {
    let f = Fixture::new();
    f.put("bad.wisp", "fn f(x:Int)->Int{x/0}");
    f.put("unknown.wisp", "fn f(x:Int)->Int{f(x)}");
    f.manifest(json!([{"id":"z","source":"source.wisp","suite":"suite.json"},{"id":"m","source":"unknown.wisp","suite":"suite.json"},{"id":"a","source":"bad.wisp","suite":"suite.json"}]));
    let r = report(&["project", "verify", &f.path()], 1);
    assert_eq!(r["status"], "Error");
    assert_eq!(r["project"]["summary"]["attempted_invocations"], 6);
    assert_eq!(r["project"]["policies"][0]["id"], "a");
    assert_eq!(r["project"]["policies"][2]["report"]["status"], "Pass");
    f.manifest(json!([{"id":"a","source":"unknown.wisp","suite":"suite.json"}]));
    assert_eq!(
        report(&["project", "verify", &f.path()], 3)["status"],
        "Unknown"
    );
}

#[test]
fn maximum_project_bounds_and_per_policy_semantic_preflight() {
    let f = Fixture::new();
    let cases: Vec<_> = (0..16).map(|i| json!({"id":format!("c{i}"),"args":["2"],"expect":{"result":{"type":"Int","value":"2"},"output":""}})).collect();
    f.put(
        "suite.json",
        &json!({"version":1,"target":"f","cases":cases}).to_string(),
    );
    let policies: Vec<_> = (0..8)
        .map(|i| json!({"id":format!("p{i}"),"source":"source.wisp","suite":"suite.json"}))
        .collect();
    f.manifest(json!(policies));
    let r = report(&["project", "verify", &f.path()], 0);
    assert_eq!(r["project"]["summary"]["attempted_invocations"], 256);
    let mut too_many = policies;
    too_many.push(json!({"id":"extra","source":"source.wisp","suite":"suite.json"}));
    f.manifest(json!(too_many));
    host(&["project", "verify", &f.path()]);
    f.put("bad.wisp", "fn f(x:Int)->Int{true}");
    f.manifest(json!([{"id":"a","source":"source.wisp","suite":"suite.json"},{"id":"z","source":"bad.wisp","suite":"suite.json"}]));
    let r = report(&["project", "verify", &f.path()], 1);
    assert_eq!(r["project"]["summary"]["attempted_invocations"], 32);
    assert_eq!(
        r["project"]["policies"][1]["report"]["review"]["phase"],
        "preflight"
    );
    assert_eq!(
        r["project"]["policies"][1]["report"]["review"]["new_execution"],
        false
    );
}

#[test]
fn exact_file_byte_caps_and_identity_parity_with_standalone_review() {
    let f = Fixture::new();
    let original = fs::read_to_string(f.0.join("suite.json")).unwrap();
    let padded = format!("{}{}", original, " ".repeat(65536 - original.len()));
    f.put("suite.json", &padded);
    let r = report(&["project", "verify", &f.path()], 0);
    let direct = report(
        &[
            "verify",
            f.0.join("source.wisp").to_str().unwrap(),
            "--suite",
            f.0.join("suite.json").to_str().unwrap(),
        ],
        0,
    );
    assert_eq!(r["project"]["policies"][0]["report"], direct);
    f.put("suite.json", &(padded + " "));
    host(&["project", "verify", &f.path()]);
    f.put("suite.json", &original);
    let m = fs::read_to_string(f.0.join("project.json")).unwrap();
    f.put(
        "project.json",
        &format!("{}{}", m, " ".repeat(16384 - m.len())),
    );
    report(&["project", "verify", &f.path()], 0);
    f.put(
        "project.json",
        &format!("{}{}", m, " ".repeat(16385 - m.len())),
    );
    host(&["project", "verify", &f.path()]);
}

#[test]
fn bare_manifest_dash_references_are_files_never_stdin() {
    use std::io::Write;
    use std::process::Stdio;
    let f = Fixture::new();
    for source_dash in [true, false] {
        if source_dash {
            f.put("-", "fn f(x:Int)->Int{x}");
            f.manifest(json!([{"id":"a","source":"-","suite":"suite.json"}]));
        } else {
            f.put("-", &fs::read_to_string(f.0.join("suite.json")).unwrap());
            f.manifest(json!([{"id":"a","source":"source.wisp","suite":"-"}]));
        }
        let mut child = Command::new(env!("CARGO_BIN_EXE_wisp"))
            .current_dir(&f.0)
            .args(["project", "verify", "project.json"])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap();
        child
            .stdin
            .take()
            .unwrap()
            .write_all(b"not the saved file")
            .unwrap();
        let output = child.wait_with_output().unwrap();
        assert_eq!(
            output.status.code(),
            Some(0),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        let r: Value = serde_json::from_slice(&output.stdout).unwrap();
        assert_eq!(r["status"], "Pass");
        assert_eq!(r["project"]["summary"]["attempted_invocations"], 2);
    }
}
#[cfg(unix)]
#[test]
fn rejects_symlink_files_directories_and_nonregular_files() {
    use std::os::unix::fs::symlink;
    let f = Fixture::new();
    let other = Fixture::new();
    symlink(other.0.join("source.wisp"), f.0.join("linked.wisp")).unwrap();
    symlink(&other.0, f.0.join("linked-dir")).unwrap();
    for path in [
        "linked.wisp",
        "linked-dir/source.wisp",
        "linked-dir",
        "source.wisp/child",
    ] {
        f.manifest(json!([{"id":"a","source":path,"suite":"suite.json"}]));
        host(&["project", "verify", &f.path()]);
    }
    symlink(other.0.join("project.json"), f.0.join("linked.json")).unwrap();
    host(&[
        "project",
        "verify",
        f.0.join("linked.json").to_str().unwrap(),
    ]);
}
