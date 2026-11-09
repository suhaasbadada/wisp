use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::BTreeSet;
use wisp::DiagnosticCode as C;

fn raw(request: &str) -> Value {
    serde_json::from_str(&wisp::dispatch(request)).unwrap()
}
fn request(request: Value) -> Value {
    raw(&request.to_string())
}
fn run(source: &str) -> Value {
    request(json!({"op":"run","source":source}))
}
fn diagnostic(d: &Value, code: C) {
    assert_eq!(d["code"], code.wire(), "{d}");
    assert_eq!(d["kind"], code.kind(), "{d}");
    assert!(d["message"].is_string());
    assert!(d["span"]["start"].is_u64());
    assert!(d["span"]["end"].is_u64());
}
fn top(r: &Value, code: C, status: &str) {
    assert_eq!(r["status"], status, "{r}");
    diagnostic(&r["diagnostics"][0], code);
}
fn reidentify(ghost: &mut Value) {
    let material = json!([
        ghost["revision"],
        ghost["predicate_key"],
        ghost["dependency_key"],
        ghost["input"]
    ]);
    ghost["witness_id"] = json!(format!(
        "{:x}",
        Sha256::digest(material.to_string().as_bytes())
    ));
}

#[test]
fn exhaustive_unique_wire_catalog_kinds_and_docs_are_one_contract() {
    let r = request(json!({"op":"capabilities","source":""}));
    let codes = r["capabilities"]["diagnostics"]["codes"]
        .as_array()
        .unwrap();
    assert_eq!(codes.len(), C::ALL.len());
    assert_eq!(codes.len(), 50);
    let mut unique = BTreeSet::new();
    let docs = include_str!("../Docs/Errors.md");
    for (code, entry) in C::ALL.iter().zip(codes) {
        assert!(unique.insert(code.wire()));
        assert!(code.wire().starts_with("E_"));
        assert!(code.wire().len() <= 40);
        assert_eq!(
            entry,
            &json!({"code":code.wire(),"kind":code.kind(),"meaning":code.meaning()})
        );
        assert_eq!(serde_json::to_value(code).unwrap(), code.wire());
        let row = format!("| {} | {} | {} |", code.wire(), code.kind(), code.meaning());
        assert!(docs.contains(&row), "missing documented contract: {row}");
    }
    assert_eq!(
        docs.lines().filter(|s| s.starts_with("| E_")).count(),
        codes.len()
    );
    assert_eq!(C::NameUnknown.kind(), "Type");
    assert_eq!(C::TransportLimit.kind(), "Request");
    assert_eq!(C::ExecutionBlocked.kind(), "Limit");
}

