use serde_json::{json, Value};

fn request(value: Value) -> Value {
    serde_json::from_str(&wisp::dispatch(&value.to_string())).unwrap()
}
fn run(source: &str) -> Value {
    request(json!({"op":"run","source":source}))
}
fn analyze(source: &str) -> Value {
    request(json!({"op":"analyze","source":source}))
}
fn limited(source: &str, key: &str, limit: u64) -> Value {
    request(json!({"op":"run","source":source,"limits":{key:limit}}))
}
const ITEM: &str = "record Item { quantity: Int, unit_price: Int }";
const INVOICE: &str = include_str!("../examples/invoice.wisp");

#[test]
fn invoice_shared_core_and_original_examples() {
    let r = run(INVOICE);
    assert_eq!(r["status"], "Complete", "{r}");
    assert_eq!(
        r["output"],
        "Invoice { item: Item { quantity: 9, unit_price: 100 }, customer: \"Ada\" }\n900\n"
    );
    assert_eq!(r["probes"][0]["completed_cases"], 21);
    for (source, status) in [
        (include_str!("../examples/snacks.wisp"), "Fail"),
        (include_str!("../examples/snacks-repaired.wisp"), "Complete"),
        (include_str!("../examples/inventory.wisp"), "Complete"),
    ] {
        assert_eq!(run(source)["status"], status);
    }
}

#[test]
fn nominal_forward_empty_and_separate_type_namespace() {
    let source = "fn Box(Box: Box) -> Box { Box } record Box { inner: Empty } record Empty {} let Box = new Box { inner: new Empty {} }; print(Box(Box).inner == new Empty {}); print(new Empty {});";
    let r = run(source);
    assert_eq!(r["status"], "Complete", "{r}");
    assert_eq!(r["output"], "true\nEmpty {}\n");
    for source in [
        "record A {} record B {} print(new A {} == new B {});",
        "record A {} record B {} fn f(a: A)->A {a} f(new B {});",
        "record A {} record B {} print(if true {new A {}} else {new B {}});",
        "record A {} fn f()->A {1}",
    ] {
        assert_eq!(run(source)["status"], "Error", "{source}");
    }
}

#[test]
fn invalid_declarations_and_exact_constructor_fields_are_whole_program_errors() {
    for source in [
        "record A {} record A {}",
        "record A { x: Int, x: Bool }",
        "record A { x: Missing }",
        "fn unused(x: Missing)->Int {0}",
        "fn unused()->Missing {0}",
        "record A { x: A }",
        "record A { b: B } record B { a: A }",
        "record A { x: Int } new A {};",
        "record A { x: Int } new A { x: 1, x: 2 };",
        "record A { x: Int } new A { y: 1 };",
        "record A { x: Int } new A { x: true };",
        "new Missing {};",
        "print(1.x);",
        "record A { x: Int } print(new A { x: 1 }.y);",
        "record A { x: Int } fn unused()->Int {new A {x:true}.x}",
    ] {
        let r = run(source);
        assert_eq!(r["status"], "Error", "{source}: {r}");
        assert_eq!(r["diagnostics"][0]["kind"], "Type", "{r}");
        assert_eq!(r["output"], "");
    }
}

#[test]
fn only_new_keywords_and_no_unapproved_record_syntax() {
    for source in [
        "fn record()->Int {1}",
        "let new = 1;",
        "record A {new: Int}",
        "record A {x: Int,}",
        "record A {x: Int = 1}",
        "record A {x: Int} new A {x:1,};",
        "record A {x: Int} new A {x};",
        "record A {} A {};",
        "record A {x:Int} new A {x:1}.x();",
        "record A {x:Int} let a = new A {x:1}; a.x = 2;",
    ] {
        assert_eq!(run(source)["status"], "Error", "{source}");
    }
    assert_eq!(
        run("record Flag {} print(if true {new Flag {}} else {new Flag {}});")["status"],
        "Complete"
    );
}

#[test]
fn initializer_source_order_once_storage_declaration_order_and_fault_order() {
    let r = run("record Pair {a: Int, b: Int} fn mark(n:Int)->Int {print(n); n} print(new Pair {b:mark(2),a:mark(1)});");
    assert_eq!(r["output"], "2\n1\nPair { a: 1, b: 2 }\n");
    let r =
        run("record Pair {a: Int, b: Int} fn mark()->Int {print(2);2} new Pair {b:mark(),a:1/0};");
    assert_eq!(r["status"], "Error");
    assert_eq!(r["output"], "2\n");
    let r =
        run("record Pair {a: Int, b: Int} fn mark()->Int {print(2);2} new Pair {b:1/0,a:mark()};");
    assert_eq!(r["status"], "Error");
    assert_eq!(r["output"], "");
}

