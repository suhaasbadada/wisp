use serde_json::{json, Value};
use std::{fs, process::Command};

const BASELINE: &str = include_str!("../examples/invoice-batch.wisp");
const CANDIDATE: &str = include_str!("../examples/invoice-rule-review/bulk-discount.wisp");
const NEW: &str = include_str!("../examples/invoice-rule-review/cases.json");
const OLD: &str = include_str!("../examples/invoice-rule-review/previous-requirements.json");
const ARGS: &str = include_str!("../examples/invoice-rule-review/args.json");

fn send(request: Value) -> Value {
    serde_json::from_str(&wisp::dispatch(&request.to_string())).unwrap()
}

fn review(suite: Value) -> Value {
    send(json!({"op":"review","source":BASELINE,"candidate":CANDIDATE,"suite":suite}))
}

fn call(source: &str, args: Value) -> Value {
    send(json!({"op":"call","source":source,"function":"reconcile","args":args}))
}

#[test]
fn authored_change_is_exactly_one_expression_with_unchanged_boundary() {
    let replacement = "{ let gross = line.quantity * line.unit_cents; if line.quantity >= 10 { (gross / 10) * 9 + ((gross % 10) * 9) / 10 } else { gross } }";
    assert_eq!(
        BASELINE.matches("line.quantity * line.unit_cents").count(),
        1
    );
    assert_eq!(
        CANDIDATE.as_bytes(),
        BASELINE
            .replacen("line.quantity * line.unit_cents", replacement, 1)
            .as_bytes()
    );
    let before = call(BASELINE, json!([[], "0"]));
    let after = call(CANDIDATE, json!([[], "0"]));
    assert_eq!(before["status"], "Complete", "{before}");
    assert_eq!(after["status"], "Complete", "{after}");
    assert_eq!(before["result"], after["result"]);
    assert_eq!(before["limits"], after["limits"]);
    assert_eq!(after["limits"]["fuel"], 100_000);
    assert_eq!(after["limits"]["allocation_bytes"], 1_048_576);
    assert_eq!(before["graph"]["records"], after["graph"]["records"]);
    let function = |report: &Value, name: &str| {
        report["graph"]["functions"]
            .as_array()
            .unwrap()
            .iter()
            .find(|f| f["name"] == name)
            .unwrap()
            .clone()
    };
    let b = function(&before, "reconcile");
    let a = function(&after, "reconcile");
    assert_eq!(b["signature"], a["signature"]);
    assert_eq!(b["body_hash"], a["body_hash"]);
    assert_eq!(a["dependencies"], json!(["reconcile", "summarize"]));
    assert_ne!(b["transitive_hash"], a["transitive_hash"]);
    assert_ne!(
        function(&before, "summarize")["body_hash"],
        function(&after, "summarize")["body_hash"]
    );
    let focus = send(json!({"op":"analyze","source":CANDIDATE,"focus":"reconcile"}));
    assert_eq!(focus["agent_view"]["focus"], "reconcile", "{focus}");
    assert!(focus["agent_view"]["text"]
        .as_str()
        .unwrap()
        .contains("summarize"));
}

#[test]
fn handworked_requirements_expose_six_changes_and_no_approval() {
    let new: Value = serde_json::from_str(NEW).unwrap();
    let old: Value = serde_json::from_str(OLD).unwrap();
    assert_eq!(new["cases"].as_array().unwrap().len(), 9);
    assert_eq!(old["cases"].as_array().unwrap().len(), 9);
    for (n, o) in new["cases"]
        .as_array()
        .unwrap()
        .iter()
        .zip(old["cases"].as_array().unwrap())
    {
        assert_eq!(n["id"], o["id"]);
        assert_eq!(n["args"], o["args"]);
        // Both expectations are author-written fixtures, never inferred from a report.
        for (source, expected) in [(BASELINE, o), (CANDIDATE, n)] {
            let report = call(source, expected["args"].clone());
            assert_eq!(report["status"], "Complete", "{}: {report}", expected["id"]);
            assert_eq!(
                report["result"], expected["expect"]["result"],
                "{}",
                expected["id"]
            );
            assert_eq!(report["output"], ""); // Top-level sample is not executed.
        }
    }
    for (suite, status) in [(new, "Pass"), (old, "Fail")] {
        let report = review(suite);
        assert_eq!(report["status"], status, "{report}");
        assert_eq!(report["review"]["approval"], "not_granted");
        assert_eq!(report["review"]["summary"]["changed"], 6);
        assert_eq!(report["review"]["summary"]["unchanged"], 3);
        assert_eq!(report["review"]["summary"]["attempted_invocations"], 18);
        assert_eq!(
            report["review"]["summary"]["expectation_pass"],
            if status == "Pass" { 9 } else { 3 }
        );
        assert_eq!(
            report["review"]["summary"]["expectation_fail"],
            if status == "Pass" { 0 } else { 6 }
        );
        for case in report["review"]["cases"].as_array().unwrap() {
            assert_eq!(case["before"]["output"], "");
            assert_eq!(case["after"]["output"], "");
        }
    }
}

