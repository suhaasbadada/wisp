use serde_json::{json, Value};
use sha2::{Digest, Sha256};
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
        let path = std::env::temp_dir().join(format!(
            "wisp-project-focus-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir(&path).unwrap();
        let f = Self(path);
        f.put("source.wisp", "fn f(x:Int)->Int{x}");
        f.put("suite.json", " \n{\"not_a_suite\":true} \n");
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
    fn run(&self, policy: &str, function: &str, options: &[&str]) -> Output {
        Command::new(env!("CARGO_BIN_EXE_wisp"))
            .args(["project", "focus"])
            .arg(self.0.join("project.json"))
            .args([policy, function])
            .args(options)
            .output()
            .unwrap()
    }
    fn report(&self, function: &str, options: &[&str], code: i32) -> Value {
        decode(self.run("a", function, options), code)
    }
    fn pins(&self) -> Vec<String> {
        vec![
            "--expected-manifest".into(),
            hash(&fs::read(self.0.join("project.json")).unwrap()),
            "--expected-revision".into(),
            hash(&fs::read(self.0.join("source.wisp")).unwrap()),
            "--expected-suite".into(),
            hash(&fs::read(self.0.join("suite.json")).unwrap()),
            "--expected-compiler".into(),
            wisp::COMPILER.into(),
        ]
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.0).unwrap();
    }
}
fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
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
    assert_eq!(r["project"]["new_execution"], false);
    assert_eq!(r["project"]["approval"], "not_granted");
    r
}
fn host(output: Output) {
    assert_eq!(output.status.code(), Some(2));
    assert!(output.stdout.is_empty());
    assert!(!output.stderr.is_empty());
}
fn analyze(source: &str, budget: u64) -> Value {
    serde_json::from_str(&wisp::dispatch(
        &json!({"op":"analyze","source":source,"focus":"f","budget":budget}).to_string(),
    ))
    .unwrap()
}

#[test]
fn exact_core_parity_sorted_full_pins_and_no_execution_or_writes() {
    let f = Fixture::new();
    let source = "fn f(x:Int)->Int{f(x)} print(1/0); probe n in 0..=0 { f(n)==0 }";
    f.put("source.wisp", source);
    // Other policies are loaded and pinned, but not semantically checked.
    f.put("other.wisp", "fn broken()->Int{true}");
    f.manifest(json!([{"id":"z","source":"other.wisp","suite":"suite.json"},{"id":"a","source":"source.wisp","suite":"suite.json"}]));
    let names = ["source.wisp", "other.wisp", "suite.json", "project.json"];
    let before: Vec<_> = names
        .iter()
        .map(|n| fs::read(f.0.join(n)).unwrap())
        .collect();
    let r = f.report("f", &[], 0);
    assert_eq!(r["report"], analyze(source, 4096));
    assert_eq!(r["report"]["output"], "");
    assert_eq!(r["report"]["probes"], json!([]));
    assert!(r["report"].get("usage").is_none());
    assert_eq!(r["project"]["phase"], "focused");
    assert_eq!(r["project"]["guard_status"], "not_requested");
    assert_eq!(r["project"]["contract_version"], 1);
    assert_eq!(r["project"]["mode"], "focus");
    assert_eq!(r["project"]["manifest_hash"], hash(&before[3]));
    assert_eq!(r["project"]["source_revision"], hash(&before[0]));
    assert_eq!(r["project"]["suite_file_hash"], hash(&before[2]));
    assert_eq!(
        r["project"]["policies"],
        json!([
            {"id":"a","source_revision":hash(&before[0]),"suite_file_hash":hash(&before[2])},
            {"id":"z","source_revision":hash(&before[1]),"suite_file_hash":hash(&before[2])}
        ])
    );
    for (name, bytes) in names.iter().zip(before) {
        assert_eq!(fs::read(f.0.join(name)).unwrap(), bytes);
    }
    assert_eq!(fs::read_dir(&f.0).unwrap().count(), 4);
}