#[test]
fn projections_bind_tightly_on_all_expression_receivers_and_report_utf8_field_spans() {
    let source = "record A {x:Int} fn make()->A {new A {x:3}} print(-make().x * 2); print(new A {x:4}.x); print((if true {make()} else {new A {x:0}}).x); print(if true {make()} else {make()}.x);";
    let r = run(source);
    assert_eq!(r["status"], "Complete", "{r}");
    assert_eq!(r["output"], "-6\n4\n3\n3\n");
    for source in [
        "// é🦀\nrecord A {} new A {}.missing;",
        "// é🦀\nrecord A {} new A {missing:1};",
    ] {
        let r = run(source);
        let start = source.find("missing").unwrap();
        assert_eq!(
            r["diagnostics"][0]["span"],
            json!({"start":start,"end":start+7}),
            "{r}"
        );
    }
}

#[test]
fn purity_and_graph_traverse_all_initializers_and_projection_receivers() {
    for body in [
        "new A {x:dirty()}.x == n",
        "if false {new A {x:dirty()}.x == n} else {true}",
        "wrap().x == n",
    ] {
        let source = format!("record A {{x:Int}} fn dirty()->Int {{print(1);1}} fn wrap()->A {{new A {{x:dirty()}}}} probe n in 1..=1 {{{body}}}");
        let r = run(&source);
        assert_eq!(r["status"], "Error", "{r}");
        assert_eq!(r["diagnostics"][0]["kind"], "Purity");
    }
    let r = analyze("record A {x:Int} fn leaf()->Int {1} fn make()->A {new A {x:leaf()}} fn root()->Int {make().x}");
    assert!(r["graph"]["edges"]
        .as_array()
        .unwrap()
        .contains(&json!({"from":"make","to":"leaf","kind":"call"})));
    assert!(r["graph"]["edges"]
        .as_array()
        .unwrap()
        .contains(&json!({"from":"root","to":"make","kind":"call"})));
}

#[test]
fn nested_strings_are_escaped_but_standalone_strings_are_raw_and_equality_structural() {
    let r = run(
        r#"record Text {s:String} record Outer {t:Text, b:Bool} print(new Outer {b:true,t:new Text {s:"é\n\t\r\"\\"}}); print("é\n"); print(new Text {s:"x"} == new Text {s:"x"}); print(new Text {s:"x"} != new Text {s:"y"});"#,
    );
    assert_eq!(r["status"], "Complete", "{r}");
    assert_eq!(
        r["output"],
        "Outer { t: Text { s: \"é\\n\\t\\r\\\"\\\\\" }, b: true }\né\n\ntrue\ntrue\n"
    );
    let r = run("record Big {n:Int} print(new Big {n:9223372036854775807}); probe n in 9223372036854775807..=9223372036854775807 {new Big {n:n}.n < n}");
    assert_eq!(r["probes"][0]["failing_input"], "9223372036854775807");
    assert_eq!(r["output"], "Big { n: 9223372036854775807 }\n");
}

fn chain(depth: usize, branching: bool) -> String {
    let mut source = "record R0 {}\n".to_string();
    for i in 1..depth {
        source.push_str(&format!(
            "record R{i} {{a:R{}{} }}\n",
            i - 1,
            if branching {
                format!(", b:R{}", i - 1)
            } else {
                String::new()
            }
        ));
    }
    source
}

#[test]
fn type_dags_depth_fields_and_projection_chains_are_bounded() {
    for branching in [false, true] {
        assert_eq!(analyze(&chain(16, branching))["status"], "Ready");
        assert_eq!(analyze(&chain(17, branching))["status"], "Unknown");
    }
    let fields = |n| {
        (0..n)
            .map(|i| format!("f{i}:Int"))
            .collect::<Vec<_>>()
            .join(",")
    };
    assert_eq!(
        analyze(&format!("record A {{{}}}", fields(32)))["status"],
        "Ready"
    );
    assert_eq!(
        analyze(&format!("record A {{{}}}", fields(33)))["status"],
        "Unknown"
    );
    assert_eq!(
        analyze(&format!("record A {{}} new A {{}}{};", ".x".repeat(65)))["status"],
        "Unknown"
    );
    let mut source = chain(16, false);
    let mut value = "new R0 {}".to_string();
    for i in 1..16 {
        value = format!("new R{i} {{a:{value}}}");
    }
    source.push_str(&format!("let x = {value}; print(x == x);"));
    assert_eq!(run(&source)["status"], "Complete");
}

