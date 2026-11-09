use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::io::Write;
use std::process::{Command, Stdio};

fn dispatch(r: Value) -> Value {
    serde_json::from_str(&wisp::dispatch(&r.to_string())).unwrap()
}
fn query(source: &str, focus: Value, budget: u64) -> Value {
    dispatch(json!({"op":"context","source":source,"focus":focus,"budget":budget}))
}
fn sha(s: &str) -> String {
    format!("{:x}", Sha256::digest(s.as_bytes()))
}
fn ledger(r: &Value) -> &[Value] {
    r["context"]["ledger"].as_array().unwrap()
}
fn reconcile(source: &str, r: &Value) {
    let c = &r["context"];
    let text = c["text"].as_str().unwrap();
    assert_eq!(c["used_bytes"], text.len());
    assert!(text.len() <= c["budget_bytes"].as_u64().unwrap() as usize);
    let mut required = 0;
    let mut used = 0;
    for entry in ledger(r) {
        let start = entry["span"]["start"].as_u64().unwrap() as usize;
        let end = entry["span"]["end"].as_u64().unwrap() as usize;
        let slice = &source[start..end];
        assert_eq!(entry["source_hash"], sha(slice));
        assert_eq!(entry["chunk_bytes"], slice.len() + 2);
        if entry["eligible"] == true {
            required += slice.len() + 2;
        }
        if entry["disposition"] == "included" {
            assert_eq!(entry["included_bytes"], slice.len() + 2);
            assert_eq!(entry["text_range"]["start"], used);
            assert_eq!(entry["source_text_range"]["start"], used);
            assert_eq!(&text[used..used + slice.len()], slice);
            assert_eq!(entry["source_text_range"]["end"], used + slice.len());
            used += slice.len() + 2;
            assert_eq!(&text[used - 2..used], "\n\n");
            assert_eq!(entry["text_range"]["end"], used);
        } else {
            assert_eq!(entry["included_bytes"], 0);
            assert!(entry["text_range"].is_null());
            assert!(entry["source_text_range"].is_null());
        }
    }
    assert_eq!(c["required_bytes"], required);
    assert_eq!(used, text.len());
    assert_eq!(c["overflow"], required > used);
}

#[test]
fn nonexecuting_whole_program_check_precedes_selector_validation() {
    let source =
        "fn recurse(n: Int) -> Bool { recurse(n) } print(1 / 0); probe n in 0..=0 { recurse(n) }";
    let r = dispatch(json!({"op":"context","source":source,"limits":{"fuel":0,"cases":0}}));
    assert_eq!(r["status"], "Ready");
    assert_eq!(r["new_execution"], false);
    assert_eq!(r["output"], "");
    assert_eq!(r["probes"], json!([]));
    assert!(r.get("usage").is_none());
    assert_eq!(r["context"]["selector"], "probe:0");
    for (source, code) in [
        (
            "fn unused() -> Int { false } probe n in 0..=0 { true }",
            "E_TYPE_MISMATCH",
        ),
        (
            "fn unused() -> Int { if false { missing() } else { 1 } }",
            "E_NAME_UNKNOWN",
        ),
        (
            "probe n in 0..=0 { if false { print(n); true } else { true } }",
            "E_PROBE_IMPURE",
        ),
    ] {
        let r = query(source, json!("wrong"), 0);
        assert_eq!(r["diagnostics"][0]["code"], code, "{r}");
    }
    for focus in [
        "",
        "probe:",
        "probe:+0",
        "probe:-0",
        "probe:00",
        "probe:01",
        "probe: 0",
        "probe:18446744073709551616",
        "probe:1",
        "function:f",
    ] {
        let r = query("probe n in 0..=0 { true }", json!(focus), 4096);
        assert_eq!(r["status"], "Error", "{focus}: {r}");
        assert_eq!(r["diagnostics"][0]["code"], "E_CONTEXT_SELECTOR");
        assert_eq!(r["diagnostics"][0]["kind"], "Request");
        assert_eq!(r["diagnostics"][0]["path"], "/focus");
        assert_eq!(r["diagnostics"][0]["span"], json!({"start":0,"end":0}));
    }
    assert_eq!(
        query("", Value::Null, 0)["diagnostics"][0]["code"],
        "E_CONTEXT_SELECTOR"
    );
    let r = query(source, Value::Null, 4096);
    assert_eq!(r["context"]["selector"], "probe:0");
}

