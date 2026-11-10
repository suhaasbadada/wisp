use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Write,
    path::PathBuf,
    process::{Command, Output, Stdio},
    sync::atomic::{AtomicU64, Ordering},
};

static NEXT: AtomicU64 = AtomicU64::new(0);
const SOURCE: &str = "fn f(x:Int)->Int{x}";
const SUITE: &str = r#"{"version":1,"target":"f","cases":[{"id":"one","args":["2"],"expect":{"result":{"type":"Int","value":"2"},"output":""}}]}"#;

fn hash(text: &str) -> String {
    format!("{:x}", Sha256::digest(text.as_bytes()))
}
struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!(
            "wisp-project-review-candidate-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir(&path).unwrap();
        let f = Self(path);
        f.put("source.wisp", SOURCE);
        f.put("suite.json", SUITE);
        f.put("candidate.wisp", SOURCE);
        f.manifest(json!([{"id":"a","source":"source.wisp","suite":"suite.json"}]));
        f
    }
    fn put(&self, name: &str, text: &str) {
        fs::write(self.0.join(name), text).unwrap();
    }
    fn manifest(&self, policies: Value) {
        self.put(
            "project.json",
            &json!({"version":1,"policies":policies}).to_string(),
        );
    }
    fn command(&self, policy: &str, options: &[&str]) -> Command {
        let mut c = Command::new(env!("CARGO_BIN_EXE_wisp"));
        c.current_dir(&self.0)
            .args(["project", "review-candidate", "project.json", policy])
            .args(options);
        c
    }
    fn options(&self) -> Vec<String> {
        vec![
            "--candidate-file".into(),
            "candidate.wisp".into(),
            "--expected-candidate".into(),
            self.file_hash("candidate.wisp"),
        ]
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
    fn run(&self, policy: &str, options: &[String]) -> Output {
        self.command(
            policy,
            &options.iter().map(String::as_str).collect::<Vec<_>>(),
        )
        .output()
        .unwrap()
    }
    fn report(&self, code: i32) -> Value {
        decode(self.run("a", &self.options()), code)
    }
    fn file_hash(&self, name: &str) -> String {
        hash(&fs::read_to_string(self.0.join(name)).unwrap())
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.0).unwrap();
    }
}
fn decode(o: Output, code: i32) -> Value {
    assert_eq!(
        o.status.code(),
        Some(code),
        "{}",
        String::from_utf8_lossy(&o.stderr)
    );
    assert!(o.stderr.is_empty());
    let r: Value = serde_json::from_slice(&o.stdout).unwrap();
    assert_eq!(r["output"], "");
    assert_eq!(r["project"]["approval"], "not_granted");
    assert_eq!(r["project"]["mode"], "review-candidate");
    assert_eq!(r["project"]["contract_version"], 1);
    r
}
fn host(o: Output) {
    assert_eq!(o.status.code(), Some(2));
    assert!(o.stdout.is_empty());
    assert!(!o.stderr.is_empty());
}
fn core(before: &str, candidate: &str, suite: &str) -> Value {
    serde_json::from_str(&wisp::dispatch(&format!(
        "{{\"op\":\"review\",\"source\":{},\"candidate\":{},\"suite\":{suite}}}",
        json!(before),
        json!(candidate)
    )))
    .unwrap()
}
fn parity(
    f: &Fixture,
    before: &str,
    candidate: &str,
    suite: &str,
    status: &str,
    code: i32,
) -> Value {
    f.put("source.wisp", before);
    f.put("candidate.wisp", candidate);
    f.put("suite.json", suite);
    let r = f.report(code);
    assert_eq!(r["report"], core(before, candidate, suite));
    let direct = Command::new(env!("CARGO_BIN_EXE_wisp"))
        .current_dir(&f.0)
        .args([
            "review",
            "source.wisp",
            "candidate.wisp",
            "--suite",
            "suite.json",
        ])
        .output()
        .unwrap();
    assert_eq!(direct.status.code(), Some(code));
    assert_eq!(
        r["report"],
        serde_json::from_slice::<Value>(&direct.stdout).unwrap()
    );
    assert_eq!(r["status"], status);
    assert_eq!(r["project"]["phase"], "reviewed");
    assert_eq!(r["project"]["guard_status"], "not_requested");
    assert_eq!(r["project"]["candidate_revision"], hash(candidate));
    assert_eq!(
        r["project"]["new_execution"],
        r["report"]["review"]["new_execution"] == true
    );
    assert_eq!(r["diagnostics"], json!([]));
    r
}

