use serde_json::{json, Value};
use sha2::{Digest, Sha256};

const SOURCE: &str = "fn twice(n: Int) -> Int { n * 2 }";
fn hash(s: &str) -> String {
    format!("{:x}", Sha256::digest(s.as_bytes()))
}
fn raw(s: &str) -> Value {
    serde_json::from_str(&wisp::dispatch(s)).unwrap()
}
fn send(v: Value) -> Value {
    raw(&v.to_string())
}
fn request(source: &str, target: &str, replacement: &str) -> Value {
    let metadata = send(json!({"op":"analyze","source":source}));
    let body_hash = metadata["graph"]["functions"]
        .as_array()
        .unwrap()
        .iter()
        .find(|f| f["name"] == target)
        .map(|f| f["body_hash"].clone())
        .unwrap_or(json!("0".repeat(64)));
    json!({"op":"edit","source":source,"focus":target,"change":{
        "expected_revision":hash(source),"expected_body_hash":body_hash,"replacement":replacement
    }})
}
fn error(r: &Value, code: &str, status: &str) {
    assert_eq!(r["status"], status, "{r}");
    assert_eq!(r["diagnostics"][0]["code"], code, "{r}");
    assert_eq!(r["new_execution"], false);
    assert!(r["edit"]["source"].is_null(), "{r}");
    assert!(r["edit"]["state"].is_null());
    assert!(r["usage"].is_null());
}

#[test]
fn exact_preparation_outer_whitespace_offsets_hashes_and_indexed_probe_preservation() {
    let source = "// π\r\nrecord Item { x: Int }\r\nfn twice(n: Int) -> Int { n * 2 }\r\nfn other() -> Int { 7 }\r\nlet x = other();\r\nprobe n in 1..=2 { twice(n) == n * 2 }\r\nprobe n in 1..=2 { twice(n) == n * 2 }";
    let replacement = "\u{2003}\r\n{ // inner } comment\r\n n + n }\r\n\u{2002}";
    let r = send(request(source, "twice", replacement));
    assert_eq!(r["status"], "Ready", "{r}");
    assert_eq!(r["revision"], hash(source));
    assert_eq!(r["new_execution"], false);
    assert_eq!(r["probes"], json!([]));
    assert_eq!(r["output"], "");
    assert!(r["usage"].is_null());
    assert!(r["graph"].is_null());
    let e = &r["edit"];
    assert_eq!(e["version"], 1);
    assert_eq!(e["state"], "prepared");
    let span = |key: &str| {
        (
            e[key]["start"].as_u64().unwrap() as usize,
            e[key]["end"].as_u64().unwrap() as usize,
        )
    };
    let (a, b) = span("base_body_span");
    let (c, d) = span("candidate_body_span");
    let (i, j) = span("insertion_range");
    let next = e["source"].as_str().unwrap();
    assert_eq!(&source[..a], &next[..i]);
    assert_eq!(&source[b..], &next[j..]);
    assert_eq!(&next[i..j], replacement);
    assert!(c > i && d < j);
    assert_eq!(e["base_body_hash"], hash(&source[a..b]));
    assert_eq!(e["candidate_body_hash"], hash(&next[c..d]));
    assert_eq!(e["base_revision"], hash(source));
    assert_eq!(e["candidate_revision"], hash(next));
    let metadata = send(json!({"op":"analyze","source":next}));
    assert_eq!(
        metadata["graph"]["functions"][0]["body_span"],
        e["candidate_body_span"]
    );
    assert_eq!(
        metadata["graph"]["functions"][0]["body_hash"],
        e["candidate_body_hash"]
    );
    let audit = e["preservation"]["probes"].as_array().unwrap();
    assert_eq!(audit.len(), 2);
    assert_eq!(audit[0]["predicate_key"], audit[1]["predicate_key"]);
    assert_eq!(audit[0]["index"], 0);
    assert_eq!(audit[1]["index"], 1);
    assert_eq!(e["preservation"]["checked"], true);
}