#[test]
fn closure_cycles_diamonds_dead_calls_initializers_and_projection_receivers() {
    let source = r#"// outside trivia
record Z { value: Int }
record A { value: Int }
fn outside() -> Int { 99 }
fn root(n: Int) -> Bool { if false { left(n) } else { right(n) } }
fn right(n: Int) -> Bool { leaf(n) }
fn left(n: Int) -> Bool { leaf(n) }
fn leaf(n: Int) -> Bool { cycle(n) }
fn cycle(n: Int) -> Bool { leaf(n) }
fn init(n: Int) -> Int { n }
fn receiver(n: Int) -> A { new A { value: init(n) } }
probe n in 0..=0 { root(receiver(n).value) }
"#;
    let r = query(source, json!("probe:0"), u64::MAX);
    assert_eq!(r["status"], "Ready", "{r}");
    let names: Vec<_> = ledger(&r)
        .iter()
        .map(|e| e["name"].as_str().unwrap())
        .collect();
    assert_eq!(
        names,
        ["n", "A", "Z", "cycle", "init", "leaf", "left", "outside", "receiver", "right", "root"]
    );
    let included: Vec<_> = ledger(&r)
        .iter()
        .filter(|e| e["eligible"] == true)
        .map(|e| e["name"].as_str().unwrap())
        .collect();
    assert_eq!(
        included,
        ["n", "A", "Z", "cycle", "init", "leaf", "left", "receiver", "right", "root"]
    );
    assert_eq!(ledger(&r)[7]["disposition"], "outside_scope");
    assert_eq!(r["context"]["budget_bytes"], 65536);
    assert_eq!(r["context"]["overflow"], false);
    reconcile(source, &r);
    assert_eq!(r, query(source, json!("probe:0"), u64::MAX));
    assert!(r["context"]["text"]
        .as_str()
        .unwrap()
        .contains("fn receiver(n: Int) -> A {"));
}

#[test]
fn exact_framed_utf8_chunks_and_atomic_prefix_not_bin_packing() {
    let source = "record A { x: Int } fn a() -> Bool { \"é🦀\" == \"é🦀\" } fn z() -> Bool { true } probe n in 0..=0 { a() && z() }";
    let full = query(source, Value::Null, 65536);
    let required = full["context"]["required_bytes"].as_u64().unwrap();
    let exact = query(source, Value::Null, required);
    assert_eq!(exact["context"]["overflow"], false);
    reconcile(source, &exact);
    let short = query(source, Value::Null, required - 1);
    assert_eq!(
        ledger(&short).last().unwrap()["disposition"],
        "budget_exceeded"
    );
    reconcile(source, &short);
    for budget in [0, 1, ledger(&full)[0]["chunk_bytes"].as_u64().unwrap() - 1] {
        let r = query(source, Value::Null, budget);
        assert_eq!(r["status"], "Ready");
        assert_eq!(r["context"]["text"], "");
        assert_eq!(ledger(&r)[0]["disposition"], "budget_exceeded");
        assert!(ledger(&r)[1..]
            .iter()
            .all(|e| e["disposition"] == "after_budget_stop"));
        reconcile(source, &r);
    }
    let prefix: u64 = ledger(&full)[..2]
        .iter()
        .map(|e| e["chunk_bytes"].as_u64().unwrap())
        .sum();
    let last = ledger(&full).last().unwrap()["chunk_bytes"]
        .as_u64()
        .unwrap();
    let r = query(source, Value::Null, prefix + last);
    assert_eq!(ledger(&r)[2]["disposition"], "budget_exceeded");
    assert_eq!(ledger(&r)[3]["disposition"], "after_budget_stop");
    reconcile(source, &r);
}

#[test]
fn all_fit_retains_scope_omissions_and_exact_run_not_predicate_dependencies() {
    let source = "fn prior() -> Bool { true } fn prelude() -> Int { 1 } let x = prelude(); probe n in 0..=0 { prior() } probe n in 0..=0 { true } print(2); probe n in 0..=0 { true }";
    let r = query(source, json!("probe:1"), 65536);
    let analyze = dispatch(json!({"op":"analyze","source":source}));
    assert_eq!(r["probe_metadata"], analyze["probe_metadata"]);
    assert_eq!(
        r["context"]["selected_probe"]["dependency_key"],
        analyze["probe_metadata"][1]["dependency_key"]
    );
    assert_eq!(r["context"]["overflow"], false);
    let omissions = r["context"]["scope_omissions"].as_array().unwrap();
    let statements: Vec<_> = omissions
        .iter()
        .filter(|o| o["kind"] == "top_level_statement")
        .collect();
    assert_eq!(statements.len(), 2);
    assert_eq!(statements[0]["binding"], "x");
    assert_eq!(statements[1]["statement_kind"], "print");
    assert!(statements
        .iter()
        .all(|o| o.get("span").is_none() && o["expression_span"].is_object()));
    assert!(omissions
        .iter()
        .any(|o| o["relation"] == "preceding" && o["affects_selected_run_key"] == true));
    assert!(omissions
        .iter()
        .any(|o| o["relation"] == "following" && o["affects_selected_run_key"] == false));
    let last = query(source, json!("probe:2"), 65536);
    assert_eq!(
        r["context"]["selected_probe"]["predicate_key"],
        last["context"]["selected_probe"]["predicate_key"]
    );
    assert_ne!(
        r["context"]["selected_probe"]["dependency_key"],
        last["context"]["selected_probe"]["dependency_key"]
    );
    assert_ne!(r["context"]["query_key"], last["context"]["query_key"]);
    for changed in [
        source.replace("{ 1 }", "{ 3 }"),
        source.replace("{ prior() }", "{ false }"),
    ] {
        let q = query(&changed, json!("probe:1"), 65536);
        assert_ne!(
            r["context"]["selected_probe"]["dependency_key"],
            q["context"]["selected_probe"]["dependency_key"]
        );
    }
    let changed = source.replace("print(2)", "print(3)");
    assert_ne!(
        r["context"]["selected_probe"]["dependency_key"],
        query(&changed, json!("probe:1"), 65536)["context"]["selected_probe"]["dependency_key"]
    );
    let changed = source.to_owned() + " probe n in 0..=0 { false }";
    assert_eq!(
        r["context"]["selected_probe"]["dependency_key"],
        query(&changed, json!("probe:1"), 65536)["context"]["selected_probe"]["dependency_key"]
    );
    reconcile(source, &r);
}

