use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    fs,
    process::Command,
    sync::atomic::{AtomicU64, Ordering},
};
fn send(v: Value) -> Value {
    serde_json::from_str(&wisp::dispatch(&v.to_string())).unwrap()
}
fn describe(source: &str) -> Value {
    send(json!({"op":"describe","source":source}))
}
#[test]
fn structured_types_declaration_order_and_nonexecution_are_exact() {
    let source="record Z { z: Int, a: String } record A { nested: Z, enabled: Bool } fn z(x: Int, enabled: Bool, text: String)->Z { new Z { z:x,a:text } } fn a(x:A)->A{x} fn u()->Int { print(1); 0 } print(1/0); probe n in 1..=2 { false }";
    let r = describe(source);
    assert_eq!(r["status"], "Ready", "{r}");
    assert_eq!(r["output"], "");
    assert_eq!(r["probes"], json!([]));
    assert!(r.get("usage").is_none());
    assert!(r.get("graph").is_none());
    assert!(r.get("agent_view").is_none());
    assert_eq!(
        r["revision"],
        format!("{:x}", Sha256::digest(source.as_bytes()))
    );
    let i = &r["interface"];
    assert_eq!(i["contract_version"], 1);
    assert_eq!(i["new_execution"], false);
    assert_eq!(i["phase"], "described");
    assert_eq!(
        i["functions"]
            .as_array()
            .unwrap()
            .iter()
            .map(|f| f["name"].as_str().unwrap())
            .collect::<Vec<_>>(),
        vec!["a", "u", "z"]
    );
    assert_eq!(i["functions"][1]["return_type"], json!({"kind":"Int"}));
    assert_eq!(
        i["functions"][2]["parameters"],
        json!([{"name":"x","type":{"kind":"Int"}},{"name":"enabled","type":{"kind":"Bool"}},{"name":"text","type":{"kind":"String"}}])
    );
    assert_eq!(i["records"][0]["name"], "A");
    assert_eq!(
        i["records"][0]["fields"][0]["type"],
        json!({"kind":"Record","name":"Z"})
    );
    assert_eq!(
        i["records"][1]["fields"],
        json!([{"name":"z","type":{"kind":"Int"}},{"name":"a","type":{"kind":"String"}}])
    );
}
#[test]
fn whole_program_faults_limits_and_schema_precedence_never_invent_interface() {
    let r = describe("fn unused()->Int{true}");
    assert_eq!(r["status"], "Error");
    assert_eq!(r["interface"]["phase"], "preflight");
    assert!(r["interface"].get("functions").is_none());
    let r = send(
        json!({"op":"describe","source":"fn f(x:Int)->Int{f(x)} print(1/0);","limits":{"fuel":0,"cases":0,"call_depth":0,"allocation_bytes":0,"output_bytes":0}}),
    );
    assert_eq!(r["status"], "Ready");
    assert!(r.get("usage").is_none());
    assert_eq!(describe(&" ".repeat(65536))["status"], "Ready");
    let r = describe(&" ".repeat(65537));
    assert_eq!(r["status"], "Unknown");
    assert_eq!(r["diagnostics"][0]["code"], "E_LIMIT_SOURCE");
    assert_eq!(r["interface"]["new_execution"], false);
    for (field, value) in [
        ("focus", json!("f")),
        ("budget", json!(0)),
        ("args", Value::Null),
        ("candidate", Value::Null),
        ("suite", Value::Null),
        ("change", Value::Null),
        ("function", Value::Null),
        (
            "ghost",
            json!({"revision":"x","predicate_key":"x","dependency_key":"x","input":"0","witness_id":"x"}),
        ),
    ] {
        let mut q = json!({"op":"describe","source":"print(7);"});
        q[field] = value;
        let r = send(q);
        assert_eq!(r["status"], "Error", "{field}: {r}");
        assert_eq!(r["diagnostics"][0]["code"], "E_REQUEST_INVALID");
        assert_eq!(r["output"], "");
        assert!(r.get("usage").is_none());
    }
    let r = describe("");
    assert_eq!(r["interface"]["functions"], json!([]));
    assert_eq!(r["interface"]["records"], json!([]));
}
#[test]
fn describe_diagnostics_match_checker_and_legacy_identities_stay_unchanged() {
    let source = "// é😀\nfn f(x:Int)->Int{true}";
    let a = send(json!({"op":"analyze","source":source}));
    let b = describe(source);
    assert_eq!(a["diagnostics"], b["diagnostics"]);
    assert_eq!(a["revision"], b["revision"]);
    let source = include_str!("../examples/snacks.wisp");
    describe(source);
    let context = send(json!({"op":"context","source":source,"focus":"probe:0","budget":4096}));
    let frozen: Value =
        serde_json::from_str(include_str!("fixtures/semantics5-context.json")).unwrap();
    assert_eq!(context, frozen);
}
static NEXT: AtomicU64 = AtomicU64::new(0);
#[test]
fn native_project_describe_checks_all_policies_without_validating_suites_or_running() {
    let dir = std::env::temp_dir().join(format!(
        "wisp-interface-{}-{}",
        std::process::id(),
        NEXT.fetch_add(1, Ordering::Relaxed)
    ));
    fs::create_dir(&dir).unwrap();
    fs::write(dir.join("good.wisp"), "fn f(x:Int)->Int{x} print(1/0);").unwrap();
    fs::write(dir.join("bad.wisp"), "fn f(x:Int)->Int{true}").unwrap();
    fs::write(dir.join("suite.json"), "null").unwrap();
    let manifest=json!({"version":1,"policies":[{"id":"z","source":"good.wisp","suite":"suite.json"},{"id":"a","source":"bad.wisp","suite":"suite.json"}]}).to_string();
    fs::write(dir.join("project.json"), &manifest).unwrap();
    let o = Command::new(env!("CARGO_BIN_EXE_wisp"))
        .current_dir(&dir)
        .args(["project", "describe", "project.json"])
        .output()
        .unwrap();
    assert_eq!(o.status.code(), Some(1));
    let r: Value = serde_json::from_slice(&o.stdout).unwrap();
    assert_eq!(r["status"], "Error");
    assert_eq!(r["project"]["mode"], "describe");
    assert_eq!(r["project"]["summary"]["attempted_invocations"], 0);
    assert_eq!(r["project"]["policies"][0]["id"], "a");
    assert_eq!(r["project"]["policies"][1]["report"]["status"], "Ready");
    assert_eq!(
        r["project"]["manifest_hash"],
        format!("{:x}", Sha256::digest(manifest.as_bytes()))
    );
    let o = Command::new(env!("CARGO_BIN_EXE_wisp"))
        .arg("describe")
        .arg(dir.join("good.wisp"))
        .output()
        .unwrap();
    assert!(o.status.success());
    assert_eq!(
        serde_json::from_slice::<Value>(&o.stdout).unwrap()["interface"]["functions"][0]["name"],
        "f"
    );
    assert_eq!(
        fs::read_to_string(dir.join("project.json")).unwrap(),
        manifest
    );
    fs::remove_dir_all(dir).unwrap();
}