#[test]
fn capabilities_are_bounded_source_independent_nonexecuting_and_runnable() {
    let base = request(json!({"op":"capabilities","source":""}));
    assert_eq!(base["status"], "Ready");
    assert_eq!(base["compiler"], "wisp-0.1.0-semantics-5");
    assert_eq!(base.as_object().unwrap().len(), 3);
    assert!(base.to_string().len() <= wisp::CAPABILITIES_BYTES);
    assert_eq!(wisp::CAPABILITIES_BYTES, 32768);
    for source in ["print(1/0);", "not source!!!", &"x".repeat(65537)] {
        let r = request(
            json!({"op":"capabilities","source":source,"focus":"PRIVATE","budget":0,"limits":{"source_bytes":0,"fuel":0},"ghost":null,"artifact":null}),
        );
        assert_eq!(base, r);
        assert!(!r.to_string().contains("PRIVATE"));
    }
    let c = &base["capabilities"];
    assert_eq!(c["discovery_contract_version"], 1);
    assert_eq!(c["diagnostic_contract_version"], 1);
    assert_eq!(c["diagnostics"]["version"], 1);
    assert_eq!(c["context_contract_version"], 1);
    assert_eq!(c["operations"].as_array().unwrap().len(), 10);
    assert_eq!(c["examples"].as_array().unwrap().len(), 5);
    assert_eq!(c["edit_contract_version"], 1);
    let context = c["operations"]
        .as_array()
        .unwrap()
        .iter()
        .find(|op| op["op"] == "context")
        .unwrap();
    assert_eq!(context["required_fields"], json!(["op", "source"]));
    assert_eq!(
        context["optional_fields"],
        json!(["focus", "budget", "limits"])
    );
    let call = c["operations"]
        .as_array()
        .unwrap()
        .iter()
        .find(|op| op["op"] == "call")
        .unwrap();
    assert!(call["required_fields"]
        .as_array()
        .unwrap()
        .contains(&json!("function")));
    assert!(!call["optional_fields"]
        .as_array()
        .unwrap()
        .contains(&json!("function")));
    let ops: BTreeSet<_> = c["operations"]
        .as_array()
        .unwrap()
        .iter()
        .map(|op| {
            assert!(op["required_fields"]
                .as_array()
                .unwrap()
                .contains(&json!("source")));
            assert!(op["optional_fields"].is_array());
            op["op"].as_str().unwrap()
        })
        .collect();
    assert_eq!(
        ops,
        BTreeSet::from([
            "capabilities",
            "run",
            "call",
            "edit",
            "analyze",
            "context",
            "replay",
            "archive",
            "inspect-artifact",
            "replay-artifact"
        ])
    );
    for op in ops {
        let r = request(json!({"op":op,"source":""}));
        assert_ne!(r["diagnostics"][0]["code"], C::OperationUnknown.wire());
    }
    for (_, permission) in c["permissions"]["language_core"].as_object().unwrap() {
        assert_eq!(permission, false);
    }
    for example in c["examples"].as_array().unwrap() {
        let r = request(example["request"].clone());
        assert_eq!(r["status"], example["expected_status"]);
        if let Some(result) = example.get("expected_result") {
            assert_eq!(&r["result"], result);
        }
    }
    let checked = run("");
    for limit in c["limits"]["configurable"].as_array().unwrap() {
        let name = limit["name"].as_str().unwrap();
        assert_eq!(limit["default"], checked["limits"][name]);
        assert_eq!(limit["ceiling"], checked["limits"][name]);
        assert!(limit["unit"].is_string());
        assert!(limit["scope"].is_string());
    }
    assert_eq!(
        c["limits"]["configurable"].as_array().unwrap().len(),
        checked["limits"].as_object().unwrap().len()
    );
    for (_, link) in c["docs"].as_object().unwrap() {
        assert!(std::path::Path::new(link.as_str().unwrap()).is_file());
    }
}

#[test]
fn request_decoding_and_error_precedence_remain_strict_for_discovery() {
    for op in [
        "capabilities",
        "run",
        "call",
        "analyze",
        "context",
        "replay",
        "archive",
        "inspect-artifact",
        "replay-artifact",
    ] {
        for fields in [
            "",
            ",\"source\":null",
            ",\"source\":\"\",\"source\":\"\"",
            ",\"source\":\"\",\"extra\":true",
        ] {
            let r = raw(&format!("{{\"op\":\"{op}\"{fields}}}"));
            top(&r, C::RequestInvalid, "Error");
            assert!(!r["diagnostics"][0]
                .as_object()
                .unwrap()
                .contains_key("path"));
        }
    }
    for text in [
        "null",
        "{",
        "[]",
        r#"{"op":"capabilities","source":"","limits":null}"#,
        r#"{"op":"capabilities","source":"","limits":{"fuel":1,"fuel":2}}"#,
        r#"{"op":"capabilities","source":"","function":null}"#,
        r#"{"op":"capabilities","source":"","args":null}"#,
    ] {
        top(&raw(text), C::RequestInvalid, "Error");
    }
    // Limits decode precedes operation fields, and unknown operation precedes source checking.
    let r = request(json!({"op":"capabilities","source":"","args":null,"limits":null}));
    assert!(r["diagnostics"][0]["message"]
        .as_str()
        .unwrap()
        .starts_with("invalid limits:"));
    top(
        &request(json!({"op":"bogus","source":"!!!"})),
        C::OperationUnknown,
        "Error",
    );
    // Compute padding from the actual encoded envelope, not a magic JSON width.
    let envelope = json!({"op":"capabilities","source":""}).to_string();
    let exact = format!(
        "{envelope}{}",
        " ".repeat(wisp::TRANSPORT_BYTES - envelope.len())
    );
    assert_eq!(raw(&exact)["status"], "Ready");
    top(&raw(&(exact + " ")), C::TransportLimit, "Error");
}