#[test]
fn malformed_last_row_preflights_entire_suite_without_execution() {
    let mut suite: Value = serde_json::from_str(NEW).unwrap();
    suite["cases"][8]["args"][0][1]["quantity"] = json!(10);
    let report = review(suite);
    assert_eq!(report["status"], "Error", "{report}");
    assert_eq!(report["diagnostics"][0]["code"], "E_INPUT_TYPE");
    assert_eq!(
        report["diagnostics"][0]["path"],
        "/suite/cases/8/args/0/1/quantity"
    );
    assert_eq!(report["review"]["phase"], "preflight");
    assert_eq!(report["review"]["new_execution"], false);
    assert_eq!(report["review"]["cases"], json!([]));
    assert!(report.get("usage").is_none());
}

#[test]
fn overflowing_gross_is_error_not_partial_reconciliation() {
    let report = call(
        CANDIDATE,
        json!([[{"quantity":"9","unit_cents":"100","declared_cents":"900"},
        {"quantity":"9223372036854775807","unit_cents":"2","declared_cents":"0"}], "900"]),
    );
    assert_eq!(report["status"], "Error", "{report}");
    assert_eq!(report["diagnostics"][0]["code"], "E_INT_OVERFLOW");
    assert!(report.get("result").is_none_or(Value::is_null));
    assert_eq!(report["output"], "");
}

#[test]
fn native_review_verify_and_runnable_data_preserve_inputs() {
    let root = env!("CARGO_MANIFEST_DIR");
    let snapshots = [
        ("examples/invoice-batch.wisp", BASELINE),
        ("examples/invoice-rule-review/bulk-discount.wisp", CANDIDATE),
        ("examples/invoice-rule-review/cases.json", NEW),
        (
            "examples/invoice-rule-review/previous-requirements.json",
            OLD,
        ),
        ("examples/invoice-rule-review/args.json", ARGS),
    ];
    for (suite, status, code) in [(snapshots[2].0, "Pass", 0), (snapshots[3].0, "Fail", 1)] {
        for args in [
            vec!["review", snapshots[0].0, snapshots[1].0, "--suite", suite],
            vec!["verify", snapshots[1].0, "--suite", suite],
        ] {
            let out = Command::new(env!("CARGO_BIN_EXE_wisp"))
                .current_dir(root)
                .args(&args)
                .output()
                .unwrap();
            assert_eq!(
                out.status.code(),
                Some(code),
                "{args:?}: {}",
                String::from_utf8_lossy(&out.stderr)
            );
            let report: Value = serde_json::from_slice(&out.stdout).unwrap();
            assert_eq!(report["status"], status, "{report}");
            assert_eq!(report["review"]["approval"], "not_granted");
            if args[0] == "review" {
                assert_eq!(report["review"]["summary"]["changed"], 6);
                assert_eq!(report["review"]["summary"]["unchanged"], 3);
            }
        }
    }
    let out = Command::new(env!("CARGO_BIN_EXE_wisp"))
        .current_dir(root)
        .args(["verify", snapshots[0].0, "--suite", snapshots[3].0])
        .output()
        .unwrap();
    assert_eq!(out.status.code(), Some(0));
    let report: Value = serde_json::from_slice(&out.stdout).unwrap();
    assert_eq!(report["status"], "Pass");
    let out = Command::new(env!("CARGO_BIN_EXE_wisp"))
        .current_dir(root)
        .args([
            "validate",
            snapshots[1].0,
            "reconcile",
            "--args-file",
            snapshots[4].0,
        ])
        .output()
        .unwrap();
    assert_eq!(out.status.code(), Some(0));
    let report: Value = serde_json::from_slice(&out.stdout).unwrap();
    assert_eq!(report["status"], "Ready");
    let out = Command::new(env!("CARGO_BIN_EXE_wisp"))
        .current_dir(root)
        .args([
            "call",
            snapshots[1].0,
            "reconcile",
            "--args-file",
            snapshots[4].0,
        ])
        .output()
        .unwrap();
    assert_eq!(
        out.status.code(),
        Some(0),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );
    let report: Value = serde_json::from_slice(&out.stdout).unwrap();
    assert_eq!(
        report["result"]["value"],
        json!({"line_count":"2","computed_cents":"1800","declared_cents":"1800",
        "mismatched_lines":"0","first_mismatched_index":"-1","invalid_lines":"0","first_invalid_index":"-1",
        "payment_cents":"1800","payment_difference_cents":"0","balanced":true})
    );
    assert_eq!(report["output"], "");
    for (path, expected) in snapshots {
        assert_eq!(
            fs::read(format!("{root}/{path}")).unwrap(),
            expected.as_bytes()
        );
    }
}
