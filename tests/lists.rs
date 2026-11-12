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
fn call(source: &str, args: Value) -> Value {
    request(json!({"op":"call","source":source,"function":"f","args":args}))
}
fn code(report: &Value) -> &str {
    report["diagnostics"][0]["code"].as_str().unwrap()
}
fn int_list(n: usize) -> String {
    format!("[Int; {}]", vec!["1"; n].join(","))
}
fn ty(depth: usize, leaf: &str) -> String {
    format!("{}{}{}", "[".repeat(depth), leaf, "]".repeat(depth))
}

#[test]
fn syntax_values_equality_length_and_record_length() {
    let r = run(r#"record R { length: Int }
        let xs = [[Int]; [Int;1,2], [Int;]];
        print(xs); print(xs[0][1]); print(xs.length); print(xs[1].length);
        print([Int;] == [Int;]); print([Int;1,2] != [Int;2,1]);
        print([Int;1] != [Int;1,2]); print(new R {length:7}.length);
        print([String; "hello\n", "界"]);"#);
    assert_eq!(r["status"], "Complete", "{r}");
    assert_eq!(
        r["output"],
        "[[1, 2], []]\n2\n2\n0\ntrue\ntrue\ntrue\n7\n[\"hello\\n\", \"界\"]\n"
    );
    for source in [
        "[Int; 1,];",
        "[Int];",
        "[;];",
        "[Int; true];",
        "[Int;1][true];",
        "[Int;].other;",
        "1[0];",
        "[Int;] == [Bool;];",
        "[Unit;];",
        "fn f(x: [Unit])->Int {0}",
    ] {
        assert_eq!(analyze(source)["status"], "Error", "{source}");
    }
}

#[test]
fn annotations_checked_even_when_empty_unused_or_unreachable() {
    for source in [
        "[Missing;];",
        "fn f()->Int { if true {1} else {[Missing;].length} }",
        "fn f(x: [[Missing]])->Int {0}",
        "fn f()->[Missing] {[Missing;]}",
    ] {
        let r = analyze(source);
        assert_eq!(code(&r), "E_NAME_UNKNOWN", "{source}: {r}");
    }
    for source in ["record R {xs:[R]}", "record R {xs:[S]} record S {r:[R]}"] {
        assert_eq!(code(&analyze(source)), "E_TYPE_RECURSIVE");
    }
}

#[test]
fn type_depth_combines_records_and_lists_and_bounds_parser() {
    for depth in [16, 17, 1000] {
        let source = format!("fn f(x:{})->Int {{0}}", ty(depth, "Int"));
        let r = analyze(&source);
        if depth == 16 {
            assert_eq!(r["status"], "Ready", "{r}");
        } else {
            assert_eq!(code(&r), "E_LIMIT_TYPE_DEPTH", "{r}");
        }
    }
    for (depth, status) in [(15, "Ready"), (16, "Unknown")] {
        let r = analyze(&format!(
            "record R {{}} fn f(x:{})->Int {{0}}",
            ty(depth, "R")
        ));
        assert_eq!(r["status"], status, "{r}");
    }
    let r = analyze(&format!(
        "if false {{[{};].length}} else {{0}};",
        ty(16, "Int")
    ));
    assert_eq!(code(&r), "E_LIMIT_TYPE_DEPTH");
}

#[test]
fn max_list_elements_in_source_and_input() {
    assert_eq!(
        run(&format!("print({}.length);", int_list(1024)))["output"],
        "1024\n"
    );
    let r = analyze(&format!("{};", int_list(1025)));
    assert_eq!(r["status"], "Unknown");
    assert_eq!(code(&r), "E_LIMIT_LIST_ELEMENTS");
    for n in [1024, 1025] {
        let r = call("fn f(xs:[Int])->Int {xs.length}", json!([vec!["1"; n]]));
        if n == 1024 {
            assert_eq!(r["result"]["value"], "1024", "{r}");
        } else {
            assert_eq!(code(&r), "E_LIMIT_LIST_ELEMENTS");
            assert_eq!(r["invocation"]["new_execution"], false);
            assert_eq!(r["diagnostics"][0]["path"], "/args/0");
        }
    }
}

#[test]
fn bounds_are_signed_and_portable() {
    for index in ["-1", "0", "1", "9223372036854775807"] {
        let r = call("fn f(xs:[Int], i:Int)->Int {xs[i]}", json!([["8"], index]));
        if index == "0" {
            assert_eq!(r["result"]["value"], "8");
        } else {
            assert_eq!(code(&r), "E_INDEX_BOUNDS", "{r}");
            assert_eq!(r["status"], "Error");
        }
    }
    assert_eq!(
        code(&call("fn f(xs:[Int])->Int {xs[0]}", json!([[]]))),
        "E_INDEX_BOUNDS"
    );
}

#[test]
fn receiver_then_index_and_elements_run_once_left_to_right() {
    let source = r#"fn receiver()->[Int] { print("receiver"); [Int;10,20] }
        fn index()->Int {print("index"); 1}
        fn element(n:Int)->Int {print(n); n}
        print(receiver()[index()]); print([Int;element(1),element(2)]);"#;
    let r = run(source);
    assert_eq!(r["output"], "receiver\nindex\n20\n1\n2\n[1, 2]\n", "{r}");
    let r =
        run("fn bad()->[Int] {print(1); [Int;1/0]} fn index()->Int {print(2);0} bad()[index()];");
    assert_eq!(code(&r), "E_DIV_ZERO");
    assert_eq!(r["output"], "1\n");
    let r = run("fn index()->Int {print(2);1/0} let xs=[Int;3]; xs[index()];");
    assert_eq!(code(&r), "E_DIV_ZERO");
    assert_eq!(r["output"], "2\n");
}

#[test]
fn children_drive_purity_dependencies_and_context() {
    for expression in [
        "[Int; impure()][0] == n",
        "[Int; n][impure()] == n",
        "if true {true} else {[Int;impure()].length == n}",
    ] {
        let source = format!("fn impure()->Int {{print(1);0}} probe n in 0..=1 {{{expression}}}");
        assert_eq!(code(&analyze(&source)), "E_PROBE_IMPURE", "{source}");
    }
    let source="fn element()->Int {1} fn index()->Int {0} fn f()->Int {[Int;element()][index()]} probe n in 0..=1 {f()==1}";
    let r = analyze(source);
    let node = r["graph"]["functions"]
        .as_array()
        .unwrap()
        .iter()
        .find(|f| f["name"] == "f")
        .unwrap();
    let dependencies = node["dependencies"].as_array().unwrap();
    assert!(
        dependencies.contains(&json!("element")) && dependencies.contains(&json!("index")),
        "{r}"
    );
    let r = request(json!({"op":"context","source":source,"focus":"probe:0"}));
    let text = r["context"]["text"].as_str().unwrap();
    assert!(
        text.contains("fn element") && text.contains("fn index"),
        "{r}"
    );
}

#[test]
fn typed_json_roundtrip_lists_nested_records_and_exact_strings() {
    let source = "record R {xs:[Int], text:String} fn f(xs:[[R]])->[[R]] {xs}";
    let value =
        json!([[[{"xs":["-9223372036854775808","9223372036854775807"],"text":"界\0\n"}],[]]]);
    let r = call(source, value.clone());
    assert_eq!(r["status"], "Complete", "{r}");
    assert_eq!(r["result"], json!({"type":"[[R]]","value":value[0]}));
    for value in [
        json!([["1", 1]]),
        json!([["1", "01"]]),
        json!([["1", "-0"]]),
        json!([["1", "9223372036854775808"]]),
    ] {
        let r = call("fn f(xs:[Int])->Int {xs.length}", value);
        assert_eq!(r["invocation"]["new_execution"], false, "{r}");
        assert_eq!(r["diagnostics"][0]["path"], "/args/0/1");
        assert!(r.get("usage").is_none());
    }
    let raw = r#"{"op":"call","source":"record R {x:Int} fn f(xs:[R])->Int {xs.length}","function":"f","args":[[{"x":"1","\u0078":"2"}]]}"#;
    let r: Value = serde_json::from_str(&wisp::dispatch(raw)).unwrap();
    assert_eq!(code(&r), "E_INPUT_FIELD_DUPLICATE");
    assert_eq!(r["diagnostics"][0]["path"], "/args/0/0/x");
    assert_eq!(r["invocation"]["new_execution"], false);
}

#[test]
fn json_depth_16_and_root_argument_17() {
    let source = format!("fn f(xs:{})->{} {{xs}}", ty(16, "Int"), ty(16, "Int"));
    let mut value = json!("1");
    for _ in 0..16 {
        value = json!([value]);
    }
    let r = call(&source, json!([value.clone()]));
    assert_eq!(r["status"], "Complete", "{r}");
    assert_eq!(r["result"]["value"], value);
    let r = call(&source, json!([[value]]));
    assert_eq!(code(&r), "E_LIMIT_INPUT_DEPTH");
    assert_eq!(r["invocation"]["new_execution"], false);
}

#[test]
fn combined_literal_and_runtime_depth_includes_empty_containers() {
    for depth in [16, 17] {
        let mut expression = "new R {}".to_string();
        let mut element_type = "R".to_string();
        for _ in 1..depth {
            expression = format!("[{element_type}; {expression}]");
            element_type = format!("[{element_type}]");
        }
        let r = run(&format!("record R {{}} print({expression});"));
        if depth == 16 {
            assert_eq!(r["status"], "Complete", "{r}");
        } else {
            assert_eq!(code(&r), "E_LIMIT_TYPE_DEPTH", "{r}");
        }
    }
    // The type of an empty list still contributes one aggregate level.
    let source = format!("fn f()->{} {{[{};]}}", ty(16, "Int"), ty(15, "Int"));
    let r = call(&source, json!([]));
    assert_eq!(r["status"], "Complete", "{r}");
    assert_eq!(r["result"]["value"], json!([]));
}

fn review(source: &str, candidate: &str, cases: Value) -> Value {
    request(
        json!({"op":"review","source":source,"candidate":candidate,"suite":{"version":1,"target":"f","cases":cases}}),
    )
}
#[test]
fn review_list_boundary_recurses_parameters_and_returns_before_any_execution() {
    for signature in ["fn f(xs:[R])->Int {xs.length}", "fn f()->[R] {[R;]}"] {
        let source = format!("record R {{x:Int}} {signature}");
        let candidate = format!("record R {{x:Bool}} {signature}");
        let r = review(
            &source,
            &candidate,
            json!([{"id":"one","args":[],"expect":{"result":{"type":"Int","value":"0"},"output":""}}]),
        );
        assert_eq!(code(&r), "E_REVIEW_TARGET", "{r}");
        assert_eq!(r["review"]["new_execution"], false);
    }
    let source = "fn f(xs:[Int])->[Int] {xs}";
    let r = review(
        source,
        source,
        json!([
            {"id":"valid","args":[["1"]],"expect":{"result":{"type":"[Int]","value":["1"]},"output":""}},
            {"id":"invalid","args":[["1",true]],"expect":{"result":{"type":"[Int]","value":[]},"output":""}}
        ]),
    );
    assert_eq!(code(&r), "E_INPUT_TYPE");
    assert_eq!(r["review"]["new_execution"], false);
    assert_eq!(r["review"]["cases"], json!([]));
    assert_eq!(r["diagnostics"][0]["path"], "/suite/cases/1/args/0/1");
}

#[test]
fn review_expectation_depth_and_last_expectation_preflight() {
    let source = format!("fn f(xs:{})->{} {{xs}}", ty(16, "Int"), ty(16, "Int"));
    let mut value = json!("1");
    for _ in 0..16 {
        value = json!([value]);
    }
    let case = json!({"id":"valid","args":[value.clone()],"expect":{"result":{"type":ty(16,"Int"),"value":value.clone()},"output":""}});
    let r = review(&source, &source, json!([case.clone()]));
    assert_eq!(r["status"], "Pass", "{r}");
    let mut bad = case.clone();
    bad["id"] = json!("bad");
    bad["expect"]["result"]["value"] = json!([value]);
    let r = review(&source, &source, json!([case, bad]));
    assert_eq!(code(&r), "E_LIMIT_INPUT_DEPTH");
    assert_eq!(r["review"]["new_execution"], false);
}

#[test]
fn interface_and_public_limits_advertise_lists() {
    let r = request(
        json!({"op":"describe","source":"record R {xs:[[Int]]} fn f(xs:[R])->[String] {[String;]}"}),
    );
    assert_eq!(r["interface"]["contract_version"], 2);
    assert_eq!(
        r["interface"]["functions"][0]["parameters"][0]["type"],
        json!({"kind":"List","element":{"kind":"Record","name":"R"}})
    );
    assert_eq!(r["interface"]["encodings"]["List"], "JSON_array");
    for r in [analyze(""), call("fn f()->Int {1}", json!([]))] {
        assert_eq!(r["syntax_limits"]["list_elements"], 1024);
    }
    let r = request(json!({"op":"capabilities","source":""}));
    let fixed = r["capabilities"]["limits"]["fixed"].as_array().unwrap();
    assert!(fixed
        .iter()
        .any(|v| v["name"] == "list_elements" && v["ceiling"] == 1024));
}

const SUM: &str =
    "fn f(xs:[Int], i:Int, acc:Int)->Int {if i == xs.length {acc} else {f(xs,i+1,acc+xs[i])}}";
#[test]
fn shared_1024_tail_sum_fits_defaults_and_low_budgets_interrupt() {
    let args = json!([vec!["1"; 1024], "0", "0"]);
    let r = call(SUM, args.clone());
    assert_eq!(r["status"], "Complete", "{r}");
    assert_eq!(r["result"]["value"], "1024");
    eprintln!("1024 Int tail sum usage: {}", r["usage"]);
    assert!(r["usage"]["fuel"].as_u64().unwrap() < 100_000);
    assert!(r["usage"]["logical_allocation_bytes"].as_u64().unwrap() < 1_048_576);
    for (key, limit, expected) in [
        ("fuel", 100, "E_LIMIT_FUEL"),
        ("allocation_bytes", 100, "E_LIMIT_ALLOCATION"),
        ("evaluation_depth", 2, "E_LIMIT_EVALUATION_DEPTH"),
    ] {
        let r = request(
            json!({"op":"call","source":SUM,"function":"f","args":args,"limits":{key:limit}}),
        );
        assert_eq!(r["status"], "Unknown", "{r}");
        assert_eq!(code(&r), expected);
        assert!(r.get("result").is_none());
    }
}

#[test]
fn shared_equality_and_serialization_are_not_free_or_partial() {
    let source = format!("let xs={}; print(xs == xs);", int_list(1024));
    let r = run(&source);
    assert_eq!(r["status"], "Complete", "{r}");
    let fuel = r["usage"]["fuel"].as_u64().unwrap();
    assert!(fuel > 2048);
    let r = request(json!({"op":"run","source":source,"limits":{"fuel":fuel-1024}}));
    assert_eq!(code(&r), "E_LIMIT_FUEL");
    assert_eq!(r["output"], "");
    let source = "fn f(xs:[String])->[[String]] {[[String];xs,xs,xs,xs]}";
    let r = call(source, json!([["a".repeat(3000)]]));
    assert_eq!(code(&r), "E_LIMIT_OUTPUT");
    assert!(r.get("result").is_none());
    let r = request(
        json!({"op":"call","source":"fn f()->[Int] {[Int;1,2]}","function":"f","limits":{"output_bytes":2}}),
    );
    assert_eq!(code(&r), "E_LIMIT_OUTPUT");
    assert!(r.get("result").is_none());
    let r = request(
        json!({"op":"call","source":"fn f(xs:[Int])->Int {f(xs)}","function":"f","args":[["1"]],"limits":{"fuel":100}}),
    );
    assert_eq!(code(&r), "E_LIMIT_FUEL");
}

#[test]
fn invoice_200_rows_matches_independent_integer_reference() {
    let source = "record Row {quantity:Int, price:Int, paid:Int}
        record Totals {billed:Int, outstanding:Int}
        fn f(rows:[Row], i:Int, billed:Int, outstanding:Int)->Totals {
            if i == rows.length {new Totals {billed:billed,outstanding:outstanding}}
            else {let row=rows[i]; let amount=row.quantity*row.price;
                f(rows,i+1,billed+amount,outstanding+amount-row.paid)}
        }";
    let mut billed = 0i64;
    let mut outstanding = 0i64;
    let rows:Vec<_>=(0..200i64).map(|i| {
        let quantity=i%7+1; let price=100+i*3; let paid=i%5*20;
        billed+=quantity*price; outstanding+=quantity*price-paid;
        json!({"quantity":quantity.to_string(),"price":price.to_string(),"paid":paid.to_string()})
    }).collect();
    let r = call(source, json!([rows, "0", "0", "0"]));
    assert_eq!(r["status"], "Complete", "{r}");
    assert_eq!(
        r["result"]["value"],
        json!({"billed":billed.to_string(),"outstanding":outstanding.to_string()})
    );
    eprintln!("200 Row invoice usage: {}", r["usage"]);
}