#[test]
fn source_diagnostics_have_explicit_known_reasons_and_legacy_spans() {
    for (source, code) in [
        ("print(@);", C::Syntax),
        ("print(missing);", C::NameUnknown),
        ("fn f()->Int{1} fn f()->Int{2}", C::NameDuplicate),
        ("print(1+true);", C::TypeMismatch),
        ("record A{x:Int} print(new A{x:1}.y);", C::FieldUnknown),
        ("record A{x:Int} print(new A{});", C::FieldMissing),
        ("record A{x:Int,x:Int}", C::FieldDuplicate),
        ("record A{x:Int} print(new A{x:1,x:2});", C::FieldDuplicate),
        ("record A{x:A}", C::TypeRecursive),
        (
            "fn f()->Bool{print(1);true} probe n in 1..=1{f()}",
            C::ProbeImpure,
        ),
    ] {
        let r = run(source);
        top(&r, code, "Error");
        assert!(!r["diagnostics"][0]
            .as_object()
            .unwrap()
            .contains_key("path"));
    }
    let r = run("print(\"é\"); print(@);");
    assert_eq!(r["diagnostics"][0]["span"], json!({"start":19,"end":20}));
    assert_eq!(r["output"], "");
}

#[test]
fn arithmetic_faults_distinguish_zero_from_overflow_without_usage_changes() {
    for (expression, code) in [
        ("1/0", C::DivZero),
        ("1%0", C::DivZero),
        ("9223372036854775807+1", C::IntOverflow),
        ("-9223372036854775808-1", C::IntOverflow),
        ("9223372036854775807*2", C::IntOverflow),
        ("-9223372036854775808/-1", C::IntOverflow),
        ("-9223372036854775808%-1", C::IntOverflow),
        ("-(-9223372036854775808)", C::IntOverflow),
    ] {
        let r = run(&format!("print({expression}); probe n in 1..=1{{true}}"));
        top(&r, code, "Error");
        diagnostic(&r["probes"][0]["diagnostic"], C::ExecutionBlocked);
        assert_eq!(r["probes"][0]["status"], "Unknown");
        assert_eq!(r["usage"]["attempted_cases"], 0);
        assert_eq!(r["output"], "");
    }
    let r = run("print(1/0);");
    assert_eq!(r["usage"]["fuel"], 3);
    assert_eq!(r["usage"]["logical_allocation_bytes"], 48);
    let r = run("probe n in 2..=1{true}");
    assert_eq!(r["status"], "Error");
    diagnostic(&r["probes"][0]["diagnostic"], C::ProbeDomain);
    let r = run("probe n in 1..=1{1/n>0} probe n in 0..=0{1/n>0}");
    diagnostic(&r["probes"][1]["diagnostic"], C::DivZero);
}

#[test]
fn input_codes_preserve_paths_raw_values_and_compile_before_input_order() {
    let source = "record A{x:Int} fn f(a:A)->Int{a.x}";
    for (args, code, path) in [
        ("null", C::InputType, "/args"),
        ("[]", C::InputArity, "/args"),
        ("[null]", C::InputType, "/args/0"),
        ("[{\"x\":1}]", C::InputType, "/args/0/x"),
        ("[{\"x\":\"-0\"}]", C::InputIntCanonical, "/args/0/x"),
        (
            "[{\"x\":\"9223372036854775808\"}]",
            C::InputIntCanonical,
            "/args/0/x",
        ),
        ("[{}]", C::InputFieldMissing, "/args/0/x"),
        ("[{\"y\":\"1\"}]", C::InputFieldUnknown, "/args/0/y"),
        (
            r#"[{"x":"1","\u0078":"2"}]"#,
            C::InputFieldDuplicate,
            "/args/0/x",
        ),
    ] {
        let r = raw(&format!(
            "{{\"op\":\"call\",\"source\":{},\"function\":\"f\",\"args\":{args}}}",
            json!(source)
        ));
        top(&r, code, "Error");
        assert_eq!(r["diagnostics"][0]["path"], path);
        assert_eq!(r["diagnostics"][0]["span"], json!({"start":0,"end":0}));
        assert_eq!(r["invocation"]["new_execution"], false);
        assert!(r.get("result").is_none());
    }
    top(
        &request(json!({"op":"call","source":source,"args":null})),
        C::InputTarget,
        "Error",
    );
    top(
        &request(json!({"op":"call","source":"! invalid","function":"nope","args":null})),
        C::Syntax,
        "Error",
    );
    assert_eq!(
        request(json!({"op":"call","source":"fn f()->Int{1}","function":"f"}))["status"],
        "Complete"
    );
}

