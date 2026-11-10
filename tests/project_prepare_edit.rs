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
const SOURCE: &str = "fn f(n:Int)->Int{n}";
struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!(
            "wisp-project-prepare-edit-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir(&path).unwrap();
        let f = Self(path);
        f.put("source.wisp", SOURCE);
        f.put("suite.json", " \n{\"not_a_suite\":true} \n");
        f.put("body", "{n+n}");
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
    fn command(&self, manifest: &str, policy: &str, function: &str, options: &[&str]) -> Command {
        let mut c = Command::new(env!("CARGO_BIN_EXE_wisp"));
        c.current_dir(&self.0)
            .args(["project", "prepare-edit", manifest, policy, function])
            .args(options);
        c
    }
    fn run(&self, policy: &str, function: &str, options: &[&str]) -> Output {
        self.command("project.json", policy, function, options)
            .output()
            .unwrap()
    }
    fn prepare(
        &self,
        function: &str,
        body_hash: &str,
        replacement: &str,
        pins: &[String],
    ) -> Output {
        let mut args = vec![
            "--expected-body",
            body_hash,
            "--replacement-file",
            replacement,
        ];
        args.extend(pins.iter().map(String::as_str));
        self.run("a", function, &args)
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
fn send(request: Value) -> Value {
    serde_json::from_str(&wisp::dispatch(&request.to_string())).unwrap()
}
fn body_hash(source: &str) -> String {
    let r = send(json!({"op":"analyze","source":source}));
    r["graph"]["functions"]
        .as_array()
        .and_then(|fs| fs.iter().find(|f| f["name"] == "f"))
        .and_then(|f| f["body_hash"].as_str())
        .unwrap_or(&"0".repeat(64))
        .into()
}
fn edit(source: &str, function: &str, body: &str, replacement: &str) -> Value {
    send(
        json!({"op":"edit","source":source,"focus":function,"change":{
            "expected_revision":hash(source.as_bytes()),"expected_body_hash":body,"replacement":replacement
        }}),
    )
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
    assert_eq!(r["project"]["new_execution"], false);
    assert_eq!(r["project"]["approval"], "not_granted");
    assert_eq!(r["project"]["mode"], "prepare-edit");
    assert_eq!(r["project"]["contract_version"], 1);
    if !r["report"].is_null() {
        assert_eq!(r["project"]["phase"], "prepared");
        assert_eq!(r["report"]["new_execution"], false);
        assert_eq!(r["report"]["output"], "");
        assert_eq!(r["report"]["probes"], json!([]));
        assert!(r["report"]["usage"].is_null());
        assert_eq!(r["status"], r["report"]["status"]);
        assert_eq!(r["diagnostics"], json!([]));
    }
    r
}
fn host(o: Output) {
    assert_eq!(o.status.code(), Some(2));
    assert!(o.stdout.is_empty());
    assert!(!o.stderr.is_empty());
}

#[test]
fn exact_inner_parity_unicode_trivia_signature_probes_and_all_snapshot_pins() {
    let f = Fixture::new();
    let source = "// π\r\nrecord Item { x: Int }\r\nfn f(n: Int) -> Int { n * 2 }\r\nfn other() -> Int { 7 }\r\nprint(1/0);\r\nprobe n in 1..=2 { f(n) == n * 2 }\r\nprobe n in 1..=2 { f(n) == n * 2 }";
    let replacement = "\u{2003}\r\n{ // inner } comment\r\n n + 999 }\r\n\u{2002}";
    f.put("source.wisp", source);
    f.put("body", replacement);
    f.put("other.wisp", "fn broken()->Int{true}");
    f.manifest(json!([{"id":"z","source":"other.wisp","suite":"suite.json"},{"id":"a","source":"source.wisp","suite":"suite.json"}]));
    let names = [
        "project.json",
        "source.wisp",
        "suite.json",
        "other.wisp",
        "body",
    ];
    let before: Vec<_> = names
        .iter()
        .map(|n| fs::read(f.0.join(n)).unwrap())
        .collect();
    let body = body_hash(source);
    for pins in [vec![], f.pins()] {
        let r = decode(f.prepare("f", &body, "body", &pins), 0);
        assert_eq!(r["status"], "Ready"); // Preparation is not a finite Pass.
        assert_eq!(r["report"], edit(source, "f", &body, replacement));
        assert_eq!(
            r["project"]["guard_status"],
            if pins.is_empty() {
                "not_requested"
            } else {
                "matched"
            }
        );
        assert_eq!(r["project"]["manifest_hash"], hash(&before[0]));
        assert_eq!(r["project"]["policy_id"], "a");
        assert_eq!(r["project"]["source_revision"], hash(&before[1]));
        assert_eq!(r["project"]["suite_file_hash"], hash(&before[2]));
        assert_eq!(
            r["project"]["policies"],
            json!([
                {"id":"a","source_revision":hash(&before[1]),"suite_file_hash":hash(&before[2])},
                {"id":"z","source_revision":hash(&before[3]),"suite_file_hash":hash(&before[2])}
            ])
        );
        let e = &r["report"]["edit"];
        let next = e["source"].as_str().unwrap();
        let start = e["base_body_span"]["start"].as_u64().unwrap() as usize;
        let end = e["base_body_span"]["end"].as_u64().unwrap() as usize;
        assert_eq!(
            next,
            format!("{}{}{}", &source[..start], replacement, &source[end..])
        );
        assert_eq!(r["report"]["revision"], hash(source.as_bytes()));
        assert_eq!(e["preservation"]["checked"], true);
        assert_eq!(e["preservation"]["probes"].as_array().unwrap().len(), 2);
        assert!(r.get("edit").is_none());
    }
    for (name, bytes) in names.iter().zip(before) {
        assert_eq!(fs::read(f.0.join(name)).unwrap(), bytes);
    }
    assert_eq!(fs::read_dir(&f.0).unwrap().count(), names.len());
}

#[test]
fn replacement_stdin_is_actual_bounded_utf8_input() {
    let f = Fixture::new();
    let body = body_hash(SOURCE);
    let replacement = "\u{2003}{n / 0}\n";
    let mut child = f
        .command(
            "project.json",
            "a",
            "f",
            &["--replacement-file", "-", "--expected-body", &body],
        )
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    child
        .stdin
        .take()
        .unwrap()
        .write_all(replacement.as_bytes())
        .unwrap();
    let r = decode(child.wait_with_output().unwrap(), 0);
    assert_eq!(r["report"], edit(SOURCE, "f", &body, replacement));
}

#[test]
fn every_project_guard_mismatch_preempts_missing_unreadable_and_open_stdin_replacement() {
    let f = Fixture::new();
    let body = body_hash(SOURCE);
    fs::create_dir(f.0.join("unreadable")).unwrap();
    for slot in [1, 3, 5, 7] {
        let mut pins = f.pins();
        pins[slot] = if slot == 7 {
            "other-compiler".into()
        } else {
            "0".repeat(64)
        };
        for replacement in ["missing", "unreadable", "-"] {
            let mut options = vec!["--expected-body", &body, "--replacement-file", replacement];
            options.extend(pins.iter().map(String::as_str));
            let mut c = f.command("project.json", "a", "absent", &options);
            // Keep stdin open: returning proves stale pins do not wait on a body.
            let mut child = c
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
            assert_eq!(r["diagnostics"][0]["code"], "PROJECT_SNAPSHOT_DRIFT");
            assert!(r["report"].is_null());
            assert!(!r.to_string().contains("fn f"));
        }
    }
}

#[test]
fn unknown_policy_preempts_replacement_and_does_not_evaluate_guards() {
    let f = Fixture::new();
    let body = body_hash(SOURCE);
    for pins in [vec![], f.pins()] {
        let mut options = vec!["--expected-body", &body, "--replacement-file", "missing"];
        options.extend(pins.iter().map(String::as_str));
        let r = decode(f.run("absent", "f", &options), 1);
        assert_eq!(r["project"]["phase"], "selector");
        assert_eq!(
            r["project"]["guard_status"],
            if pins.is_empty() {
                "not_requested"
            } else {
                "not_evaluated"
            }
        );
        assert_eq!(r["diagnostics"][0]["code"], "PROJECT_POLICY_UNKNOWN");
        assert!(r["project"]["source_revision"].is_null());
        assert!(r["report"].is_null());
    }
}

#[test]
fn matching_project_pins_do_not_claim_body_match_and_unknown_target_is_core_owned() {
    let f = Fixture::new();
    for (function, body, code) in [
        ("f", "0".repeat(64), "E_EDIT_CONFLICT"),
        ("absent", body_hash(SOURCE), "E_EDIT_TARGET"),
    ] {
        let r = decode(f.prepare(function, &body, "body", &f.pins()), 1);
        assert_eq!(r["project"]["guard_status"], "matched");
        assert_eq!(r["report"], edit(SOURCE, function, &body, "{n+n}"));
        assert_eq!(r["report"]["diagnostics"][0]["code"], code);
        assert!(r["report"]["edit"]["source"].is_null());
    }
}

#[test]
fn replacement_shape_and_candidate_type_diagnostics_keep_nested_ownership() {
    let f = Fixture::new();
    let body = body_hash(SOURCE);
    for (replacement, code, document) in [
        (
            "{n} fn injected()->Int{1}",
            "E_EDIT_REPLACEMENT",
            "replacement",
        ),
        ("{true}", "E_EDIT_CANDIDATE", "candidate"),
    ] {
        f.put("body", replacement);
        let r = decode(f.prepare("f", &body, "body", &[]), 1);
        assert_eq!(r["report"], edit(SOURCE, "f", &body, replacement));
        assert_eq!(r["report"]["revision"], hash(SOURCE.as_bytes()));
        assert_eq!(r["report"]["diagnostics"][0]["code"], code);
        assert!(r["report"]["edit"]["source"].is_null());
        if document == "candidate" {
            let rejected = &r["report"]["edit"]["rejected_candidate"];
            assert_eq!(rejected["document"], document);
            assert_eq!(rejected["diagnostics"][0]["code"], "E_TYPE_MISMATCH");
            assert_eq!(
                rejected["revision"],
                hash(rejected["source"].as_str().unwrap().as_bytes())
            );
        } else {
            assert_eq!(r["report"]["edit"]["cause"]["document"], document);
            assert_eq!(
                r["report"]["edit"]["cause"]["revision"],
                hash(replacement.as_bytes())
            );
        }
    }
}

#[test]
fn core_unknown_limits_are_preserved_without_execution() {
    let f = Fixture::new();
    let body = body_hash(SOURCE);
    let replacement = format!("{{ {}0{} }}", "(".repeat(70), ")".repeat(70));
    f.put("body", &replacement);
    let r = decode(f.prepare("f", &body, "body", &[]), 3);
    assert_eq!(r["report"], edit(SOURCE, "f", &body, &replacement));
    assert_eq!(
        r["report"]["diagnostics"][0]["code"],
        "E_LIMIT_SYNTAX_DEPTH"
    );
    assert_eq!(r["report"]["edit"]["cause"]["document"], "replacement");
    let source = format!("fn f()->Int{{{}0{}}}", "(".repeat(70), ")".repeat(70));
    f.put("source.wisp", &source);
    f.put("body", "{1}");
    let r = decode(f.prepare("f", &body, "body", &[]), 3);
    assert_eq!(r["report"], edit(&source, "f", &body, "{1}"));
}

#[test]
fn invalid_baseline_cannot_be_repaired_by_preparing_a_valid_body() {
    let f = Fixture::new();
    for source in [
        "fn f(n:Int)->Int{true}",
        "fn f(",
        "fn f(n:Int)->Int{n} fn other()->Int{false}",
    ] {
        f.put("source.wisp", source);
        f.put("body", "{n}");
        let body = "0".repeat(64);
        let r = decode(f.prepare("f", &body, "body", &[]), 1);
        assert_eq!(r["report"], edit(source, "f", &body, "{n}"));
        assert!(r["report"]["edit"].is_null());
    }
}

#[test]
fn all_suites_are_json_syntax_only_and_only_selected_source_is_checked() {
    let f = Fixture::new();
    let body = body_hash(SOURCE);
    f.put("other.wisp", "fn broken(");
    f.manifest(json!([{"id":"z","source":"other.wisp","suite":"suite.json"},{"id":"a","source":"source.wisp","suite":"suite.json"}]));
    for suite in ["null", "42", "[]", "{\"version\":1,\"version\":2}"] {
        f.put("suite.json", suite);
        let r = decode(f.prepare("f", &body, "body", &f.pins()), 0);
        assert_eq!(r["report"], edit(SOURCE, "f", &body, "{n+n}"));
    }
    f.put("suite.json", "{");
    host(f.prepare("f", &body, "body", &[]));
    f.put("suite.json", "null");
    fs::remove_file(f.0.join("other.wisp")).unwrap();
    host(f.prepare("f", &body, "body", &[]));
}

#[test]
fn malformed_full_command_is_rejected_before_any_filesystem_access() {
    let f = Fixture::new();
    let body = body_hash(SOURCE);
    let pins = f.pins();
    fs::remove_file(f.0.join("project.json")).unwrap();
    let base = ["--expected-body", &body, "--replacement-file", "missing"];
    let mut cases = vec![
        vec![],
        vec!["--expected-body", &body],
        vec!["--replacement-file", "body"],
    ];
    for extra in [
        vec!["--expected-body", &body],
        vec!["--replacement-file", "body"],
        vec!["--budget", "1"],
        vec!["--limits", "1"],
        vec!["--out", "new"],
        vec!["--unknown", "1"],
        vec!["--expected-manifest", &body],
        vec!["--replacement-file"],
        vec!["--expected-body"],
        vec!["--expected-compiler", "--out"],
    ] {
        let mut options = base.to_vec();
        options.extend(extra);
        cases.push(options);
    }
    for options in cases {
        let o = f.run("a", "f", &options);
        assert!(String::from_utf8_lossy(&o.stderr).starts_with("usage:"));
        host(o);
    }
    for invalid in [
        String::new(),
        "A".repeat(64),
        "g".repeat(64),
        "a".repeat(63),
        "a".repeat(65),
        "--out".into(),
    ] {
        let o = f.prepare("f", &invalid, "body", &[]);
        assert!(String::from_utf8_lossy(&o.stderr).starts_with("usage:"));
        host(o);
    }
    for (manifest, policy, function) in [
        ("", "a", "f"),
        ("-", "a", "f"),
        ("--manifest", "a", "f"),
        ("project.json", "é", "f"),
        ("project.json", "", "f"),
        ("project.json", "a", ""),
        ("project.json", "a", "--out"),
    ] {
        host(
            f.command(manifest, policy, function, &base)
                .output()
                .unwrap(),
        );
    }
    for slot in [1, 3, 5, 7] {
        let mut bad = pins.clone();
        bad[slot] = if slot == 7 { "".into() } else { "A".repeat(64) };
        let o = f.prepare("f", &body, "body", &bad);
        assert!(String::from_utf8_lossy(&o.stderr).starts_with("usage:"));
        host(o);
        let mut duplicate = pins.clone();
        duplicate.extend_from_slice(&pins[slot - 1..=slot]);
        host(f.prepare("f", &body, "body", &duplicate));
    }
    host(f.prepare("f", &body, "", &[]));
    assert!(!f.0.join("new").exists());
}

#[test]
fn replacement_host_caps_utf8_and_io_match_existing_native_edit() {
    let f = Fixture::new();
    let body = body_hash(SOURCE);
    host(f.prepare("f", &body, "missing", &[]));
    fs::write(f.0.join("body"), [0xff, 0xfe]).unwrap();
    host(f.prepare("f", &body, "body", &[]));
    let exact = format!("{{n}}{}", " ".repeat(wisp::REPLACEMENT_BYTES - 3));
    f.put("body", &exact);
    let direct = edit(SOURCE, "f", &body, &exact);
    let code = if direct["status"] == "Ready" { 0 } else { 3 };
    assert_eq!(
        decode(f.prepare("f", &body, "body", &[]), code)["report"],
        direct
    );
    f.put("body", &(exact + " "));
    let o = f.prepare("f", &body, "body", &[]);
    assert!(String::from_utf8_lossy(&o.stderr).contains("byte limit"));
    host(o);
    for bytes in [vec![0xff], vec![b' '; wisp::REPLACEMENT_BYTES + 1]] {
        let mut child = f
            .command(
                "project.json",
                "a",
                "f",
                &["--replacement-file", "-", "--expected-body", &body],
            )
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
fn confined_project_paths_reuse_loader_while_explicit_replacement_path_is_owner_selected() {
    let f = Fixture::new();
    let body = body_hash(SOURCE);
    let absolute = f.0.join("body");
    decode(f.prepare("f", &body, absolute.to_str().unwrap(), &[]), 0);
    f.manifest(json!([{"id":"a","source":"../source.wisp","suite":"suite.json"}]));
    host(f.prepare("f", &body, "body", &[]));
}

#[cfg(unix)]
#[test]
fn project_symlinks_are_rejected_by_shared_loader() {
    use std::os::unix::fs::symlink;
    let body = body_hash(SOURCE);
    for name in ["source.wisp", "suite.json", "project.json"] {
        let f = Fixture::new();
        fs::rename(f.0.join(name), f.0.join("real")).unwrap();
        symlink("real", f.0.join(name)).unwrap();
        host(f.prepare("f", &body, "body", &[]));
    }
}
