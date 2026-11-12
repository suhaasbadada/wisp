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
        "declared_cents":"1490","mismatched_lines":"1","first_mismatched_index":"1",
        "invalid_lines":"0","first_invalid_index":"-1",
        "payment_cents":"1500","payment_difference_cents":"0","balanced":false})
    );
}

#[test]
fn empty_and_invalid_lines_have_explicit_outcomes() {
    let empty = call(json!([[], "0"]));
    assert_eq!(empty["status"], "Complete");
    assert_eq!(empty["result"]["value"]["balanced"], true);
    assert_eq!(empty["result"]["value"]["first_mismatched_index"], "-1");
    assert_eq!(empty["result"]["value"]["first_invalid_index"], "-1");
    let invalid = call(json!([[{"quantity":"-1","unit_cents":"100","declared_cents":"100"}],"0"]));
    assert_eq!(invalid["status"], "Complete");
    assert_eq!(invalid["result"]["value"]["invalid_lines"], "1");
    assert_eq!(invalid["result"]["value"]["computed_cents"], "0");
    assert_eq!(invalid["result"]["value"]["balanced"], false);
    assert_eq!(invalid["result"]["value"]["first_mismatched_index"], "-1");
    assert_eq!(invalid["result"]["value"]["first_invalid_index"], "0");
}

#[test]
fn first_indices_keep_original_positions_and_ignore_later_matches() {
    let report = call(
        json!([[{"quantity":"1","unit_cents":"100","declared_cents":"100"},
        {"quantity":"1","unit_cents":"-100","declared_cents":"0"},
        {"quantity":"2","unit_cents":"100","declared_cents":"199"},
        {"quantity":"1","unit_cents":"100","declared_cents":"99"},
        {"quantity":"1","unit_cents":"100","declared_cents":"-1"}], "400"]),
    );
    assert_eq!(report["status"], "Complete", "{report}");
    assert_eq!(
        report["result"]["value"],
        json!({"line_count":"5",
        "computed_cents":"400","declared_cents":"398","mismatched_lines":"2",
        "first_mismatched_index":"2","invalid_lines":"2","first_invalid_index":"1",
        "payment_cents":"400","payment_difference_cents":"0","balanced":false})
    );
}

#[test]
fn last_row_diagnostics_and_negative_payment_are_distinct() {
    let valid = json!({"quantity":"1","unit_cents":"100","declared_cents":"100"});
    for (last, mismatch, invalid) in [
        (
            json!({"quantity":"2","unit_cents":"100","declared_cents":"199"}),
            "1",
            "-1",
        ),
        (
            json!({"quantity":"1","unit_cents":"100","declared_cents":"-1"}),
            "-1",
            "1",
        ),
        (valid.clone(), "-1", "-1"),
    ] {
        let report = call(json!([[valid, last], "-1"]));
        assert_eq!(report["status"], "Complete", "{report}");
        let value = &report["result"]["value"];
        assert_eq!(value["first_mismatched_index"], mismatch);
        assert_eq!(value["first_invalid_index"], invalid);
        assert_eq!(
            value["invalid_lines"],
            if invalid == "-1" { "0" } else { "1" }
        );
        assert_eq!(value["balanced"], false);
    }
}

#[test]
fn two_hundred_valid_lines_fit_unchanged_default_limits() {
    let rows: Vec<Value> = (0..200)
        .map(|i| {
            json!({
                "quantity": (i % 7 + 1).to_string(), "unit_cents": (100 + i * 3).to_string(),
                "declared_cents": ((i % 7 + 1) * (100 + i * 3)).to_string()
            })
        })
        .collect();
    let report = call(json!([rows, "317012"]));
    assert_eq!(report["status"], "Complete", "{report}");
    assert_eq!(
        report["result"]["value"],
        json!({"line_count":"200",
        "computed_cents":"317012","declared_cents":"317012","mismatched_lines":"0",
        "first_mismatched_index":"-1","invalid_lines":"0","first_invalid_index":"-1",
        "payment_cents":"317012","payment_difference_cents":"0","balanced":true})
    );
    println!("200 valid rows default-limit usage: {}", report["usage"]);
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
    assert_eq!(report["complete_cases"].as_array().unwrap().len(), 12);
    assert_eq!(report["overflow_not_partial"], true);
    assert_eq!(report["malformed_last_prevents_execution"], true);
}