#[test]
fn configurable_and_fixed_limits_are_distinct() {
    for (source, limits, code) in [
        ("print(1);", json!({"source_bytes":0}), C::LimitSource),
        ("print(1);", json!({"fuel":0}), C::LimitFuel),
        (
            "print(1);",
            json!({"allocation_bytes":0}),
            C::LimitAllocation,
        ),
        ("print(1);", json!({"output_bytes":0}), C::LimitOutput),
        (
            "fn f()->Int{f()} print(f());",
            json!({"call_depth":0}),
            C::LimitCallDepth,
        ),
        (
            "print(1);",
            json!({"evaluation_depth":0}),
            C::LimitEvaluationDepth,
        ),
    ] {
        top(
            &request(json!({"op":"run","source":source,"limits":limits})),
            code,
            "Unknown",
        );
    }
    let r = request(json!({"op":"run","source":"probe n in 1..=1{true}","limits":{"cases":0}}));
    diagnostic(&r["probes"][0]["diagnostic"], C::LimitCases);
    assert_eq!(r["status"], "Unknown");
    top(&run(&";".repeat(8193)), C::LimitTokens, "Unknown");
    top(
        &run(&format!("print({}1{});", "(".repeat(66), ")".repeat(66))),
        C::LimitSyntaxDepth,
        "Unknown",
    );
    top(
        &run(&format!(
            "record A{{{}}}",
            (0..33)
                .map(|i| format!("x{i}:Int"))
                .collect::<Vec<_>>()
                .join(",")
        )),
        C::LimitRecordFields,
        "Unknown",
    );
    let deep = (0..17)
        .map(|i| {
            if i == 16 {
                format!("record A{i}{{}} ")
            } else {
                format!("record A{i}{{x:A{}}} ", i + 1)
            }
        })
        .collect::<String>();
    top(&run(&deep), C::LimitTypeDepth, "Unknown");
    assert_eq!(run(&" ".repeat(65536))["status"], "Complete");
    top(&run(&" ".repeat(65537)), C::LimitSource, "Unknown");
    let source = "fn f(s:String)->String{s}";
    for (size, status) in [(65536, "Complete"), (65537, "Unknown")] {
        let args = format!("[\"\"{}]", " ".repeat(size - 4));
        assert_eq!(args.len(), size);
        let r = raw(&format!(
            "{{\"op\":\"call\",\"source\":{},\"function\":\"f\",\"args\":{args}}}",
            json!(source)
        ));
        assert_eq!(r["status"], status);
        if status == "Unknown" {
            top(&r, C::LimitInputBytes, "Unknown");
        }
    }
    let args = format!("{}0{}", "[".repeat(18), "]".repeat(18));
    let r = raw(&format!(
        "{{\"op\":\"call\",\"source\":{},\"function\":\"f\",\"args\":{args}}}",
        json!(source)
    ));
    top(&r, C::LimitInputDepth, "Unknown");
}