#[test]
fn improving_candidate_regression_fault_unknown_and_exact_inner_parity() {
    let f = Fixture::new();
    for (before, candidate, status, code) in [
        ("fn f(x:Int)->Int{x+1}", SOURCE, "Pass", 0),
        (SOURCE, "fn f(x:Int)->Int{x+1}", "Fail", 1),
        (SOURCE, "fn f(x:Int)->Int{x/0}", "Error", 1),
        (SOURCE, "fn f(x:Int)->Int{f(x)}", "Unknown", 3),
    ] {
        let r = parity(&f, before, candidate, SUITE, status, code);
        assert_eq!(r["project"]["new_execution"], true);
        assert_eq!(r["report"]["revision"], hash(before));
        assert_eq!(r["report"]["review"]["baseline_revision"], hash(before));
        assert_eq!(r["report"]["review"]["candidate_revision"], hash(candidate));
        assert_eq!(r["report"]["review"]["summary"]["attempted_invocations"], 2);
        if status == "Pass" {
            assert_eq!(r["report"]["review"]["cases"][0]["comparison"], "Changed");
        }
    }
}

#[test]
fn semantic_preflight_is_shared_and_does_not_claim_execution() {
    let f = Fixture::new();
    for (candidate, suite) in [
        ("fn f(", SUITE),
        (SOURCE, "null"),
        (SOURCE, r#"{"version":1,"target":"f","cases":[]}"#),
    ] {
        let r = parity(&f, SOURCE, candidate, suite, "Error", 1);
        assert_eq!(r["project"]["new_execution"], false);
    }
    let nested = format!(
        "fn f(x:Int)->Int{{{}x{}}}",
        "(".repeat(1000),
        ")".repeat(1000)
    );
    let r = parity(&f, SOURCE, &nested, SUITE, "Unknown", 3);
    assert_eq!(r["project"]["new_execution"], false);
}

#[test]
fn every_project_pin_mismatch_preempts_missing_candidate_and_open_stdin() {
    let f = Fixture::new();
    for slot in [1, 3, 5, 7] {
        let mut pins = f.pins();
        pins[slot] = if slot == 7 {
            "other-compiler".into()
        } else {
            "0".repeat(64)
        };
        for path in ["missing", "-"] {
            let mut options = f.options();
            options[1] = path.into();
            options.extend(pins.clone());
            let mut child = f
                .command("a", &options.iter().map(String::as_str).collect::<Vec<_>>())
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
                .unwrap();
            let open_stdin = child.stdin.take().unwrap();
            let r = decode(child.wait_with_output().unwrap(), 1);
            drop(open_stdin);
            assert_eq!(r["project"]["phase"], "guard");
            assert_eq!(r["project"]["guard_status"], "rejected");
            assert_eq!(r["project"]["new_execution"], false);
            assert!(r["project"]["candidate_revision"].is_null());
            assert!(r["report"].is_null());
            assert_eq!(r["diagnostics"][0]["code"], "PROJECT_SNAPSHOT_DRIFT");
        }
    }
    let mut options = f.options();
    options.extend(f.pins());
    assert_eq!(
        decode(f.run("a", &options), 0)["project"]["guard_status"],
        "matched"
    );
}

#[test]
fn candidate_drift_preempts_all_core_preflight_and_binds_exact_utf8_bytes() {
    let f = Fixture::new();
    f.put("source.wisp", "fn f(");
    f.put("suite.json", "null");
    let mut options = f.options();
    options[3] = "0".repeat(64);
    let r = decode(f.run("a", &options), 1);
    assert_eq!(r["project"]["phase"], "candidate");
    assert_eq!(r["project"]["candidate_revision"], hash(SOURCE));
    assert_eq!(r["project"]["new_execution"], false);
    assert!(r["report"].is_null());
    assert_eq!(r["diagnostics"][0]["code"], "PROJECT_CANDIDATE_DRIFT");
    assert_eq!(r["diagnostics"][0]["kind"], "Project");
    assert!(!r.to_string().contains("fn f"));
    assert!(r.get("cases").is_none());
    f.put("source.wisp", SOURCE);
    f.put("suite.json", SUITE);
    let candidate = format!(" \n{SOURCE} // café\n");
    f.put("candidate.wisp", &candidate);
    let mut options = f.options();
    options[3] = hash(SOURCE);
    assert_eq!(
        decode(f.run("a", &options), 1)["project"]["candidate_revision"],
        hash(&candidate)
    );
    let r = f.report(0);
    assert_eq!(r["report"], core(SOURCE, &candidate, SUITE));
}

#[test]
fn candidate_stdin_is_actual_bounded_utf8_transport() {
    let f = Fixture::new();
    let candidate = "fn f(x:Int)->Int{x+1}\n";
    let mut options = f.options();
    options[1] = "-".into();
    options[3] = hash(candidate);
    let mut child = f
        .command("a", &options.iter().map(String::as_str).collect::<Vec<_>>())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    child
        .stdin
        .take()
        .unwrap()
        .write_all(candidate.as_bytes())
        .unwrap();
    let r = decode(child.wait_with_output().unwrap(), 1);
    assert_eq!(r["report"], core(SOURCE, candidate, SUITE));
    assert_eq!(r["project"]["candidate_revision"], hash(candidate));
    for bytes in [vec![b' '; wisp::SOURCE_BYTES + 1], vec![0xff]] {
        let mut child = f
            .command("a", &options.iter().map(String::as_str).collect::<Vec<_>>())
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap();
        child.stdin.take().unwrap().write_all(&bytes).unwrap();
        host(child.wait_with_output().unwrap());
    }
}

#[test]
fn unknown_policy_keeps_shared_selector_behavior_and_never_reads_candidate() {
    let f = Fixture::new();
    for guarded in [false, true] {
        let mut options = f.options();
        options[1] = "missing".into();
        if guarded {
            options.extend(f.pins());
        }
        let r = decode(f.run("absent", &options), 1);
        assert_eq!(r["project"]["phase"], "selector");
        assert_eq!(
            r["project"]["guard_status"],
            if guarded {
                "not_evaluated"
            } else {
                "not_requested"
            }
        );
        assert_eq!(r["diagnostics"][0]["code"], "PROJECT_POLICY_UNKNOWN");
        assert_eq!(r["project"]["new_execution"], false);
        for key in ["source_revision", "suite_file_hash", "candidate_revision"] {
            assert!(r["project"][key].is_null());
        }
        assert!(r["report"].is_null());
    }
}

#[test]
fn all_command_syntax_is_validated_before_project_io() {
    let f = Fixture::new();
    let valid = f.options();
    let pins = f.pins();
    fs::remove_file(f.0.join("project.json")).unwrap();
    let mut invalid = vec![vec![], valid[..2].to_vec(), valid[2..].to_vec()];
    for flag in [
        "--budget",
        "--limits",
        "--suite",
        "--source",
        "--out",
        "--function",
        "--expected-body",
        "--unknown",
    ] {
        let mut v = valid.clone();
        v.extend([flag.into(), "1".into()]);
        invalid.push(v);
    }
    for slot in [0, 2] {
        let mut v = valid.clone();
        v.extend_from_slice(&valid[slot..slot + 2]);
        invalid.push(v);
        for bad in ["", "--flag"] {
            let mut v = valid.clone();
            v[slot + 1] = bad.into();
            invalid.push(v);
        }
    }
    for bad in [
        "A".repeat(64),
        "g".repeat(64),
        "a".repeat(63),
        "a".repeat(65),
        "-".into(),
    ] {
        let mut v = valid.clone();
        v[3] = bad;
        invalid.push(v);
    }
    for slot in 0..4 {
        let mut v = valid.clone();
        v.extend_from_slice(&pins[slot * 2..slot * 2 + 2]);
        invalid.push(v);
        let mut v = valid.clone();
        v.extend(pins.clone());
        v.extend_from_slice(&pins[slot * 2..slot * 2 + 2]);
        invalid.push(v);
    }
    for slot in [1, 3, 5] {
        let mut v = valid.clone();
        let mut p = pins.clone();
        p[slot] = "A".repeat(64);
        v.extend(p);
        invalid.push(v);
    }
    let mut v = valid.clone();
    v.push("--expected-candidate".into());
    invalid.push(v);
    for options in invalid {
        let o = f.run("a", &options);
        assert!(String::from_utf8_lossy(&o.stderr).starts_with("usage: wisp"));
        host(o);
    }
    for policy in ["", "é", "a/b", &"a".repeat(65)] {
        let o = f.run(policy, &valid);
        assert!(String::from_utf8_lossy(&o.stderr).starts_with("usage: wisp"));
        host(o);
    }
    for manifest in ["", "-", "--flag"] {
        host(
            Command::new(env!("CARGO_BIN_EXE_wisp"))
                .args(["project", "review-candidate", manifest, "a"])
                .args(&valid)
                .output()
                .unwrap(),
        );
    }
}

#[test]
fn raw_suite_duplicates_numeric_tokens_and_full_file_hash_are_preserved() {
    let f = Fixture::new();
    for suite in [
        SUITE.replacen("\"version\":1", "\"version\":1,\"ver\\u0073ion\":1", 1),
        SUITE.replacen("\"version\":1", "\"version\":1.0", 1),
        SUITE.replacen("\"version\":1", "\"version\":1e0", 1),
        SUITE.replacen("\"version\":1", "\"version\":18446744073709551616", 1),
        SUITE.replace("\"args\":[\"2\"]", "\"args\":[2.0]"),
    ] {
        let suite = format!(" \n{suite} \n");
        let r = parity(&f, SOURCE, SOURCE, &suite, "Error", 1);
        assert_eq!(r["project"]["new_execution"], false);
        assert_eq!(r["project"]["suite_file_hash"], hash(&suite));
    }
    let padded = format!(" \n{SUITE} \n");
    parity(&f, SOURCE, SOURCE, &padded, "Pass", 0);
    let mut options = f.options();
    options.extend(f.pins());
    f.put("suite.json", SUITE);
    assert_eq!(decode(f.run("a", &options), 1)["project"]["phase"], "guard");
}

#[test]
fn selected_scope_only_all_pins_exposed_no_top_level_execution_or_file_writes() {
    let f = Fixture::new();
    let source = "fn f(x:Int)->Int{x} print(1/0); probe n in 0..=0 { f(n)==0 }";
    f.put("source.wisp", source);
    f.put("candidate.wisp", source);
    f.put("other.wisp", "fn broken(");
    f.put("other.json", "null");
    f.manifest(
        json!([{"id":"z","source":"other.wisp","suite":"other.json"},
        {"id":"a","source":"source.wisp","suite":"suite.json"}]),
    );
    let names = [
        "source.wisp",
        "candidate.wisp",
        "suite.json",
        "project.json",
        "other.wisp",
        "other.json",
    ];
    let before: Vec<_> = names
        .iter()
        .map(|n| fs::read(f.0.join(n)).unwrap())
        .collect();
    let r = f.report(0);
    assert_eq!(r["report"], core(source, source, SUITE));
    assert_eq!(r["report"]["output"], "");
    assert_eq!(r["report"]["probes"], json!([]));
    assert_eq!(r["project"]["manifest_hash"], f.file_hash("project.json"));
    assert_eq!(r["project"]["source_revision"], hash(source));
    assert_eq!(
        r["project"]["policies"],
        json!([
            {"id":"a","source_revision":hash(source),"suite_file_hash":hash(SUITE)},
            {"id":"z","source_revision":hash("fn broken("),"suite_file_hash":hash("null")}
        ])
    );
    for (name, bytes) in names.iter().zip(before) {
        assert_eq!(fs::read(f.0.join(name)).unwrap(), bytes);
    }
    assert_eq!(fs::read_dir(&f.0).unwrap().count(), names.len());
    f.put("other.json", "{");
    host(f.run("a", &f.options()));
}

#[test]
fn bounded_confined_snapshot_loader_and_candidate_file_cap_are_reused() {
    let f = Fixture::new();
    let mut candidate = SOURCE.to_owned();
    candidate.push_str(&" ".repeat(wisp::SOURCE_BYTES - candidate.len()));
    f.put("candidate.wisp", &candidate);
    f.report(0);
    candidate.push(' ');
    f.put("candidate.wisp", &candidate);
    host(f.run("a", &f.options()));
    fs::write(f.0.join("candidate.wisp"), [0xff]).unwrap();
    let options = vec![
        "--candidate-file".into(),
        "candidate.wisp".into(),
        "--expected-candidate".into(),
        hash(SOURCE),
    ];
    host(f.run("a", &options));
    f.put("candidate.wisp", SOURCE);
    f.manifest(json!([{"id":"a","source":"../source.wisp","suite":"suite.json"}]));
    host(f.run("a", &f.options()));
    f.manifest(json!([{"id":"a","source":"source.wisp","suite":"suite.json"}]));
    f.put("source.wisp", &" ".repeat(wisp::SOURCE_BYTES + 1));
    host(f.run("a", &f.options()));
    f.put("source.wisp", SOURCE);
    #[cfg(unix)]
    {
        fs::rename(f.0.join("source.wisp"), f.0.join("real.wisp")).unwrap();
        std::os::unix::fs::symlink("real.wisp", f.0.join("source.wisp")).unwrap();
        host(f.run("a", &f.options()));
    }
}