#[test]
fn preparation_is_not_execution_or_a_claim_about_behavior() {
    for replacement in ["{ n / 0 }", "{ n + 999 }"] {
        let mut req=request("print(1 / 0); fn twice(n: Int) -> Int { n * 2 } probe n in 1..=2 { twice(n) == n * 2 }","twice",replacement);
        req["limits"] = json!({"fuel":0,"cases":0,"output_bytes":0,"allocation_bytes":0});
        let r = send(req);
        assert_eq!(r["status"], "Ready", "{r}");
        assert_eq!(r["new_execution"], false);
        assert!(r["usage"].is_null());
        assert_eq!(r["probes"], json!([]));
    }
}

#[test]
fn strict_change_envelope_and_nonedit_presence_even_early_call() {
    let req = request(SOURCE, "twice", "{ n }");
    let good = req["change"].to_string();
    let env = |change: &str| {
        format!(
            "{{\"op\":\"edit\",\"source\":{},\"focus\":\"twice\",\"change\":{change}}}",
            json!(SOURCE)
        )
    };
    for bad in [
        "null".to_string(),
        "[]".into(),
        "{}".into(),
        good.replace("\"replacement\":", "\"extra\":null,\"replacement\":"),
        good.replace(
            "\"replacement\":",
            "\"replacement\":\"{}\",\"replacement\":",
        ),
        good.replace(
            "\"replacement\":",
            "\"replac\\u0065ment\":\"{}\",\"replacement\":",
        ),
    ] {
        error(&raw(&env(&bad)), "E_EDIT_REQUEST", "Error");
    }
    for field in ["expected_revision", "expected_body_hash", "replacement"] {
        let original = req["change"][field].to_string();
        let duplicate = good.replace(
            &format!("\"{field}\":"),
            &format!("\"{field}\":{original},\"{field}\":"),
        );
        error(&raw(&env(&duplicate)), "E_EDIT_REQUEST", "Error");
        let escaped = field.replacen('e', "\\u0065", 1);
        let duplicate = good.replace(
            &format!("\"{field}\":"),
            &format!("\"{escaped}\":{original},\"{field}\":"),
        );
        error(&raw(&env(&duplicate)), "E_EDIT_REQUEST", "Error");
    }
    for field in ["expected_revision", "expected_body_hash", "replacement"] {
        for value in [Value::Null, json!(0), json!([]), json!({})] {
            let mut q = req.clone();
            q["change"][field] = value;
            error(&send(q), "E_EDIT_REQUEST", "Error");
        }
        let mut q = req.clone();
        q["change"].as_object_mut().unwrap().remove(field);
        error(&send(q), "E_EDIT_REQUEST", "Error");
    }
    let mut missing = req.clone();
    missing.as_object_mut().unwrap().remove("change");
    error(&send(missing), "E_EDIT_REQUEST", "Error");
    for op in [
        "capabilities",
        "analyze",
        "context",
        "run",
        "call",
        "replay",
        "archive",
        "inspect-artifact",
        "replay-artifact",
        "bogus",
    ] {
        for change in ["null", "{}", &good] {
            let r = raw(&format!(
                "{{\"op\":{},\"source\":\"\",\"change\":{change}}}",
                json!(op)
            ));
            assert_eq!(
                r["diagnostics"][0]["code"], "E_REQUEST_INVALID",
                "{op}: {r}"
            );
        }
        let r = raw(&format!(
            "{{\"op\":{},\"source\":\"\",\"change\":null,\"change\":null}}",
            json!(op)
        ));
        assert_eq!(r["diagnostics"][0]["code"], "E_REQUEST_INVALID");
    }
}

