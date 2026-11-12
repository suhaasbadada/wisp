use serde_json::{json, Value};

fn send(request: Value) -> Value {
    serde_json::from_str(&wisp::dispatch(&request.to_string())).unwrap()
}

#[test]
fn ordinary_360_month_loan_completes_without_raising_any_limit() {
    let source = include_str!("../evaluation/loan-dogfood/loan.wisp");
    let metadata = send(json!({"op":"analyze","source":source,"focus":"interest"}));
    assert_eq!(metadata["status"], "Ready");
    let function = metadata["graph"]["functions"]
        .as_array()
        .unwrap()
        .iter()
        .find(|row| row["name"] == "interest")
        .unwrap();
    let edit = send(
        json!({"op":"edit","source":source,"focus":"interest","change":{
            "expected_revision":metadata["revision"],
            "expected_body_hash":function["body_hash"],
            "replacement":include_str!("../evaluation/loan-dogfood/round-half-up.body")
        }}),
    );
    assert_eq!(edit["status"], "Ready", "{edit}");
    let report = send(
        json!({"op":"call","source":edit["edit"]["source"],"function":"simulate",
        "args":[{"principal":"30000000","annual_bps":"600","payment":"179865","extra":"0","months":"360"}]}),
    );
    assert_eq!(report["status"], "Complete", "{report}");
    // Independently cross-checked by the Decimal reference in the dogfood runner.
    assert_eq!(
        report["result"],
        json!({"type":"Summary","value":{
        "months_elapsed":"360","balance":"144","total_paid":"64751400",
        "total_interest":"34751544","valid":true}})
    );
    assert_eq!(report["limits"]["fuel"], 100000);
    assert_eq!(report["limits"]["allocation_bytes"], 1048576);
    assert_eq!(report["limits"]["call_depth"], 32);
    assert_eq!(report["limits"]["evaluation_depth"], 128);
    assert!(report["usage"]["fuel"].as_u64().unwrap() <= 100000);
    assert!(
        report["usage"]["logical_allocation_bytes"]
            .as_u64()
            .unwrap()
            <= 1048576
    );
}
