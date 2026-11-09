use serde_json::{json, Value};

fn call(source: &str, function: &str, args: &str, limits: Value) -> Value {
    let raw = format!(
        "{{\"op\":\"call\",\"source\":{},\"function\":{},\"args\":{args},\"limits\":{limits}}}",
        json!(source),
        json!(function)
    );
    serde_json::from_str(&wisp::dispatch(&raw)).unwrap()
}
fn identity(source: &str, args: &str, limits: Value) -> Value {
    let r = call(source, "f", args, limits);
    assert_eq!(r["status"], "Complete", "{r}");
    r["invocation"]["execution_key"].clone()
}

#[test]
fn primitive_extrema_nested_records_and_declaration_order() {
    for (ty, values) in [
        (
            "Int",
            vec![
                json!("0"),
                json!(i64::MIN.to_string()),
                json!(i64::MAX.to_string()),
            ],
        ),
        ("Bool", vec![json!(true), json!(false)]),
        ("String", vec![json!(""), json!("é😀\n\"\\\u{0}")]),
    ] {
        for v in values {
            let r = call(
                &format!("fn f(x:{ty})->{ty} {{x}}"),
                "f",
                &json!([v]).to_string(),
                json!({}),
            );
            assert_eq!(r["status"], "Complete", "{r}");
            assert_eq!(r["result"], json!({"type":ty,"value":v}));
            assert_eq!(r["invocation"]["new_execution"], true);
            assert_eq!(r["agent_view"]["focus"], "f");
            assert_eq!(r["probes"], json!([]));
        }
    }
    let source =
        "record Child {z:Int,a:String} record Parent {z:Child,a:Bool} fn f(x:Parent)->Parent {x}";
    let args = r#"[{"a":true,"z":{"a":"hi","z":"-9223372036854775808"}}]"#;
    let request = format!(
        r#"{{"op":"call","source":{},"function":"f","args":{args}}}"#,
        json!(source)
    );
    let raw = wisp::dispatch(&request);
    assert!(
        raw.contains(r#""value":{"z":{"z":"-9223372036854775808","a":"hi"},"a":true}"#),
        "{raw}"
    );
    assert!(!raw.contains("__encoded"));
}

#[test]
fn exact_types_canonical_integer_strings_and_arity_before_execution() {
    let src = "fn f(x:Int)->Int { print(99); x }";
    for bad in [
        r#"["+1"]"#,
        r#"["01"]"#,
        r#"["-0"]"#,
        r#"[" 1"]"#,
        r#"["1 "]"#,
        r#"["1.0"]"#,
        r#"["9223372036854775808"]"#,
        "[1]",
        "[1e99999]",
        "[true]",
        "[null]",
        "[[]]",
        "[{}]",
        "[]",
        r#"["1","2"]"#,
        "null",
        "{}",
    ] {
        let r = call(src, "f", bad, json!({}));
        assert_eq!(r["status"], "Error", "{bad}: {r}");
        assert_eq!(r["diagnostics"][0]["kind"], "Input");
        assert_eq!(r["diagnostics"][0]["span"], json!({"start":0,"end":0}));
        assert!(r["diagnostics"][0]["path"]
            .as_str()
            .unwrap()
            .starts_with("/args"));
        assert_eq!(r["output"], "");
        assert_eq!(r["invocation"]["new_execution"], false);
        assert!(r.get("result").is_none());
    }
    for (ty, bad) in [("Bool", r#"["true"]"#), ("String", "[false]")] {
        assert_eq!(
            call(&format!("fn f(x:{ty})->{ty}{{x}}"), "f", bad, json!({}))["status"],
            "Error"
        );
    }
}

#[test]
fn record_duplicates_missing_unknown_nested_and_escaped_keys() {
    let src = "record A{x:Int} record B{a:A} fn f(b:B)->B{b}";
    for (args, path) in [
        (r#"[{"a":{"x":"1","x":"2"}}]"#, "/args/0/a/x"),
        (r#"[{"a":{"x":"1","\u0078":"2"}}]"#, "/args/0/a/x"),
        (r#"[{"a":{"x":"1"},"a":{"x":"2"}}]"#, "/args/0/a"),
        (r#"[{"a":{}}]"#, "/args/0/a/x"),
        (r#"[{"a":{"x":"1","~a/b":"2"}}]"#, "/args/0/a/~0a~1b"),
    ] {
        let r = call(src, "f", args, json!({}));
        assert_eq!(r["status"], "Error", "{r}");
        assert_eq!(r["diagnostics"][0]["path"], path);
        assert_eq!(r["invocation"]["new_execution"], false);
    }
}

#[test]
fn execution_is_only_target_but_checking_is_whole_program() {
    let src = "fn inner(x:String)->String{print(x);x} fn f(x:String)->String{inner(x)} print(1/0); probe n in 0..=0 {1/0==0}";
    let text = "\" ); print(999); fn evil()->Int{1} //";
    let r = call(src, "f", &json!([text]).to_string(), json!({}));
    assert_eq!(r["status"], "Complete", "{r}");
    assert_eq!(r["output"], format!("{text}\n"));
    assert_eq!(r["result"]["value"], text);
    for src in [
        "fn f()->Int{1} fn unused()->Int{true}",
        "fn f()->Int{1} print(missing);",
        "fn f()->Int{1} probe n in 0..=0 {1}",
    ] {
        let r = call(src, "f", "[]", json!({}));
        assert_eq!(r["status"], "Error");
        assert_eq!(r["diagnostics"][0]["kind"], "Type");
        assert_eq!(r["invocation"]["new_execution"], false);
    }
    let unknown = call("fn f()->Int{1}", "print", "[]", json!({}));
    assert_eq!(unknown["diagnostics"][0]["path"], "/function");
    assert_eq!(unknown["invocation"]["new_execution"], false);
    let default: Value = serde_json::from_str(&wisp::dispatch(
        r#"{"op":"call","source":"fn f()->Bool{true}","function":"f"}"#,
    ))
    .unwrap();
    assert_eq!(default["result"]["value"], true);
}

#[test]
fn output_exact_cap_escaping_shared_print_and_fault_preservation() {
    let src = "fn f(x:String)->String{print(1);x}";
    // print = 2 bytes, JSON string = 6 bytes: quote, escaped newline,
    // escaped quote, quote. No metadata counts toward this ceiling.
    let args = json!(["\n\""]).to_string();
    let r = call(src, "f", &args, json!({"output_bytes":8}));
    assert_eq!(r["status"], "Complete", "{r}");
    let r = call(src, "f", &args, json!({"output_bytes":7}));
    assert_eq!(r["status"], "Unknown", "{r}");
    assert_eq!(r["output"], "1\n");
    assert!(r.get("result").is_none());
    assert_eq!(r["invocation"]["new_execution"], true);
    for (text, cap) in [("\u{0}", 8), ("é😀", 8), ("\u{8}\u{c}", 6)] {
        let args = json!([text]).to_string();
        assert_eq!(
            call(
                "fn f(x:String)->String{x}",
                "f",
                &args,
                json!({"output_bytes":cap})
            )["status"],
            "Complete"
        );
        assert_eq!(
            call(
                "fn f(x:String)->String{x}",
                "f",
                &args,
                json!({"output_bytes":cap-1})
            )["status"],
            "Unknown"
        );
    }
    let r = call("fn f()->Int{print(7);1/0}", "f", "[]", json!({}));
    assert_eq!(r["status"], "Error");
    assert_eq!(r["output"], "7\n");
    assert!(r.get("result").is_none());
}

#[test]
fn input_raw_depth_fuel_allocation_and_call_limits() {
    let src = "fn f(x:String)->String{x}";
    // Exact raw cap succeeds. Whitespace is raw input material, not a language
    // allocation; a huge String additionally incurs ordinary block-copy fuel.
    let args = format!("[{}\"a\"]", " ".repeat(wisp::ARGUMENT_BYTES - 5));
    assert_eq!(
        call("fn f(x:String)->Bool{true}", "f", &args, json!({}))["status"],
        "Complete"
    );
    let args = format!("[\"{}\"]", "x".repeat(wisp::ARGUMENT_BYTES - 3));
    let r = call(src, "f", &args, json!({}));
    assert_eq!(r["status"], "Unknown");
    assert_eq!(r["invocation"]["new_execution"], false);
    let args = format!("{}0{}", "[".repeat(18), "]".repeat(18));
    assert_eq!(call(src, "f", &args, json!({}))["status"], "Unknown");
    for limits in [
        json!({"fuel":0}),
        json!({"allocation_bytes":0}),
        json!({"evaluation_depth":0}),
        json!({"call_depth":0}),
    ] {
        let r = call(src, "f", r#"["hello"]"#, limits);
        assert_eq!(r["status"], "Unknown", "{r}");
        assert_eq!(r["invocation"]["new_execution"], true);
        assert!(r.get("result").is_none());
    }
    // Shared evaluator charges exactly the same argument construction as a
    // literal source call, then additionally charges result serialization.
    let c = call(src, "f", r#"["abc"]"#, json!({}));
    let run: Value = serde_json::from_str(&wisp::dispatch(
        &json!({"op":"run","source":format!("{src} f(\"abc\");")}).to_string(),
    ))
    .unwrap();
    assert_eq!(
        c["usage"]["logical_allocation_bytes"].as_u64().unwrap(),
        run["usage"]["logical_allocation_bytes"].as_u64().unwrap() + 5
    );
    let allocation = c["usage"]["logical_allocation_bytes"].as_u64().unwrap();
    let fuel = c["usage"]["fuel"].as_u64().unwrap();
    assert_eq!(
        call(
            src,
            "f",
            r#"["abc"]"#,
            json!({"allocation_bytes":allocation,"fuel":fuel})
        )["status"],
        "Complete"
    );
    for limits in [
        json!({"allocation_bytes":allocation-1}),
        json!({"fuel":fuel-1}),
    ] {
        assert_eq!(call(src, "f", r#"["abc"]"#, limits)["status"], "Unknown");
    }
}

#[test]
fn invocation_identity_has_sound_conservative_invalidation_and_no_revision_coupling() {
    let base = "record A{x:Int} fn g(x:Int)->Int{x+1} fn f(x:Int)->Int{g(x)} fn unused()->Int{0}";
    let key = identity(base, r#"["1"]"#, json!({}));
    assert_eq!(
        key,
        identity(&base.replace("{0}", "{99}"), r#"["1"]"#, json!({}))
    );
    assert_eq!(
        key,
        identity(&format!("//offset\n{base}"), r#"["1"]"#, json!({}))
    );
    assert_eq!(key, identity(base, r#"["1"]"#, json!({"fuel":u64::MAX})));
    for changed in [
        base.replace("x+1", "x+2"),
        base.replace("{g(x)}", "{g(x)+1}"),
        base.replace("record A{x:Int}", "record A{x:Bool}"),
    ] {
        assert_ne!(key, identity(&changed, r#"["1"]"#, json!({})));
    }
    assert_ne!(key, identity(base, r#"["2"]"#, json!({})));
    assert_ne!(key, identity(base, r#"[ "1"]"#, json!({})));
    assert_ne!(key, identity(base, r#"["1"]"#, json!({"fuel":99999})));
    let g = call(base, "g", r#"["1"]"#, json!({}));
    assert_ne!(key, g["invocation"]["execution_key"]);
    assert_eq!(g["compiler"], "wisp-0.1.0-semantics-5");
}

#[test]
fn aggregate_encoding_and_maximum_depth_are_independently_bounded() {
    let source = "record A{z:String,a:Bool} fn f(x:A)->A{print(7);x}";
    let args = r#"[{"z":"\u0000","a":true}]"#;
    // {"z":"\u0000","a":true} is 23 bytes; print adds two.
    let expected = r#"{"z":"\u0000","a":true}"#;
    let cap = expected.len() + 2;
    let ok = call(source, "f", args, json!({"output_bytes":cap}));
    assert_eq!(ok["status"], "Complete", "{ok}");
    let fail = call(source, "f", args, json!({"output_bytes":cap-1}));
    assert_eq!(fail["status"], "Unknown", "{fail}");
    assert_eq!(fail["output"], "7\n");
    assert!(fail.get("result").is_none());

    let mut declarations = String::from("record R0{x:Int} ");
    let mut data = json!({"x":"1"});
    for n in 1..16 {
        declarations.push_str(&format!("record R{n}{{x:R{}}} ", n - 1));
        data = json!({"x":data});
    }
    let source = format!("{declarations} fn f(x:R15)->R15{{x}}");
    let r = call(&source, "f", &json!([data]).to_string(), json!({}));
    assert_eq!(r["status"], "Complete", "{r}");
    assert_eq!(r["result"]["value"], data);
    declarations.push_str("record R16{x:R15} fn f(x:R16)->R16{x}");
    let r = call(
        &declarations,
        "f",
        &json!([{"x":data}]).to_string(),
        json!({}),
    );
    assert_eq!(r["status"], "Unknown");
    assert_eq!(r["invocation"]["new_execution"], false);
}

#[test]
fn malformed_data_and_envelopes_never_execute_or_return_evidence() {
    let r = call("fn f(x:String)->String{x}", "f", r#"["\ud800"]"#, json!({}));
    assert_eq!(r["status"], "Error");
    assert_eq!(r["diagnostics"][0]["kind"], "Input");
    assert_eq!(r["invocation"]["new_execution"], false);
    for raw in [
        r#"{"op":"call","source":"fn f()->Int{1}","function":"f","args":[],"args":[]}"#,
        r#"{"op":"call","source":"fn f()->Int{1}","function":"f","function":"f"}"#,
        r#"{"op":"call","source":"fn f()->Int{1}","function":"f","args":[}"#,
    ] {
        let r: Value = serde_json::from_str(&wisp::dispatch(raw)).unwrap();
        assert_eq!(r["status"], "Error");
        assert_eq!(r["diagnostics"][0]["kind"], "Request");
        assert!(r.get("result").is_none());
        assert!(r.get("invocation").is_none());
    }
}