#[test]
fn transport_schema_and_limits_preempt_edit_field_policy_on_every_operation() {
    for op in [
        "edit",
        "capabilities",
        "run",
        "call",
        "context",
        "analyze",
        "replay",
        "archive",
        "inspect-artifact",
        "replay-artifact",
    ] {
        for extra in [
            "",
            ",\"source\":null",
            ",\"source\":\"\",\"source\":\"\"",
            ",\"source\":\"\",\"unknown\":null",
        ] {
            let r = raw(&format!("{{\"op\":{},\"change\":null{extra}}}", json!(op)));
            assert_eq!(r["diagnostics"][0]["code"], "E_REQUEST_INVALID", "{r}");
            assert!(r["revision"].as_str().unwrap().is_empty());
        }
        let r = send(json!({"op":op,"source":"bad","change":null,"limits":null}));
        assert_eq!(r["diagnostics"][0]["code"], "E_REQUEST_INVALID");
        assert!(r["diagnostics"][0]["message"]
            .as_str()
            .unwrap()
            .starts_with("invalid limits:"));
        let envelope = format!("{{\"op\":{},\"source\":\"\",\"change\":null}}", json!(op));
        let oversized = format!("{envelope}{}", " ".repeat(wisp::TRANSPORT_BYTES));
        let r = raw(&oversized);
        assert_eq!(r["diagnostics"][0]["code"], "E_TRANSPORT_LIMIT");
        assert_eq!(r["status"], "Error");
    }
}

#[test]
fn precedence_schema_limits_fields_base_revision_target_body_replacement_candidate() {
    let q = request(SOURCE, "twice", "bad");
    let mut r = q.clone();
    r.as_object_mut().unwrap().remove("source");
    r["limits"] = Value::Null;
    assert_eq!(send(r)["diagnostics"][0]["code"], "E_REQUEST_INVALID");
    let mut r = q.clone();
    r["limits"] = Value::Null;
    r["change"] = Value::Null;
    assert_eq!(send(r)["diagnostics"][0]["code"], "E_REQUEST_INVALID");
    for field in ["function", "args"] {
        let mut r = q.clone();
        r[field] = if field == "args" {
            Value::Null
        } else {
            json!("twice")
        };
        assert_eq!(send(r)["diagnostics"][0]["code"], "E_REQUEST_INVALID");
    }
    for field in ["budget", "ghost", "artifact"] {
        let mut r = q.clone();
        r[field] = match field {
            "budget" => json!(0),
            "ghost" => {
                json!({"revision":"","predicate_key":"","dependency_key":"","input":"","witness_id":""})
            }
            _ => {
                json!({"format":"x","version":1,"compiler":"x","source":"","limits":{},"ghost":{"revision":"","predicate_key":"","dependency_key":"","input":"","witness_id":""}})
            }
        };
        error(&send(r), "E_EDIT_REQUEST", "Error");
    }
    for focus in [Value::Null, json!("")] {
        let mut r = q.clone();
        r["focus"] = focus;
        r["source"] = json!("bad");
        error(&send(r), "E_EDIT_REQUEST", "Error");
    }
    for bad in [
        "A".repeat(64),
        "0".repeat(63),
        "g".repeat(64),
        format!(" {}", "0".repeat(64)),
    ] {
        let mut r = q.clone();
        r["change"]["expected_revision"] = json!(bad);
        r["source"] = json!("bad");
        error(&send(r), "E_EDIT_REQUEST", "Error");
    }
    for (source, code) in [
        ("bad", "E_SYNTAX"),
        ("fn f() -> Int { false }", "E_TYPE_MISMATCH"),
        (
            "fn f() -> Int { print(1); 1 } probe n in 1..=1 { f()==1 }",
            "E_PROBE_IMPURE",
        ),
    ] {
        let mut r = q.clone();
        r["source"] = json!(source);
        r["change"]["expected_revision"] = json!("0".repeat(64));
        let response = send(r);
        error(&response, code, "Error");
        assert_eq!(response["revision"], hash(source));
        assert!(!response["diagnostics"][0]["span"].is_null());
    }
    let mut r = q.clone();
    r["limits"] = json!({"source_bytes":0});
    r["change"]["expected_revision"] = json!("0".repeat(64));
    error(&send(r), "E_LIMIT_SOURCE", "Unknown");
    let mut r = q.clone();
    r["focus"] = json!("missing");
    r["change"]["expected_revision"] = json!("0".repeat(64));
    error(&send(r), "E_EDIT_CONFLICT", "Error");
    let mut r = q.clone();
    r["focus"] = json!("missing");
    error(&send(r), "E_EDIT_TARGET", "Error");
    let mut r = q.clone();
    r["change"]["expected_body_hash"] = json!("0".repeat(64));
    error(&send(r), "E_EDIT_CONFLICT", "Error");
    error(&send(q), "E_EDIT_REPLACEMENT", "Error");
}