#[test]
fn record_metadata_and_agent_view_have_language_types_and_bounded_declarations() {
    let r = analyze(INVOICE);
    assert_eq!(r["compiler"], "wisp-0.1.0-semantics-5");
    assert_eq!(r["syntax_limits"]["record_type_depth"], 16);
    assert_eq!(r["graph"]["records"][0]["name"], "Invoice");
    let item = &r["graph"]["records"][1];
    assert_eq!(item["fields"][0]["type"], "Int");
    assert_eq!(item["fields"][0]["name"], "quantity");
    assert_eq!(item["declaration_hash"].as_str().unwrap().len(), 64);
    assert_eq!(
        r["graph"]["functions"][0]["signature"],
        "fn total(item: Item) -> Int"
    );
    assert!(r["agent_view"]["text"].as_str().unwrap().contains(ITEM));
    let r = request(json!({"op":"analyze","source":INVOICE,"budget":1}));
    assert_eq!(r["agent_view"]["overflow"], true);
    assert_eq!(r["agent_view"]["used_bytes"], 1);
    assert!(r["agent_view"]["omitted"]
        .as_array()
        .unwrap()
        .iter()
        .any(|v| v.as_str().unwrap().contains("record declarations")));
}

#[test]
fn record_only_edits_invalidate_even_direct_probes_but_not_predicate_identity() {
    let source = "record Unused {x:Int} fn used()->Int {1} fn other()->Int {2} probe n in 1..=1 {n == n} probe n in 1..=1 {used() == n}";
    let base = analyze(source);
    let edited = analyze(&source.replace("x:Int", "x:Bool"));
    assert_ne!(
        base["graph"]["functions"][0]["transitive_hash"],
        edited["graph"]["functions"][0]["transitive_hash"]
    );
    assert_ne!(
        base["graph"]["functions"][1]["transitive_hash"],
        edited["graph"]["functions"][1]["transitive_hash"]
    );
    for i in 0..2 {
        assert_eq!(
            base["probe_metadata"][i]["predicate_key"],
            edited["probe_metadata"][i]["predicate_key"]
        );
        assert_ne!(
            base["probe_metadata"][i]["dependency_key"],
            edited["probe_metadata"][i]["dependency_key"]
        );
    }
    for source in [
        format!("// offset shift é\n{source}"),
        source.replace("other()->Int {2}", "other()->Int {3}"),
    ] {
        let edited = analyze(&source);
        assert_eq!(base["probe_metadata"], edited["probe_metadata"]);
        assert_eq!(
            base["graph"]["functions"][0]["transitive_hash"],
            edited["graph"]["functions"][0]["transitive_hash"]
        );
        assert_eq!(
            base["graph"]["records"][0]["declaration_hash"],
            edited["graph"]["records"][0]["declaration_hash"]
        );
    }
}

#[test]
fn record_artifacts_reproduce_repair_and_reject_old_compiler_before_execution() {
    let broken = "record Price {unit:Int} fn price()->Price {new Price {unit:0}} probe n in 1..=2 {price().unit >= n}";
    let r = run(broken);
    let a = request(
        json!({"op":"archive","source":broken,"ghost":r["probes"][0]["ghost"],"limits":r["limits"]}),
    );
    assert_eq!(a["status"], "Ready", "{a}");
    let a = a["artifact"].clone();
    assert_eq!(a["version"], 1);
    assert_eq!(
        request(json!({"op":"inspect-artifact","source":"","artifact":a}))["status"],
        "Ready"
    );
    let repaired = broken.replace("unit:0", "unit:3");
    let r = request(json!({"op":"replay-artifact","source":repaired,"artifact":a}));
    assert_eq!(r["status"], "Pass", "{r}");
    assert_eq!(r["artifact"], a);
    assert_eq!(r["replay"]["historical"], a["ghost"]);
    let current_bad = repaired.replace("unit:3", "unit:true");
    let r = request(json!({"op":"replay-artifact","source":current_bad,"artifact":a}));
    assert_eq!(r["status"], "Error");
    assert_eq!(r["validation"]["status"], "Ready");
    let changed_spec = repaired.replace("1..=2", "1..=3");
    assert_eq!(
        request(json!({"op":"replay-artifact","source":changed_spec,"artifact":a}))["status"],
        "Error"
    );
    let mut old = a;
    old["compiler"] = json!("wisp-0.1.0-semantics-4");
    old["source"] = json!("not even valid source");
    let r = request(json!({"op":"inspect-artifact","source":"","artifact":old}));
    assert_eq!(r["status"], "Error");
    assert_eq!(r["validation"]["new_execution"], false);
    assert!(r["diagnostics"][0]["message"]
        .as_str()
        .unwrap()
        .contains("compiler"));
}

