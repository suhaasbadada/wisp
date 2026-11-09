use serde_json::{json, Value};
fn raw(s: &str) -> Value {
    serde_json::from_str(&wisp::dispatch(s)).unwrap()
}
fn send(v: Value) -> Value {
    raw(&v.to_string())
}
fn case(id: &str, value: &str) -> Value {
    json!({"id":id,"args":["2"],"expect":{"result":{"type":"Int","value":value},"output":""}})
}
fn request(before: &str, after: &str) -> Value {
    json!({"op":"review","source":before,"candidate":after,"suite":{"version":1,"target":"f","cases":[case("one","2")]}})
}
const COMPLETE: &str = "fn f(x: Int) -> Int { x }";
const ERROR: &str = "fn f(x: Int) -> Int { x / 0 }";
const UNKNOWN: &str = "fn f(x: Int) -> Int { f(x) }";
fn preflight(r: &Value, status: &str, code: &str) {
    assert_eq!(r["status"], status, "{r}");
    assert_eq!(r["diagnostics"][0]["code"], code, "{r}");
    assert_eq!(r["review"]["phase"], "preflight");
    assert_eq!(r["review"]["new_execution"], false);
    assert_eq!(r["review"]["cases"], json!([]));
}
#[test]
fn full_status_matrix_and_runtime_repair() {
    for (before, bs) in [
        (COMPLETE, "Complete"),
        (ERROR, "Error"),
        (UNKNOWN, "Unknown"),
    ] {
        for (after, cs) in [
            (COMPLETE, "Complete"),
            (ERROR, "Error"),
            (UNKNOWN, "Unknown"),
        ] {
            let r = send(request(before, after));
            let c = &r["review"]["cases"][0];
            assert_eq!(c["before"]["status"], bs);
            assert_eq!(c["after"]["status"], cs);
            let status = if cs == "Error" {
                "Error"
            } else if bs == "Unknown" || cs == "Unknown" {
                "Unknown"
            } else {
                "Pass"
            };
            assert_eq!(r["status"], status, "{r}");
            assert_eq!(
                c["comparison"],
                if bs == "Unknown" || cs == "Unknown" {
                    "Unknown"
                } else if cs == "Error" {
                    "Faulted"
                } else if bs == "Error" {
                    "Changed"
                } else {
                    "Unchanged"
                }
            );
            assert_eq!(r["review"]["approval"], "not_granted");
            assert!(c["before"].get("graph").is_none());
            assert!(r.get("usage").is_none());
        }
    }
    let r = send(request(ERROR, COMPLETE));
    assert_eq!(
        r["review"]["cases"][0]["comparison_reason"],
        "baseline_fault_repaired"
    );
}
#[test]
fn counts_fresh_limits_and_continue_after_fault() {
    for n in [0, 16, 17] {
        let mut q = request(COMPLETE, COMPLETE);
        q["suite"]["cases"] = json!((0..n)
            .map(|i| case(&format!("c{i}"), "2"))
            .collect::<Vec<_>>());
        q["limits"] = json!({"cases":0,"fuel":10});
        let r = send(q);
        if n == 0 {
            preflight(&r, "Error", "E_REVIEW_REQUEST");
        } else if n == 17 {
            preflight(&r, "Unknown", "E_LIMIT_REVIEW_CASES");
        } else {
            assert_eq!(r["status"], "Pass");
            assert_eq!(r["review"]["summary"]["attempted_invocations"], 32);
            for c in r["review"]["cases"].as_array().unwrap() {
                assert_eq!(c["before"]["usage"], c["after"]["usage"]);
            }
        }
    }
    let mut q = request(ERROR, ERROR);
    q["suite"]["cases"] = json!([case("a", "2"), case("b", "2")]);
    assert_eq!(send(q)["review"]["summary"]["expectation_error"], 2);
}
#[test]
fn presence_and_legacy_nulls() {
    for op in [
        "call",
        "capabilities",
        "edit",
        "run",
        "archive",
        "context",
        "unknown",
    ] {
        for field in ["candidate", "suite"] {
            let q = format!(r#"{{"op":"{op}","source":"!","{field}":null}}"#);
            assert_eq!(raw(&q)["diagnostics"][0]["code"], "E_REQUEST_INVALID");
        }
    }
    for field in [
        "args", "change", "function", "focus", "budget", "ghost", "artifact",
    ] {
        let mut q = request(COMPLETE, COMPLETE);
        q[field] = Value::Null;
        let r = send(q);
        if field == "function" {
            assert_eq!(r["diagnostics"][0]["code"], "E_REQUEST_INVALID");
            assert!(r.get("review").is_none());
        } else if ["args", "change"].contains(&field) {
            preflight(&r, "Error", "E_REVIEW_REQUEST");
        } else {
            assert_eq!(r["status"], "Pass", "{r}");
        }
    }
    let mut q = request(COMPLETE, COMPLETE);
    q["limits"] = json!({"bad":0});
    q["suite"] = Value::Null;
    assert_eq!(send(q)["diagnostics"][0]["code"], "E_REQUEST_INVALID");
    for field in ["candidate", "suite"] {
        let mut q = request(COMPLETE, COMPLETE);
        q[field] = Value::Null;
        preflight(&send(q), "Error", "E_REVIEW_REQUEST");
    }
}

#[test]
fn explicit_null_function_preserves_legacy_transport_rejection_and_no_execution() {
    for op in ["run", "call", "capabilities", "edit", "analyze", "review"] {
        let r = raw(&format!(
            r#"{{"op":"{op}","source":"print(7);","function":null}}"#
        ));
        assert_eq!(r["status"], "Error", "{r}");
        assert_eq!(r["diagnostics"][0]["code"], "E_REQUEST_INVALID");
        assert_eq!(r["revision"], "");
        assert_eq!(r["output"], "");
        assert!(r.get("usage").is_none());
        assert!(r.get("review").is_none());
    }
}
#[test]
fn strict_suite_envelopes_duplicates_and_ids() {
    let valid = json!({"version":1,"target":"f","cases":[case("x","2")]}).to_string();
    let suites = [
        "null".into(),
        valid.replace("\"version\":1", "\"version\":1,\"ver\\u0073ion\":1"),
        valid.replace("\"id\":\"x\"", "\"id\":\"x\",\"id\":\"y\""),
        valid.replace("\"output\":\"\"", "\"output\":\"\",\"output\":\"\""),
        valid.replace("\"type\":\"Int\"", "\"type\":\"Int\",\"type\":\"Int\""),
        valid.replace("\"version\":1", "\"version\":1,\"extra\":0"),
    ];
    for s in suites {
        let q = format!(
            "{{\"op\":\"review\",\"source\":{},\"candidate\":{},\"suite\":{s}}}",
            json!(COMPLETE),
            json!(COMPLETE)
        );
        preflight(&raw(&q), "Error", "E_REVIEW_REQUEST");
    }
    for id in ["", "not valid", "é", &"a".repeat(65)] {
        let mut q = request(COMPLETE, COMPLETE);
        q["suite"]["cases"][0]["id"] = json!(id);
        preflight(&send(q), "Error", "E_REVIEW_REQUEST");
    }
    let mut q = request(COMPLETE, COMPLETE);
    q["suite"]["cases"] = json!([case("x", "2"), case("x", "2")]);
    preflight(&send(q), "Error", "E_REVIEW_REQUEST");
}
#[test]
fn global_preflight_last_case_and_source_precedence() {
    for bad in ["args", "expect"] {
        let mut q = request(ERROR, COMPLETE);
        q["suite"]["cases"] = json!([case("first", "2"), case("last", "2")]);
        if bad == "args" {
            q["suite"]["cases"][1]["args"] = json!([2]);
        } else {
            q["suite"]["cases"][1]["expect"]["result"]["value"] = json!(2);
        }
        let r = send(q);
        preflight(
            &r,
            "Error",
            if bad == "args" {
                "E_INPUT_TYPE"
            } else {
                "E_REVIEW_EXPECTATION"
            },
        );
        assert!(r["diagnostics"][0]["path"]
            .as_str()
            .unwrap()
            .starts_with("/suite/cases/1/"));
    }
    let mut q = request(
        "fn f(x: Int) -> Int { x } fn unused() -> Int { nope }",
        COMPLETE,
    );
    q["suite"]["cases"][0]["args"] = json!([2]);
    preflight(&send(q), "Error", "E_NAME_UNKNOWN");
    let mut q = request(COMPLETE, "\n\nfn f(x: Int) -> Int { nope }");
    q["suite"]["cases"][0]["args"] = json!([2]);
    let r = send(q);
    preflight(&r, "Error", "E_NAME_UNKNOWN");
    assert_eq!(r["diagnostics"][0]["span"], json!({"start":0,"end":0}));
    assert!(
        r["review"]["cause"]["diagnostic"]["span"]["start"]
            .as_u64()
            .unwrap()
            > 2
    );
    assert_eq!(r["review"]["cause"]["document"], "candidate");
}
#[test]
fn raw_args_identity_and_typed_record_order() {
    let source = "record R { a: Int, b: String } fn f(x: R) -> R { x }";
    let args = r#"[ { "b" : "\u0061", "a":"2" } ]"#;
    let call = raw(&format!(
        "{{\"op\":\"call\",\"source\":{},\"function\":\"f\",\"args\":{args}}}",
        json!(source)
    ));
    let r = raw(&format!(
        r#"{{"op":"review","source":{0},"candidate":{0},"suite":{{"version":1,"target":"f","cases":[{{"id":"x","args":{args},"expect":{{"result":{{"type":"R","value":{{"b":"a","a":"2"}}}},"output":""}}}}]}}}}"#,
        json!(source)
    ));
    assert_eq!(r["status"], "Pass", "{r}");
    assert_eq!(
        r["review"]["cases"][0]["after"]["invocation"]["execution_key"],
        call["invocation"]["execution_key"]
    );
    let duplicate = args.replace("\"a\":\"2\"", "\"a\":\"2\",\"\\u0061\":\"2\"");
    let q = format!(
        r#"{{"op":"review","source":{0},"candidate":{0},"suite":{{"version":1,"target":"f","cases":[{{"id":"x","args":{duplicate},"expect":{{"result":{{"type":"R","value":{{"a":"2","b":"a"}}}},"output":""}}}}]}}}}"#,
        json!(source)
    );
    preflight(&raw(&q), "Error", "E_INPUT_FIELD_DUPLICATE");
}
#[test]
fn boundary_uses_reachable_records_only() {
    let before = "record R { n: Int } record Unused { n: Int } fn f(x: R) -> Int { x.n }";
    let after = "record Unused { text: String } fn f(x: R) -> Int { x.n } record R { n: Int }";
    let mut q = request(before, after);
    q["suite"]["cases"][0]["args"] = json!([{"n":"2"}]);
    assert_eq!(send(q.clone())["status"], "Pass");
    q["candidate"] = json!(after.replace("record R { n: Int }", "record R { n: Bool }"));
    preflight(&send(q), "Error", "E_TYPE_MISMATCH");
    let mut q = request(COMPLETE, "fn f(y: Int) -> Int { y }");
    preflight(&send(q.clone()), "Error", "E_REVIEW_TARGET");
    q["candidate"] = json!(COMPLETE);
    assert_eq!(send(q)["status"], "Pass");
    let a = "record Inner { n: Int } record R { a: Inner, b: Bool } fn f(x: R) -> Int { 2 }";
    let b = a.replace("a: Inner, b: Bool", "b: Bool, a: Inner");
    let mut q = request(a, &b);
    q["suite"]["cases"][0]["args"] = json!([{"a":{"n":"2"},"b":true}]);
    preflight(&send(q), "Error", "E_REVIEW_TARGET");
}
#[test]
fn exact_output_and_candidate_mismatch() {
    for text in ["é\r\n\0", "é\n\0"] {
        let mut q = request(
            "fn f(x: String) -> Int { 2 }",
            "fn f(x: String) -> Int { print(x); 2 }",
        );
        q["suite"]["cases"][0]["args"] = json!([text]);
        q["suite"]["cases"][0]["expect"]["output"] = json!(format!("{text}\n"));
        let r = send(q.clone());
        assert_eq!(r["status"], "Pass", "{r}");
        assert_eq!(r["review"]["cases"][0]["comparison"], "Changed");
        q["suite"]["cases"][0]["expect"]["output"] = json!(text);
        assert_eq!(send(q)["status"], "Fail");
    }
    let mut q = request(COMPLETE, COMPLETE);
    q["suite"]["cases"][0]["expect"]["result"]["value"] = json!("3");
    let r = send(q);
    assert_eq!(r["status"], "Fail");
    assert_eq!(r["review"]["summary"]["expectation_fail"], 1);
}
#[test]
fn query_keys_and_independent_source_limits() {
    let q = request(COMPLETE, COMPLETE);
    let base = send(q.clone());
    let key = base["review"]["query_key"].clone();
    for field in ["source", "candidate", "suite", "limits"] {
        let mut q = q.clone();
        match field {
            "source" | "candidate" => q[field] = json!(format!("{COMPLETE} ")),
            "suite" => q[field]["cases"][0]["id"] = json!("other"),
            _ => q[field] = json!({"fuel":999}),
        };
        assert_ne!(send(q)["review"]["query_key"], key);
    }
    let mut q = q;
    q["limits"] = json!({"source_bytes":COMPLETE.len()});
    q["candidate"] = json!(format!("{COMPLETE} "));
    let r = send(q);
    preflight(&r, "Unknown", "E_LIMIT_SOURCE");
    assert_eq!(r["review"]["diagnostic_document"], "candidate");
    let r = send(
        json!({"op":"review","source":COMPLETE,"candidate":COMPLETE,"limits":{"fuel":0},"suite":{"version":1,"target":"f","cases":[case("a","2")]}}),
    );
    assert_eq!(r["status"], "Unknown");
}
#[test]
fn reservation_workflow() {
    let before = include_str!("../examples/policies/reservations-before.wisp");
    let after = include_str!("../examples/policies/reservations-after.wisp");
    let suite: Value =
        serde_json::from_str(include_str!("../examples/policies/cases.json")).unwrap();
    let q = json!({"op":"review","source":before,"candidate":after,"suite":suite});
    let r = send(q.clone());
    assert_eq!(r["status"], "Pass", "{r}");
    assert_eq!(r["review"]["summary"]["changed"], 2);
    assert_eq!(r["review"]["summary"]["unchanged"], 5);
    let mut verify = q.clone();
    verify["source"] = json!(after);
    assert_eq!(send(verify)["status"], "Pass");
    let mut verify = q;
    verify["candidate"] = json!(before);
    assert_eq!(send(verify)["status"], "Fail");
}

#[test]
fn suite_byte_limits_expectation_depth_and_ownership() {
    let suite = json!({"version":1,"target":"f","cases":[case("x","2")]}).to_string();
    for (length, status) in [(65536, "Pass"), (65537, "Unknown")] {
        let padded = format!("{{{}{}", " ".repeat(length - suite.len()), &suite[1..]);
        let q = format!(
            "{{\"op\":\"review\",\"source\":{},\"candidate\":{},\"suite\":{padded}}}",
            json!(COMPLETE),
            json!(COMPLETE)
        );
        let r = raw(&q);
        assert_eq!(r["status"], status, "{r}");
        if status == "Unknown" {
            preflight(&r, status, "E_LIMIT_REVIEW_BYTES");
        }
    }
    let mut q = request(COMPLETE, COMPLETE);
    q["suite"]["cases"][0]["expect"]["result"]["value"] = json!("2");
    q["suite"]["cases"][0]["expect"]["output"] = json!("x".repeat(8193));
    preflight(&send(q), "Error", "E_REVIEW_EXPECTATION");
    let mut nested = json!("2");
    for _ in 0..17 {
        nested = json!({"n":nested});
    }
    let mut q = request(COMPLETE, COMPLETE);
    q["suite"]["cases"][0]["expect"]["result"]["value"] = nested;
    let r = send(q);
    preflight(&r, "Unknown", "E_LIMIT_INPUT_DEPTH");
    assert_eq!(r["review"]["cause"]["document"], "suite");
    assert_eq!(r["review"]["diagnostic_document"], "suite");
    let mut q = request(COMPLETE, COMPLETE);
    q["suite"]["cases"][0]["args"] = json!([2]);
    let r = send(q);
    preflight(&r, "Error", "E_INPUT_TYPE");
    assert_eq!(r["review"]["diagnostic_document"], "suite");
}

#[test]
fn canonical_extrema_expected_duplicate_fields_and_unknown_output_retention() {
    for value in ["-9223372036854775808", "9223372036854775807"] {
        let mut q = request(COMPLETE, COMPLETE);
        q["suite"]["cases"][0]["args"] = json!([value]);
        q["suite"]["cases"][0]["expect"]["result"]["value"] = json!(value);
        assert_eq!(send(q)["status"], "Pass");
    }
    for value in ["-0", "01", "9223372036854775808"] {
        let mut q = request(COMPLETE, COMPLETE);
        q["suite"]["cases"][0]["expect"]["result"]["value"] = json!(value);
        preflight(&send(q), "Error", "E_REVIEW_EXPECTATION");
    }
    let source = "record R { a: Int } fn f(x: R) -> R { x }";
    let q = format!(
        r#"{{"op":"review","source":{0},"candidate":{0},"suite":{{"version":1,"target":"f","cases":[{{"id":"x","args":[{{"a":"2"}}],"expect":{{"result":{{"type":"R","value":{{"a":"2","\u0061":"2"}}}},"output":""}}}}]}}}}"#,
        json!(source)
    );
    let r = raw(&q);
    preflight(&r, "Error", "E_REVIEW_EXPECTATION");
    assert_eq!(
        r["review"]["cause"]["diagnostic"]["code"],
        "E_INPUT_FIELD_DUPLICATE"
    );
    let source = "fn f(x: Int) -> Int { print(1); print(2); x }";
    let mut q = request(source, source);
    q["limits"] = json!({"output_bytes":2});
    let r = send(q);
    assert_eq!(r["status"], "Unknown");
    assert_eq!(r["review"]["cases"][0]["after"]["output"], "1\n");
    assert_eq!(r["review"]["cases"][0]["comparison"], "Unknown");
}