#[test]
fn standalone_real_block_parser_rejects_boundary_injection_but_allows_inner_comments_strings() {
    for bad in [
        "// leading\n{ n }",
        "{ n } // trailing",
        "{ n } // trailing\n",
        "{ n } {}",
        "{ n } 1",
        "{ n } fn injected() -> Int { 0 }",
        "n",
        "",
        "{};",
        "{ n",
    ] {
        let r = send(request(SOURCE, "twice", bad));
        error(&r, "E_EDIT_REPLACEMENT", "Error");
        assert_eq!(r["diagnostics"][0]["path"], "/change/replacement");
        assert_eq!(r["diagnostics"][0]["span"], json!({"start":0,"end":0}));
        assert_eq!(r["edit"]["cause"]["document"], "replacement");
        assert_eq!(r["edit"]["cause"]["revision"], hash(bad));
        assert_eq!(r["edit"]["cause"]["diagnostics"][0]["code"], "E_SYNTAX");
    }
    for good in [
        "{ // comment }\n n }",
        "{ let braces = \"} // {\"; n }",
        "\u{2003}\r\n{n}\r\n\u{2002}",
    ] {
        let r = send(request(SOURCE, "twice", good));
        assert_eq!(r["status"], "Ready", "{r}");
    }
}

#[test]
fn rejected_candidate_diagnostics_are_owned_by_candidate_including_shifted_unchanged_probe() {
    let source = "fn twice(n: Int) -> Int { n * 2 } probe n in 1..=2 { twice(n) == n * 2 }";
    for (body, code) in [
        ("{ true }", "E_TYPE_MISMATCH"),
        ("{ missing }", "E_NAME_UNKNOWN"),
        ("{ print(n); n + n + n }", "E_PROBE_IMPURE"),
    ] {
        let r = send(request(source, "twice", body));
        error(&r, "E_EDIT_CANDIDATE", "Error");
        assert_eq!(r["revision"], hash(source));
        assert_eq!(r["diagnostics"][0]["kind"], "Input");
        assert_eq!(r["diagnostics"][0]["span"], json!({"start":0,"end":0}));
        assert_eq!(r["diagnostics"][0]["path"], "/change/replacement");
        let c = &r["edit"]["rejected_candidate"];
        assert_eq!(c["document"], "candidate");
        let next = c["source"].as_str().unwrap();
        assert_eq!(c["revision"], hash(next));
        assert_eq!(c["diagnostics"][0]["code"], code);
        if code == "E_PROBE_IMPURE" {
            let start = c["diagnostics"][0]["span"]["start"].as_u64().unwrap() as usize;
            assert!(start >= next.find("probe").unwrap());
            assert_ne!(next.find("probe"), source.find("probe"));
        }
    }
}