#[test]
fn matching_and_each_mismatching_guard_preempt_core() {
    let f = Fixture::new();
    let pins = f.pins();
    let refs: Vec<_> = pins.iter().map(String::as_str).collect();
    let r = f.report("f", &refs, 0);
    assert_eq!(r["project"]["guard_status"], "matched");
    for index in [1, 3, 5, 7] {
        let mut changed = pins.clone();
        changed[index] = if index == 7 {
            "other-compiler".into()
        } else {
            "0".repeat(64)
        };
        let refs: Vec<_> = changed.iter().map(String::as_str).collect();
        let r = f.report("missing", &refs, 1);
        assert_eq!(r["project"]["phase"], "guard");
        assert_eq!(r["project"]["guard_status"], "rejected");
        assert_eq!(r["diagnostics"][0]["code"], "PROJECT_SNAPSHOT_DRIFT");
        assert_eq!(r["diagnostics"][0]["kind"], "Project");
        assert!(r["report"].is_null());
        assert!(!r.to_string().contains("fn f"));
        assert!(r.get("agent_view").is_none());
    }
    // Guards compare full suite bytes, including JSON whitespace.
    f.put("suite.json", "{\"not_a_suite\":true}");
    assert_eq!(f.report("f", &refs, 1)["project"]["phase"], "guard");
}

#[test]
fn selectors_and_core_failures_are_not_ready() {
    let f = Fixture::new();
    let r = decode(f.run("absent", "f", &[]), 1);
    assert_eq!(r["diagnostics"][0]["code"], "PROJECT_POLICY_UNKNOWN");
    assert_eq!(r["project"]["phase"], "selector");
    assert!(r["project"]["source_revision"].is_null());
    assert!(r["report"].is_null());
    let pins = f.pins();
    let refs: Vec<_> = pins.iter().map(String::as_str).collect();
    let guarded_unknown = decode(f.run("absent", "f", &refs), 1);
    assert_eq!(guarded_unknown["project"]["guard_status"], "not_evaluated");
    let r = f.report("absent", &[], 1);
    assert_eq!(r["report"]["diagnostics"][0]["code"], "E_FOCUS_UNKNOWN");
    let direct = Command::new(env!("CARGO_BIN_EXE_wisp"))
        .arg("focus")
        .arg(f.0.join("source.wisp"))
        .arg("absent")
        .output()
        .unwrap();
    assert_eq!(
        r["report"],
        serde_json::from_slice::<Value>(&direct.stdout).unwrap()
    );
    for source in [
        "fn f(",
        "fn f()->Int{true}",
        "fn f()->Int{1} fn unused()->Int{false}",
    ] {
        f.put("source.wisp", source);
        let r = f.report("f", &[], 1);
        assert_eq!(r["report"], analyze(source, 4096));
        assert_eq!(r["status"], "Error");
        assert_eq!(r["project"]["phase"], "focused");
    }
    let source = format!("fn f()->Int{{{}1{}}}", "(".repeat(1000), ")".repeat(1000));
    f.put("source.wisp", &source);
    let r = f.report("f", &[], 3);
    assert_eq!(r["report"], analyze(&source, 4096));
    assert_eq!(r["status"], "Unknown");
}

#[test]
fn budget_zero_utf8_and_u64_clamp_preserve_shared_report() {
    let f = Fixture::new();
    let source = "fn f()->Bool{\"é🦀\"==\"é🦀\"}";
    f.put("source.wisp", source);
    for budget in [0, 1, 30, 4096, 65536, u64::MAX] {
        let text = budget.to_string();
        let r = f.report("f", &["--budget", &text], 0);
        assert_eq!(r["report"], analyze(source, budget));
    }
    assert_eq!(
        f.report("f", &["--budget", "65536"], 0)["report"],
        f.report("f", &["--budget", &u64::MAX.to_string()], 0)["report"]
    );
    let mut pins = f.pins();
    pins.splice(2..2, ["--budget".into(), "0".into()]);
    // Reverse pairs, not the values within each pair.
    let mut pairs: Vec<_> = pins.chunks(2).collect();
    pairs.reverse();
    let options: Vec<_> = pairs.into_iter().flatten().map(String::as_str).collect();
    assert_eq!(f.report("f", &options, 0)["report"], analyze(source, 0));
}

