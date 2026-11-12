use serde_json::{json, Value};
fn send(value: Value) -> Value {
    serde_json::from_str(&wisp::dispatch(&value.to_string())).unwrap()
}
fn error(report: &Value, code: &str) {
    assert_eq!(report["status"], "Error", "{report}");
    assert_eq!(report["diagnostics"][0]["code"], code, "{report}");
    assert_eq!(report["output"], "");
    assert!(report.get("usage").is_none());
}
#[test]
fn positional_request_limits_ghost_and_artifact_are_never_objects() {
    error(
        &send(json!(["run", "print(7);", null, null, null, null])),
        "E_REQUEST_INVALID",
    );
    let limits = json!([65536, 100000, 32, 128, 8192, 1048576, 1000]);
    error(
        &send(json!({"op":"run","source":"print(7);","limits":limits})),
        "E_REQUEST_INVALID",
    );
    let artifact: Value =
        serde_json::from_str(include_str!("fixtures/semantics7-ghost.json")).unwrap();
    let ghost = &artifact["ghost"];
    let positional = json!([
        ghost["revision"],
        ghost["predicate_key"],
        ghost["dependency_key"],
        ghost["input"],
        ghost["witness_id"]
    ]);
    error(
        &send(json!({"op":"replay","source":artifact["source"],"ghost":positional})),
        "E_REQUEST_INVALID",
    );
    let positional_artifact = json!([
        artifact["format"],
        artifact["version"],
        artifact["compiler"],
        artifact["source"],
        artifact["limits"],
        artifact["ghost"]
    ]);
    error(
        &send(json!({"op":"inspect-artifact","source":"","artifact":positional_artifact})),
        "E_REQUEST_INVALID",
    );
    let mut nested = artifact.clone();
    nested["ghost"] = positional;
    error(
        &send(json!({"op":"inspect-artifact","source":"","artifact":nested})),
        "E_REQUEST_INVALID",
    );
    let mut nested = artifact.clone();
    nested["limits"] = limits;
    error(
        &send(json!({"op":"inspect-artifact","source":"","artifact":nested})),
        "E_ARTIFACT_INVALID",
    );
    assert_eq!(
        send(json!({"op":"inspect-artifact","source":"","artifact":artifact}))["status"],
        "Ready"
    );
    // Legacy nullable fields and empty/default limits objects remain accepted.
    assert_eq!(
        send(json!({"op":"run","source":"","ghost":null,"artifact":null,"limits":{}}))["status"],
        "Complete"
    );
}
#[test]
fn every_review_schema_object_rejects_positional_arrays_before_execution() {
    let case =
        json!({"id":"one","args":["2"],"expect":{"result":{"type":"Int","value":"2"},"output":""}});
    let suite = json!({"version":1,"target":"f","cases":[case.clone()]});
    let mut variants = vec![json!([1, "f", [case.clone()]])];
    let mut s = suite.clone();
    s["cases"][0] = json!(["one", ["2"], case["expect"]]);
    variants.push(s);
    let mut s = suite.clone();
    s["cases"][0]["expect"] = json!([case["expect"]["result"], ""]);
    variants.push(s);
    let mut s = suite.clone();
    s["cases"][0]["expect"]["result"] = json!(["Int", "2"]);
    variants.push(s);
    variants.push(json!([1, "f", [["one", ["2"], [["Int", "2"], ""]]]]));
    for suite in variants {
        let r = send(
            json!({"op":"review","source":"fn f(x:Int)->Int{x}","candidate":"fn f(x:Int)->Int{x}","suite":suite}),
        );
        error(&r, "E_REVIEW_REQUEST");
        assert_eq!(r["review"]["new_execution"], false);
        assert_eq!(r["review"]["cases"], json!([]));
    }
}
#[test]
fn edit_change_is_an_object_not_a_positional_array() {
    let r = send(
        json!({"op":"edit","source":"fn f(x:Int)->Int{x}","focus":"f","change":["0".repeat(64),"0".repeat(64),"{x+1}"]}),
    );
    error(&r, "E_EDIT_REQUEST");
    assert_eq!(r["new_execution"], false);
    assert!(r["edit"]["source"].is_null());
}
