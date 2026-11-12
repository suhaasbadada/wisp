use serde_json::{json, Value};

#[test]
fn standalone_loan_example_runs_with_default_limits() {
    let report: Value = serde_json::from_str(&wisp::dispatch(
        &json!({"op":"run","source":include_str!("../examples/loan.wisp")}).to_string(),
    ))
    .unwrap();
    assert_eq!(report["status"], "Complete", "{report}");
    // Independent Decimal reference, not values calculated by the Wisp sample.
    assert_eq!(report["output"], "Summary { months_elapsed: 360, balance: 144, total_paid: 64751400, total_interest: 34751544, valid: true }\n");
    assert_eq!(report["limits"]["fuel"], 100000);
    assert_eq!(report["limits"]["allocation_bytes"], 1048576);
    assert!(report["probes"].as_array().unwrap().is_empty());
}