#[test]
fn malformed_options_and_positionals_fail_before_filesystem_access() {
    let f = Fixture::new();
    fs::remove_file(f.0.join("project.json")).unwrap();
    let hash = "a".repeat(64);
    for options in [
        vec!["--budget"],
        vec!["--budget", ""],
        vec!["--budget", "-1"],
        vec!["--budget", "18446744073709551616"],
        vec!["--budget", "no"],
        vec!["--budget", "1", "--budget", "2"],
        vec!["--extra", "1"],
        vec!["extra"],
        vec!["--expected-manifest", &hash],
        vec!["--expected-manifest", "A"],
        vec!["--expected-manifest", ""],
        vec!["--expected-manifest", "--expected-suite"],
    ] {
        let o = f.run("a", "f", &options);
        assert!(!String::from_utf8_lossy(&o.stderr).contains("No such file"));
        host(o);
    }
    for (policy, function) in [("é", "f"), ("", "f"), ("a", ""), ("a", "--budget")] {
        host(f.run(policy, function, &[]));
    }
    let f = Fixture::new();
    for slot in [1, 3, 5] {
        for invalid in [
            "A".repeat(64),
            "g".repeat(64),
            "a".repeat(63),
            "a".repeat(65),
        ] {
            let mut pins = f.pins();
            pins[slot] = invalid;
            host(f.run(
                "a",
                "f",
                &pins.iter().map(String::as_str).collect::<Vec<_>>(),
            ));
        }
    }
    for flag in [
        "--expected-manifest",
        "--expected-revision",
        "--expected-suite",
        "--expected-compiler",
    ] {
        let mut pins = f.pins();
        let value = if flag == "--expected-compiler" {
            "id"
        } else {
            &hash
        };
        pins.extend([flag.into(), value.into()]);
        host(f.run(
            "a",
            "f",
            &pins.iter().map(String::as_str).collect::<Vec<_>>(),
        ));
    }
}

#[test]
fn all_files_load_suites_are_json_only_and_paths_are_confined() {
    let f = Fixture::new();
    for suite in ["null", "42", "[]", "{\"version\":1,\"version\":2}"] {
        f.put("suite.json", suite);
        f.report("f", &[], 0);
    }
    f.put("suite.json", "{");
    host(f.run("a", "f", &[]));
    f.put("suite.json", "null");
    for path in [
        "../source.wisp",
        "./source.wisp",
        "/source.wisp",
        "x//source.wisp",
        "x\\source.wisp",
        "",
    ] {
        f.manifest(json!([{"id":"a","source":path,"suite":"suite.json"}]));
        host(f.run("a", "f", &[]));
    }
    f.manifest(json!([{"id":"a","source":"source.wisp","suite":"suite.json"},{"id":"z","source":"missing.wisp","suite":"suite.json"}]));
    host(f.run("a", "f", &[]));
    f.manifest(json!([{"id":"a","source":"source.wisp","suite":"suite.json"}]));
    fs::remove_file(f.0.join("source.wisp")).unwrap();
    fs::create_dir(f.0.join("source.wisp")).unwrap();
    host(f.run("a", "f", &[]));
}

#[test]
fn manifest_and_file_caps_and_project_cardinality_are_reused() {
    let f = Fixture::new();
    for name in ["source.wisp", "suite.json", "project.json"] {
        let old = fs::read(f.0.join(name)).unwrap();
        let cap = if name == "project.json" { 16384 } else { 65536 };
        let mut padded = old.clone();
        padded.resize(cap, b' ');
        fs::write(f.0.join(name), &padded).unwrap();
        f.report("f", &[], 0);
        padded.push(b' ');
        fs::write(f.0.join(name), padded).unwrap();
        host(f.run("a", "f", &[]));
        fs::write(f.0.join(name), old).unwrap();
    }
    let policies: Vec<_> = (0..8)
        .map(|i| json!({"id":format!("p{i}"),"source":"source.wisp","suite":"suite.json"}))
        .collect();
    f.manifest(json!(policies));
    assert_eq!(
        decode(f.run("p0", "f", &[]), 0)["project"]["policies"]
            .as_array()
            .unwrap()
            .len(),
        8
    );
    let mut too_many = policies;
    too_many.push(json!({"id":"p8","source":"source.wisp","suite":"suite.json"}));
    f.manifest(json!(too_many));
    host(f.run("a", "f", &[]));
    f.manifest(json!([]));
    host(f.run("a", "f", &[]));
}

#[cfg(unix)]
#[test]
fn symlink_manifest_files_and_components_are_rejected() {
    use std::os::unix::fs::symlink;
    for name in ["source.wisp", "suite.json", "project.json"] {
        let f = Fixture::new();
        fs::rename(f.0.join(name), f.0.join("real")).unwrap();
        symlink("real", f.0.join(name)).unwrap();
        host(f.run("a", "f", &[]));
    }
    let f = Fixture::new();
    fs::create_dir(f.0.join("real")).unwrap();
    f.put("real/source.wisp", "fn f()->Int{1}");
    symlink("real", f.0.join("link")).unwrap();
    f.manifest(json!([{"id":"a","source":"link/source.wisp","suite":"suite.json"}]));
    host(f.run("a", "f", &[]));
}
