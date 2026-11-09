use serde_json::{json, Value};
fn request(v: Value) -> Value {
    serde_json::from_str(&wisp::dispatch(&v.to_string())).unwrap()
}
fn run(source: &str) -> Value {
    request(json!({"op":"run","source":source}))
}
const BROKEN: &str = include_str!("../examples/snacks.wisp");
const REPAIRED: &str = include_str!("../examples/snacks-repaired.wisp");
#[test]
fn snack_witness_and_exact_repaired_domain() {
    let b = run(BROKEN);
    assert_eq!(b["output"], "900\n");
    assert_eq!(b["status"], "Fail");
    assert_eq!(b["probes"][0]["failing_input"], "9");
    assert_eq!(b["probes"][0]["completed_cases"], 9);
    let r = run(REPAIRED);
    assert_eq!(r["probes"][0]["status"], "Clear");
    assert_eq!(r["probes"][0]["completed_cases"], 11);
}
#[test]
fn types_scopes_strings_and_short_circuit() {
    let r=run("let greeting = \"雪\\n\"; print(greeting); fn f(x: Int) -> Int { let y = x * 2; if true { y } else { 1 / 0 } } print(f(4)); print(false && (1 / 0 == 0)); print(true || (1 / 0 == 0)); print(\"a\" != \"b\");");
    assert_eq!(r["status"], "Complete");
    assert_eq!(r["output"], "雪\n\n8\nfalse\ntrue\ntrue\n");
}
#[test]
fn integer_precision_and_minimum() {
    let r = run("print(9223372036854775807); print(-9223372036854775808);");
    assert_eq!(r["output"], "9223372036854775807\n-9223372036854775808\n");
}
#[test]
fn arithmetic_faults_are_not_limits() {
    for expr in [
        "9223372036854775807 + 1",
        "-9223372036854775808 - 1",
        "3037000500 * 3037000500",
        "1 / 0",
        "1 % 0",
        "-9223372036854775808 / -1",
        "-9223372036854775808 % -1",
        "-(-9223372036854775808)",
    ] {
        let r = run(&format!("probe n in 1..=1 {{ {expr} == n }}"));
        assert_eq!(r["probes"][0]["status"], "Error", "{expr}: {r}");
        assert_eq!(r["probes"][0]["completed_cases"], 0);
    }
}
#[test]
fn whole_program_check_includes_unused_and_unreachable() {
    for source in [
        "fn unused() -> Int { true } print(1);",
        "fn unused() -> Int { missing() }",
        "print(if true { 1 } else { false });",
        "print(false && (1 + true == 0));",
        "let x = 1; let x = 2;",
        "fn f(a: Int, a: Int) -> Int { a }",
        "fn f() -> Int { 1 } fn f() -> Int { 2 }",
        "print(x);",
        "fn f() -> Int { x } let x = 1;",
        "fn f(a: Int) -> Int { a } print(f(true));",
        "fn f(a: Int) -> Int { a } print(f());",
        "probe n in 1..=2 { n }",
    ] {
        let r = run(source);
        assert_eq!(r["status"], "Error", "{source}: {r}");
        assert_eq!(r["output"], "");
        assert_eq!(r["diagnostics"][0]["kind"], "Type");
    }
}
#[test]
fn transitive_purity_includes_dead_branches_and_recursion() {
    for source in ["fn dirty() -> Int { print(1); 1 } fn helper() -> Int { if false { dirty() } else { 1 } } probe n in 1..=1 { helper() == n }","probe n in 1..=1 { if false { print(n); true } else { true } }","fn a() -> Int { b() } fn b() -> Int { if false { print(1); a() } else { 1 } } probe n in 1..=1 { a() == 1 }"]{let r=run(source);assert_eq!(r["diagnostics"][0]["kind"],"Purity","{r}");}
}
#[test]
fn recursion_and_fuel_are_unknown() {
    let r = run("fn f(n: Int) -> Int { f(n) } probe n in 1..=1 { f(n) == 0 }");
    assert_eq!(r["probes"][0]["status"], "Unknown");
    let r = request(json!({"op":"run","source":REPAIRED,"limits":{"fuel":1}}));
    assert_eq!(r["status"], "Unknown");
    assert_ne!(r["probes"][0]["status"], "Clear");
}
#[test]
fn range_errors_and_case_limits() {
    let r = run("probe n in 2..=1 { true }");
    assert_eq!(r["probes"][0]["status"], "Error");
    for source in [
        "probe n in 1..=1001 { true }",
        "probe n in -9223372036854775808..=9223372036854775807 { true }",
    ] {
        let r = run(source);
        assert_eq!(r["probes"][0]["status"], "Unknown");
        assert_eq!(r["probes"][0]["completed_cases"], 0);
    }
    let r = request(
        json!({"op":"run","source":"probe n in 1..=2 { true } probe n in 1..=2 { true }","limits":{"cases":3}}),
    );
    assert_eq!(r["probes"][0]["status"], "Clear");
    assert_eq!(r["probes"][1]["status"], "Unknown");
}
#[test]
fn fuel_during_probe_never_clears() {
    let r =
        request(json!({"op":"run","source":"probe n in 1..=11 { n == n }","limits":{"fuel":7}}));
    assert_eq!(r["probes"][0]["status"], "Unknown");
    assert!(r["probes"][0]["completed_cases"].as_u64().unwrap() < 11);
}
#[test]
fn output_allocation_source_and_call_caps() {
    let r = request(
        json!({"op":"run","source":"print(\"hello\"); probe n in 1..=1 { true }","limits":{"output_bytes":3}}),
    );
    assert_eq!(r["status"], "Unknown");
    assert_eq!(r["output"], "");
    assert_eq!(r["probes"][0]["status"], "Unknown");
    let r = request(
        json!({"op":"run","source":"probe n in 1..=1 { true }","limits":{"allocation_bytes":0}}),
    );
    assert_eq!(r["probes"][0]["status"], "Unknown");
    let r = request(json!({"op":"run","source":"print(1);","limits":{"source_bytes":0}}));
    assert_eq!(r["status"], "Unknown");
    let r = request(
        json!({"op":"run","source":"fn f() -> Int { 1 } print(f());","limits":{"call_depth":0}}),
    );
    assert_eq!(r["status"], "Unknown");
    let r = run(&" ".repeat(65537));
    assert_eq!(r["status"], "Unknown");
}
#[test]
fn nesting_and_operator_chains_are_bounded() {
    for source in [
        format!("print({}1{});", "(".repeat(1000), ")".repeat(1000)),
        format!("print({});", vec!["1"; 1000].join("+")),
        format!("print({}true);", "!".repeat(1000)),
    ] {
        let r = run(&source);
        assert_eq!(r["status"], "Unknown", "{r}");
    }
}
#[test]
fn malformed_unsupported_and_string_token_confusion() {
    for source in [
        "print(",
        "fn",
        "probe n in",
        "print(\"unterminated);",
        "print(\"\\q\");",
        "print(9223372036854775808);",
        "print(1e3);",
        "while true {}",
        "let a = [1];",
        "print(\"if\" true);",
        "probe n in \"1\"..=2 { true }",
        "print(1) ; @",
    ] {
        let r = run(source);
        assert_eq!(r["status"], "Error", "{source}: {r}");
    }
}
#[test]
fn utf8_diagnostics_are_byte_spans() {
    let source = "print(\"雪\"); @";
    let r = run(source);
    let span = &r["diagnostics"][0]["span"];
    assert_eq!(span["start"], source.find('@').unwrap());
    assert_eq!(span["end"], source.len());
}
fn with_helpers(helper: i64, unrelated: i64) -> String {
    format!("fn helper(n: Int) -> Int {{ n + {helper} }} fn bill(n: Int) -> Int {{ helper(n) }} fn unrelated() -> Int {{ {unrelated} }} probe n in 1..=3 {{ bill(n) > n }}")
}
#[test]
fn dependency_keys_are_transitive_not_whole_source() {
    let a = run(&with_helpers(1, 1));
    let b = run(&with_helpers(1, 2));
    let c = run(&with_helpers(2, 1));
    assert_ne!(a["revision"], b["revision"]);
    assert_eq!(
        a["probes"][0]["dependency_key"],
        b["probes"][0]["dependency_key"]
    );
    assert_ne!(
        a["probes"][0]["dependency_key"],
        c["probes"][0]["dependency_key"]
    );
    assert_eq!(
        a["probes"][0]["predicate_key"],
        c["probes"][0]["predicate_key"]
    );
    let changed_config =
        request(json!({"op":"run","source":with_helpers(1,1),"limits":{"fuel":99999}}));
    assert_ne!(
        a["probes"][0]["dependency_key"],
        changed_config["probes"][0]["dependency_key"]
    );
}
#[test]
fn historical_ghost_is_preserved_and_replay_is_new() {
    let b = run(BROKEN);
    let ghost = b["probes"][0]["ghost"].clone();
    let r = request(json!({"op":"replay","source":REPAIRED,"ghost":ghost}));
    assert_eq!(r["status"], "Pass");
    assert_eq!(r["replay"]["historical"], ghost);
    assert_eq!(r["replay"]["new_execution"], true);
    assert_ne!(r["revision"], ghost["revision"]);
    assert_ne!(r["replay"]["dependency_key"], ghost["dependency_key"]);
    let same = request(json!({"op":"replay","source":BROKEN,"ghost":ghost}));
    assert_eq!(same["status"], "Fail");
}
#[test]
fn replay_rejects_changed_spec_domain_or_corrupt_receipt() {
    let ghost = run(BROKEN)["probes"][0]["ghost"].clone();
    for source in [
        BROKEN.replace("1..=11", "1..=12"),
        BROKEN.replace(">= bill(n)", "> bill(n)"),
    ] {
        let r = request(json!({"op":"replay","source":source,"ghost":ghost}));
        assert_eq!(r["status"], "Error");
        assert_eq!(r["diagnostics"][0]["kind"], "Replay");
    }
    let mut corrupt = ghost.clone();
    corrupt["input"] = json!("8");
    let r = request(json!({"op":"replay","source":BROKEN,"ghost":corrupt}));
    assert_eq!(r["status"], "Error");
}
#[test]
fn agent_view_honors_utf8_text_budget_and_reports_omissions() {
    let source = "fn 雪() -> Int { 1 }";
    assert_eq!(run(source)["status"], "Error");
    let source = "fn helper() -> String { \"雪雪\" } fn f() -> String { helper() }";
    for budget in 0..150 {
        let r = request(json!({"op":"analyze","source":source,"focus":"f","budget":budget}));
        let v = &r["agent_view"];
        let text = v["text"].as_str().unwrap();
        assert_eq!(text.len(), v["used_bytes"].as_u64().unwrap() as usize);
        assert!(text.len() <= budget);
        assert!(v["omitted"].as_array().unwrap().len() >= 3);
    }
    let r = request(json!({"op":"analyze","source":source,"focus":"f"}));
    let text = r["agent_view"]["text"].as_str().unwrap();
    assert!(text.contains("fn helper() -> String"));
    assert!(!text.contains("雪雪"));
    assert_eq!(r["agent_view"]["overflow"], false);
}
#[test]
fn graph_is_conservative_and_cycle_safe() {
    let r = request(
        json!({"op":"analyze","source":"fn a() -> Int { if true { 1 } else { b() } } fn b() -> Int { a() }"}),
    );
    assert_eq!(r["graph"]["edges"].as_array().unwrap().len(), 2);
    assert_eq!(
        r["graph"]["functions"][0]["dependencies"],
        json!(["a", "b"])
    );
    assert_eq!(r["status"], "Ready");
}
#[test]
fn request_errors_and_effective_limits() {
    for raw in [
        "null",
        "{}",
        "{",
        "{\"op\":\"run\",\"source\":\"\",\"unknown\":true}",
    ] {
        let r: Value = serde_json::from_str(&wisp::dispatch(raw)).unwrap();
        assert_eq!(r["status"], "Error");
    }
    let r = request(json!({"op":"oops","source":""}));
    assert_eq!(r["status"], "Error");
    let r = request(json!({"op":"run","source":"","limits":{"fuel":999999999}}));
    assert_eq!(r["limits"]["fuel"], 100000);
}
#[test]
fn inventory_example_executes() {
    let r = run(include_str!("../examples/inventory.wisp"));
    assert_eq!(r["output"], "Inventory available:\ntrue\n");
    assert_eq!(r["probes"][0]["completed_cases"], 18);
}
