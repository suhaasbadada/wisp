use serde_json::{json, Value};
use std::{
    fs,
    io::Write,
    process::{Command, Stdio},
};
fn cli(args: &[&str], stdin: &str) -> std::process::Output {
    let mut child = Command::new(env!("CARGO_BIN_EXE_wisp"))
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    child
        .stdin
        .take()
        .unwrap()
        .write_all(stdin.as_bytes())
        .unwrap();
    child.wait_with_output().unwrap()
}
fn value(out: &std::process::Output) -> Value {
    serde_json::from_slice(&out.stdout).unwrap()
}
const BEFORE: &str = "examples/policies/reservations-before.wisp";
const AFTER: &str = "examples/policies/reservations-after.wisp";
const SUITE: &str = "examples/policies/cases.json";
#[test]
fn workflow_and_stdin_verify() {
    let r = cli(&["review", BEFORE, AFTER, "--suite", SUITE], "");
    assert_eq!(r.status.code(), Some(0));
    assert_eq!(value(&r)["review"]["summary"]["changed"], 2);
    let r = cli(&["verify", AFTER, "--suite", SUITE], "");
    assert_eq!(r.status.code(), Some(0));
    let r = cli(&["verify", BEFORE, "--suite", SUITE], "");
    assert_eq!(r.status.code(), Some(1));
    assert_eq!(value(&r)["status"], "Fail");
    let r = cli(
        &["verify", "-", "--suite", SUITE],
        include_str!("../examples/policies/reservations-after.wisp"),
    );
    assert_eq!(r.status.code(), Some(0));
    let r = cli(
        &["review", BEFORE, AFTER, "--suite", "-"],
        include_str!("../examples/policies/cases.json"),
    );
    assert_eq!(r.status.code(), Some(0));
}
#[test]
fn flags_stdin_and_readers_are_strict_no_output_option() {
    for args in [
        vec!["review"],
        vec!["verify"],
        vec!["verify", AFTER],
        vec!["verify", AFTER, "--suite"],
        vec!["verify", AFTER, "--suite", SUITE, "--suite", SUITE],
        vec!["review", "-", "-", "--suite", SUITE],
        vec!["verify", "-", "--suite", "-"],
        vec!["verify", AFTER, "--suite", SUITE, "--out", AFTER],
        vec!["review", BEFORE, AFTER, "--unknown", SUITE],
    ] {
        let r = cli(&args, "");
        assert_eq!(r.status.code(), Some(2), "{args:?}");
        assert!(r.stdout.is_empty());
        assert!(!r.stderr.is_empty());
    }
    let r = cli(&["verify", "-", "--suite", SUITE], &"a".repeat(65537));
    assert_eq!(r.status.code(), Some(2));
    let r = cli(
        &["review", BEFORE, AFTER, "--suite", "-"],
        &" ".repeat(65537),
    );
    assert_eq!(r.status.code(), Some(2));
    assert_eq!(
        fs::read_to_string(AFTER).unwrap(),
        include_str!("../examples/policies/reservations-after.wisp")
    );
}
#[test]
fn invalid_suite_cannot_inject_request_and_raw_duplicates_survive() {
    for suite in [
        r#"null},"op":"run","source":"print(1);"}"#,
        r#"{"version":1,"version":1,"target":"decide","cases":[]}"#,
        "not json",
    ] {
        let r = cli(&["review", BEFORE, AFTER, "--suite", "-"], suite);
        assert_eq!(r.status.code(), Some(1));
        let r = value(&r);
        assert_eq!(r["diagnostics"][0]["code"], "E_REVIEW_REQUEST");
        assert_eq!(r["review"]["new_execution"], false);
    }
    let mut suite: Value =
        serde_json::from_str(include_str!("../examples/policies/cases.json")).unwrap();
    suite["cases"][1]["expect"]["result"]["value"]["packs"] = json!("2");
    let r = cli(
        &["review", BEFORE, AFTER, "--suite", "-"],
        &suite.to_string(),
    );
    assert_eq!(r.status.code(), Some(1));
    assert_eq!(value(&r)["status"], "Fail");
}