#[test]
fn query_identity_includes_revision_effective_budget_limits_selector_and_records() {
    let source = "record R { x: Int } fn unrelated() -> Int { 1 } probe n in 0..=0 { true }";
    let r = query(source, Value::Null, u64::MAX);
    assert_eq!(r, query(source, json!("probe:0"), 65536));
    let default = dispatch(json!({"op":"context","source":source}));
    assert_eq!(default, query(source, Value::Null, 4096));
    for changed in [
        source.replace("{ 1 }", "{ 2 }"),
        format!("// comment\n{source}"),
    ] {
        let q = query(&changed, Value::Null, 65536);
        assert_ne!(r["context"]["query_key"], q["context"]["query_key"]);
        assert_eq!(
            r["context"]["selected_probe"]["dependency_key"],
            q["context"]["selected_probe"]["dependency_key"]
        );
    }
    let changed = source.replace("x: Int", "x: Bool");
    assert_ne!(
        r["context"]["selected_probe"]["dependency_key"],
        query(&changed, Value::Null, 65536)["context"]["selected_probe"]["dependency_key"]
    );
    assert_ne!(
        r["context"]["query_key"],
        query(source, Value::Null, 0)["context"]["query_key"]
    );
    let lower =
        dispatch(json!({"op":"context","source":source,"budget":65536,"limits":{"fuel":0}}));
    assert_ne!(r["context"]["query_key"], lower["context"]["query_key"]);
    let expected = sha(&json!([
        "wisp-probe-context",
        1,
        wisp::COMPILER,
        r["revision"],
        r["limits"],
        65536,
        "probe:0"
    ])
    .to_string());
    assert_eq!(r["context"]["query_key"], expected);
}

fn cli(args: &[&str], input: &str) -> std::process::Output {
    let mut child = Command::new(env!("CARGO_BIN_EXE_wisp"))
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    child
        .stdin
        .take()
        .unwrap()
        .write_all(input.as_bytes())
        .unwrap();
    child.wait_with_output().unwrap()
}

#[test]
fn cli_structured_metadata_strict_options_selectors_bounds_and_exits() {
    let source = "print(1 / 0); probe n in 0..=0 { true }";
    let out = cli(&["context", "-", "--probe", "0", "--budget", "0"], source);
    assert_eq!(out.status.code(), Some(0));
    let r: Value = serde_json::from_slice(&out.stdout).unwrap();
    assert_eq!(r, query(source, json!("probe:0"), 0));
    for selector in ["00", "+0", "-1", "18446744073709551616", "1", "unknown"] {
        let out = cli(&["context", "-", "--probe", selector], source);
        assert_eq!(out.status.code(), Some(1));
        let r: Value = serde_json::from_slice(&out.stdout).unwrap();
        assert_eq!(r["diagnostics"][0]["code"], "E_CONTEXT_SELECTOR");
    }
    for args in [
        vec!["context", "-"],
        vec!["context", "-", "--probe", "0", "--probe", "1"],
        vec![
            "context", "-", "--probe", "0", "--budget", "1", "--budget", "2",
        ],
        vec!["context", "-", "--probe"],
        vec!["context", "-", "--probe", "0", "--other", "1"],
    ] {
        assert_eq!(cli(&args, "").status.code(), Some(2));
    }
    assert_eq!(
        cli(&["context", "-", "--probe", "0"], &" ".repeat(65537))
            .status
            .code(),
        Some(2)
    );
    let out = cli(&["context", "-", "--probe", "0"], &" ".repeat(9000));
    assert_eq!(out.status.code(), Some(1));
    let unknown = cli(
        &["--json"],
        &json!({"op":"context","source":source,"limits":{"source_bytes":0}}).to_string(),
    );
    assert_eq!(unknown.status.code(), Some(0)); // legacy --json semantic exits unchanged
    let r: Value = serde_json::from_slice(&unknown.stdout).unwrap();
    assert_eq!(r["status"], "Unknown");
}