#[test]
fn pinned_semantics5_artifact_and_exact_raw_invoice_key_are_unchanged() {
    let artifact: Value =
        serde_json::from_str(include_str!("fixtures/semantics5-ghost.json")).unwrap();
    let r = request(json!({"op":"inspect-artifact","source":"","artifact":artifact}));
    assert_eq!(r["status"], "Ready");
    assert_eq!(r["artifact"]["ghost"], artifact["ghost"]);
    assert_eq!(
        artifact["ghost"]["dependency_key"],
        "cfa2713a591f99e2a027118481711efd2bf559f6801b01a15d69a79e480a8359"
    );
    assert_eq!(
        run(artifact["source"].as_str().unwrap())["probes"][0]["ghost"],
        artifact["ghost"]
    );
    let source = include_str!("../examples/invoice.wisp");
    // Embed the exact file body. Never parse/reserialize/trim input into new hash material.
    let args = include_str!("../examples/invoice-args.json");
    let r = raw(&format!(
        "{{\"op\":\"call\",\"source\":{},\"function\":\"total\",\"args\":{args}}}",
        json!(source)
    ));
    assert_eq!(r["status"], "Complete");
    assert_eq!(
        r["invocation"]["execution_key"],
        "f8411f40e06bfbbbf3e1f32792d6647cbf20f311d57026e36e8d81aaef08ba7f"
    );
    assert_eq!(r["result"], json!({"type":"Int","value":"900"}));
    assert_eq!(r["usage"]["fuel"], 29);
    assert_eq!(r["usage"]["logical_allocation_bytes"], 741);
}

#[test]
fn replay_artifact_codes_and_unknown_status_exception_are_preserved() {
    let artifact: Value =
        serde_json::from_str(include_str!("fixtures/semantics5-ghost.json")).unwrap();
    let source = artifact["source"].as_str().unwrap();
    let ghost = artifact["ghost"].clone();
    let mut bad = ghost.clone();
    bad["witness_id"] = json!("bad");
    top(
        &request(json!({"op":"replay","source":source,"ghost":bad})),
        C::ReplayReceipt,
        "Error",
    );
    top(
        &request(json!({"op":"replay","source":source.replace("1..=11","1..=12"),"ghost":ghost})),
        C::ReplaySpecification,
        "Error",
    );
    let mut bad = ghost.clone();
    bad["input"] = json!("999");
    reidentify(&mut bad);
    top(
        &request(json!({"op":"replay","source":source,"ghost":bad})),
        C::ReplayReceipt,
        "Error",
    );
    let r = request(json!({"op":"replay","source":source,"ghost":ghost,"limits":{"fuel":0}}));
    diagnostic(&r["replay"]["diagnostic"], C::LimitFuel);
    assert_eq!(r["status"], "Unknown");
    let r = request(json!({"op":"replay","source":source,"ghost":ghost,"limits":{"cases":0}}));
    diagnostic(&r["replay"]["diagnostic"], C::LimitCases);
    let mut bad = artifact.clone();
    bad["compiler"] = json!("old");
    top(
        &request(json!({"op":"inspect-artifact","source":"","artifact":bad})),
        C::ArtifactCompatibility,
        "Error",
    );
    let mut bad = artifact.clone();
    bad["ghost"]["revision"] = json!("bad");
    top(
        &request(json!({"op":"inspect-artifact","source":"","artifact":bad})),
        C::ArtifactInvalid,
        "Error",
    );
    let mut bad = artifact.clone();
    bad["ghost"]["input"] = json!("8");
    reidentify(&mut bad["ghost"]);
    top(
        &request(json!({"op":"inspect-artifact","source":"","artifact":bad})),
        C::ArtifactReproduction,
        "Error",
    );
    let mut limited = artifact.clone();
    limited["limits"]["fuel"] = json!(0);
    let analyzed = request(json!({"op":"analyze","source":source,"limits":limited["limits"]}));
    limited["ghost"]["dependency_key"] = analyzed["probe_metadata"][0]["dependency_key"].clone();
    reidentify(&mut limited["ghost"]);
    for op in ["inspect-artifact", "replay-artifact"] {
        let r = request(json!({"op":op,"source":source,"artifact":limited}));
        top(&r, C::ArtifactReproduction, "Unknown");
        assert_eq!(r["validation"]["new_execution"], true);
        assert!(r.get("artifact").is_none());
        assert!(r.get("replay").is_none());
    }
}
