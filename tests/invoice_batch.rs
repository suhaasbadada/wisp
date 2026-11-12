use serde_json::{json, Value};

fn call(args: Value) -> Value {
    serde_json::from_str(&wisp::dispatch(&json!({"op":"call",
        "source":include_str!("../examples/invoice-batch.wisp"),"function":"reconcile","args":args
    }).to_string())).unwrap()
}

#[test]
fn worked_invoice_mismatch_is_not_hidden_by_matching_payment() {
    let args: Value =
        serde_json::from_str(include_str!("../examples/invoice-batch-args.json")).unwrap();
    let report = call(args);
    assert_eq!(report["status"], "Complete", "{report}");
    assert_eq!(report["output"], ""); // Invoke skips the example's top-level print.
    assert_eq!(
        report["result"]["value"],
        json!({"line_count":"3","computed_cents":"1500",
        "declared_cents":"1490","mismatched_lines":"1","invalid_lines":"0",
        "payment_cents":"1500","payment_difference_cents":"0","balanced":false})
    );
}

#[test]
fn empty_and_invalid_lines_have_explicit_outcomes() {
    let empty = call(json!([[], "0"]));
    assert_eq!(empty["status"], "Complete");
    assert_eq!(empty["result"]["value"]["balanced"], true);
    let invalid = call(json!([[{"quantity":"-1","unit_cents":"100","declared_cents":"100"}],"0"]));
    assert_eq!(invalid["status"], "Complete");
    assert_eq!(invalid["result"]["value"]["invalid_lines"], "1");
    assert_eq!(invalid["result"]["value"]["computed_cents"], "0");
    assert_eq!(invalid["result"]["value"]["balanced"], false);
}

#[test]
fn native_cli_agrees_with_independent_decimal_batch_oracle() {
    let output = std::process::Command::new("python3")
        .args([
            "-B",
            concat!(
                env!("CARGO_MANIFEST_DIR"),
                "/evaluation/invoice-dogfood/experiment.py"
            ),
        ])
        .env("WISP_BIN", env!("CARGO_BIN_EXE_wisp"))
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    let report: Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(report["complete_cases"].as_array().unwrap().len(), 9);
    assert_eq!(report["overflow_not_partial"], true);
    assert_eq!(report["malformed_last_prevents_execution"], true);
}