#[test]
fn copies_scope_function_bindings_equality_and_display_have_exact_cumulative_limits() {
    for source in [
        "record A {s:String} let a = new A {s:\"abc\"}; let b = a;",
        "record A {s:String} let a = new A {s:\"abc\"}; {a};",
        "record A {s:String} fn id(a:A)->A {a} id(new A {s:\"abc\"});",
        "record A {s:String} let a = new A {s:\"abc\"}; a.s;",
        "record A {s:String} new A {s:\"abc\"} == new A {s:\"abc\"};",
        "record A {s:String} print(new A {s:\"abc\"});",
    ] {
        let base = run(source);
        assert_eq!(base["status"], "Complete", "{base}");
        for (limit, usage) in [
            ("allocation_bytes", "logical_allocation_bytes"),
            ("fuel", "fuel"),
        ] {
            let exact = base["usage"][usage].as_u64().unwrap();
            assert_eq!(
                limited(source, limit, exact)["status"],
                "Complete",
                "{source}: {limit}={exact}"
            );
            assert_eq!(
                limited(source, limit, exact - 1)["status"],
                "Unknown",
                "{source}: {limit}={exact}-1"
            );
        }
    }
    // Fixed target-independent thresholds: 16 expression + 33 aggregate header.
    let r = run("record A {} new A {};");
    assert_eq!(r["usage"]["logical_allocation_bytes"], 49);
    assert_eq!(r["usage"]["fuel"], 1);
    let source = "record A {s:String} print(new A {s:\"é\\n\"});";
    let r = run(source);
    let bytes = r["output"].as_str().unwrap().len() as u64;
    assert_eq!(limited(source, "output_bytes", bytes)["status"], "Complete");
    let r = limited(source, "output_bytes", bytes - 1);
    assert_eq!(r["status"], "Unknown");
    assert_eq!(r["output"], "");
}

#[test]
fn aggregate_interruption_is_unknown_not_bool_or_clear_and_faults_are_errors() {
    let source = "record A {s:String} probe n in 1..=1 {new A {s:\"abc\"} == new A {s:\"abc\"}}";
    let base = run(source);
    for (key, usage) in [
        ("fuel", "fuel"),
        ("allocation_bytes", "logical_allocation_bytes"),
    ] {
        let exact = base["usage"][usage].as_u64().unwrap();
        let r = limited(source, key, exact - 1);
        assert_eq!(r["status"], "Unknown");
        assert_eq!(r["probes"][0]["status"], "Unknown");
        assert_eq!(r["probes"][0]["ghost"], Value::Null);
        assert_eq!(r["probes"][0]["completed_cases"], 0);
    }
    let r = run("record A {x:Int} probe n in 1..=1 {new A {x:1/0}.x == n}");
    assert_eq!(r["status"], "Error");
    assert_eq!(r["probes"][0]["diagnostic"]["kind"], "Runtime");
}

#[test]
fn aggregate_copy_sites_have_documented_target_independent_payload_charges() {
    for (source, allocation, fuel) in [
        (
            "record A {s:String} let a = new A {s:\"abc\"}; let b = a;",
            252,
            12,
        ),
        (
            "record A {s:String} let a = new A {s:\"abc\"}; {a};",
            369,
            18,
        ),
        (
            "record A {s:String} fn id(a:A)->A {a} id(new A {s:\"abc\"});",
            385,
            19,
        ),
        (
            "record A {s:String} let a = new A {s:\"abc\"}; a.s;",
            238,
            17,
        ),
        (
            "record A {s:String} new A {s:\"abc\"} == new A {s:\"abc\"};",
            218,
            21,
        ),
        ("record A {s:String} print(new A {s:\"abc\"});", 101, 23),
    ] {
        let r = run(source);
        assert_eq!(r["status"], "Complete", "{r}");
        assert_eq!(
            r["usage"]["logical_allocation_bytes"], allocation,
            "{source}"
        );
        assert_eq!(r["usage"]["fuel"], fuel, "{source}");
    }
}

#[test]
fn branching_value_expansion_stops_at_cumulative_resource_limits() {
    let mut source = chain(16, true);
    source.push_str("fn make0()->R0 {new R0 {}}\n");
    for i in 1..16 {
        source.push_str(&format!(
            "fn make{i}()->R{i} {{new R{i} {{a:make{}(),b:make{}()}}}}\n",
            i - 1,
            i - 1
        ));
    }
    source.push_str("make15();");
    let r = run(&source);
    assert_eq!(r["status"], "Unknown", "{r}");
    assert_eq!(r["diagnostics"][0]["kind"], "Limit");
    // Allocation/fuel/call limits are allowed to interrupt before the full tree
    // exists. Analyze checks only the shared type DAG, not its expanded tree.
    assert_eq!(analyze(&source)["status"], "Ready");
}