#[test]
fn resource_exhaustion_keeps_original_limit_and_document() {
    let cases = [
        (
            format!("{{ {} }}", "n + ".repeat(70) + "n"),
            "E_LIMIT_SYNTAX_DEPTH",
        ),
        (
            format!("{{ {}0{} }}", "(".repeat(70), ")".repeat(70)),
            "E_LIMIT_SYNTAX_DEPTH",
        ),
        (
            format!("{{ {} n }}", "let x = 0; ".repeat(1800)),
            "E_LIMIT_TOKENS",
        ),
        (format!("{{n}}{}", " ".repeat(65536)), "E_LIMIT_SOURCE"),
    ];
    for (body, code) in cases {
        let r = send(request(SOURCE, "twice", &body));
        error(&r, code, "Unknown");
        assert_eq!(r["edit"]["cause"]["document"], "replacement");
        assert_eq!(r["edit"]["cause"]["diagnostics"][0]["code"], code);
        assert_eq!(r["diagnostics"][0]["path"], "/change/replacement");
    }
    let mut q = request(SOURCE, "twice", "{ n + n + n + n }");
    q["limits"] = json!({"source_bytes":SOURCE.len()});
    let r = send(q);
    error(&r, "E_LIMIT_SOURCE", "Unknown");
    assert_eq!(r["edit"]["cause"]["document"], "candidate");
    assert_eq!(r["edit"]["cause"]["phase"], "size_preflight");
    assert!(r["edit"]["rejected_candidate"].is_null());
    // Each individual document fits its token cap, but their combination does not.
    let source = format!("{} {SOURCE}", "print(0);".repeat(1500));
    let r = send(request(
        &source,
        "twice",
        &format!("{{ {} n }}", "let x = 0;".repeat(200)),
    ));
    error(&r, "E_LIMIT_TOKENS", "Unknown");
    assert_eq!(r["edit"]["rejected_candidate"]["document"], "candidate");
    assert_eq!(
        r["edit"]["rejected_candidate"]["diagnostics"][0]["code"],
        "E_LIMIT_TOKENS"
    );
}

#[test]
fn whole_baseline_token_and_depth_limits_preempt_guards() {
    for (source, code) in [
        (
            format!("{} {SOURCE}", "print(0);".repeat(1800)),
            "E_LIMIT_TOKENS",
        ),
        (
            format!("fn f() -> Int {{ {}0{} }}", "(".repeat(70), ")".repeat(70)),
            "E_LIMIT_SYNTAX_DEPTH",
        ),
    ] {
        let mut q = request(SOURCE, "twice", "{ n }");
        q["source"] = json!(source);
        let r = send(q);
        error(&r, code, "Unknown");
        assert!(r["edit"].is_null());
        assert_eq!(r["revision"], hash(&source));
    }
}

#[test]
fn full_frozen_semantics5_context_response_is_unchanged() {
    let expected: Value =
        serde_json::from_str(include_str!("fixtures/semantics5-context.json")).unwrap();
    let actual = send(
        json!({"op":"context","source":include_str!("../examples/snacks.wisp"),"focus":"probe:0","budget":4096}),
    );
    assert_eq!(actual, expected);
}

#[test]
fn exact_source_and_replacement_byte_caps_and_body_guard_form_are_independent() {
    let exact_source = format!(
        "{}{}",
        SOURCE,
        " ".repeat(wisp::SOURCE_BYTES - SOURCE.len())
    );
    let ready = send(request(&exact_source, "twice", "{ n * 2 }"));
    assert_eq!(ready["status"], "Ready", "{ready}");
    let over_source = exact_source + " ";
    let mut q = request(SOURCE, "twice", "{ n }");
    q["source"] = json!(over_source);
    error(&send(q), "E_LIMIT_SOURCE", "Unknown");
    let exact_replacement = format!("{{n}}{}", " ".repeat(wisp::REPLACEMENT_BYTES - 3));
    let r = send(request(SOURCE, "twice", &exact_replacement));
    error(&r, "E_LIMIT_SOURCE", "Unknown");
    assert_eq!(r["edit"]["cause"]["document"], "candidate"); // replacement itself fit
    let r = send(request(SOURCE, "twice", &(exact_replacement + " ")));
    error(&r, "E_LIMIT_SOURCE", "Unknown");
    assert_eq!(r["edit"]["cause"]["document"], "replacement");
    for bad in [
        "F".repeat(64),
        "0".repeat(65),
        "0".repeat(63),
        format!("{}\n", "0".repeat(64)),
    ] {
        let mut q = request(SOURCE, "twice", "invalid");
        q["change"]["expected_body_hash"] = json!(bad);
        error(&send(q), "E_EDIT_REQUEST", "Error");
    }
}
