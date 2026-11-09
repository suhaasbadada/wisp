//! Non-executing suite preflight followed by fresh shared invocations.
use super::*;
use serde_json::value::RawValue;

pub const REVIEW_CONTRACT_VERSION: u32 = 1;
pub const REVIEW_BYTES: usize = 65_536;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Suite {
    version: u64,
    target: String,
    cases: Vec<Case>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Case {
    id: String,
    args: Box<RawValue>,
    expect: Expect,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Expect {
    result: ExpectedResult,
    output: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ExpectedResult {
    #[serde(rename = "type")]
    ty: String,
    value: Box<RawValue>,
}

fn data(mut d: Diagnostic, path: &str) -> Diagnostic {
    d.span = Span::default();
    d.path = Some(path.into());
    d
}
fn boundary(a: &Program, b: &Program, ty: &Ty, seen: &mut BTreeSet<String>) -> bool {
    let Ty::Named(name) = ty else { return true };
    if !seen.insert(name.clone()) {
        return true;
    }
    let x = a.records.iter().find(|r| r.name == *name).unwrap();
    let Some(y) = b.records.iter().find(|r| r.name == *name) else {
        return false;
    };
    x.fields.len() == y.fields.len()
        && x.fields
            .iter()
            .zip(&y.fields)
            .all(|((n, t, _), (m, u, _))| n == m && t == u && boundary(a, b, t, seen))
}
fn cell(source: &str, target: &str, args: &RawValue, limits: &Limits, document: &str) -> Json {
    let r = Request {
        op: "call".into(),
        source: source.into(),
        function: Some(target.into()),
        args: Some(RawValue::from_string(args.get().into()).unwrap()),
        limits: None,
        focus: None,
        budget: None,
        ghost: None,
        artifact: None,
        change: None,
        candidate: None,
        suite: None,
    };
    let full: Json = serde_json::from_str(&invocation::serialize_report(invocation::execute(
        r,
        limits.clone(),
    )))
    .unwrap();
    let mut slim = json!({"document":document,"status":full["status"],"revision":full["revision"],"new_execution":full["invocation"]["new_execution"],"invocation":full["invocation"],"output":full["output"],"diagnostics":full["diagnostics"]});
    for key in ["result", "usage"] {
        if let Some(v) = full.get(key) {
            slim[key] = v.clone();
        }
    }
    slim
}

pub(super) fn execute(r: Request, mut limits: Limits) -> Json {
    limits.clamp();
    let candidate = r
        .candidate
        .as_ref()
        .and_then(|v| serde_json::from_str::<String>(v.get()).ok());
    let suite_raw = r.suite.as_ref().map(|v| v.get());
    let mut report = json!({"compiler":COMPILER,"revision":hash(&r.source),"limits":limits,"status":"Error","output":"","probes":[],"diagnostics":[],"review":{"contract_version":REVIEW_CONTRACT_VERSION,"phase":"preflight","approval":"not_granted","new_execution":false,"baseline_revision":hash(&r.source),"candidate_revision":candidate.as_ref().map(|s|hash(s)),"suite_hash":suite_raw.map(hash),"cases":[]}});
    if let (Some(c), Some(s)) = (&candidate, suite_raw) {
        report["review"]["query_key"] = json!(hash(
            &json!([
                "wisp-review",
                REVIEW_CONTRACT_VERSION,
                COMPILER,
                hash(&r.source),
                hash(c),
                hash(s),
                limits
            ])
            .to_string()
        ));
    }
    macro_rules! fail {
        ($d:expr) => {{
            let d: Diagnostic = $d;
            report["status"] = json!(if d.kind == "Limit" {
                "Unknown"
            } else {
                "Error"
            });
            report["diagnostics"] = json!([d]);
            return report;
        }};
    }
    if r.change.is_some()
        || r.args.is_some()
        || r.function.is_some()
        || r.focus.is_some()
        || r.budget.is_some()
        || r.ghost.is_some()
        || r.artifact.is_some()
        || candidate.is_none()
        || suite_raw.is_none()
    {
        fail!(data(
            err(
                DiagnosticCode::ReviewRequest,
                "review requires candidate string and suite, and no invocation/edit fields",
                Span::default()
            ),
            "/suite"
        ));
    }
    let candidate = candidate.unwrap();
    let raw = suite_raw.unwrap();
    if raw.len() > REVIEW_BYTES {
        fail!(data(
            err(
                DiagnosticCode::LimitReviewBytes,
                "raw suite exceeds 65536 bytes",
                Span::default()
            ),
            "/suite"
        ));
    }
    let suite: Suite = match serde_json::from_str(raw) {
        Ok(s) => s,
        Err(e) => fail!(data(
            err(
                DiagnosticCode::ReviewRequest,
                format!("invalid suite: {e}"),
                Span::default()
            ),
            "/suite"
        )),
    };
    if suite.cases.len() > 16 {
        fail!(data(
            err(
                DiagnosticCode::LimitReviewCases,
                "review exceeds sixteen cases",
                Span::default()
            ),
            "/suite/cases"
        ));
    }
    let mut ids = BTreeSet::new();
    if suite.version != 1
        || suite.cases.is_empty()
        || suite.cases.iter().any(|c| {
            c.id.is_empty()
                || c.id.len() > 64
                || !c
                    .id
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
                || !ids.insert(&c.id)
        })
    {
        fail!(data(err(DiagnosticCode::ReviewRequest,"suite requires version 1 and unique ASCII case IDs (1..64 bytes), with 1..16 cases",Span::default()),"/suite"));
    }
    for (document, source) in [
        ("baseline", r.source.as_str()),
        ("candidate", candidate.as_str()),
    ] {
        if source.len() > limits.source_bytes {
            report["review"]["diagnostic_document"] = json!(document);
            fail!(data(
                err(
                    DiagnosticCode::LimitSource,
                    "source byte limit exceeded",
                    Span::default()
                ),
                if document == "candidate" {
                    "/candidate"
                } else {
                    "/source"
                }
            ));
        }
    }
    let mut programs = Vec::new();
    for (document, source) in [
        ("baseline", r.source.as_str()),
        ("candidate", candidate.as_str()),
    ] {
        let checked = parse(source).and_then(|p| {
            check(&p)?;
            Ok(p)
        });
        match checked {
            Ok(p) => programs.push(p),
            Err(d) => {
                report["review"]["diagnostic_document"] = json!(document);
                if document == "candidate" {
                    report["review"]["cause"] = json!({"document":"candidate","diagnostic":d});
                    fail!(data(d, "/candidate"));
                } else {
                    fail!(d);
                }
            }
        }
    }
    let a = &programs[0];
    let b = &programs[1];
    let functions = (
        a.functions.iter().find(|f| f.name == suite.target),
        b.functions.iter().find(|f| f.name == suite.target),
    );
    let (Some(af), Some(bf)) = functions else {
        fail!(data(
            err(
                DiagnosticCode::ReviewTarget,
                "target must exist in both documents",
                Span::default()
            ),
            "/suite/target"
        ));
    };
    let mut seen = BTreeSet::new();
    if af.params != bf.params
        || af.ret != bf.ret
        || !af
            .params
            .iter()
            .map(|(_, t)| t)
            .chain(std::iter::once(&af.ret))
            .all(|t| boundary(a, b, t, &mut seen))
    {
        fail!(data(
            err(
                DiagnosticCode::ReviewTarget,
                "target signatures and reachable nominal records must match",
                Span::default()
            ),
            "/suite/target"
        ));
    }
    for (i, c) in suite.cases.iter().enumerate() {
        let prefix = format!("/suite/cases/{i}");
        for (document, p, f) in [("baseline", a, af), ("candidate", b, bf)] {
            if let Err(mut d) = invocation::arguments(c.args.get(), f, p) {
                d.path = Some(format!("{prefix}{}", d.path.as_deref().unwrap_or("/args")));
                report["review"]["diagnostic_document"] = json!("suite");
                report["review"]["argument_schema_document"] = json!(document);
                fail!(d);
            }
        }
        let path = format!("{prefix}/expect/result/value");
        let validated = invocation::json_depth(c.expect.result.value.get(), &path, 16)
            .and_then(|()| invocation::literal(&c.expect.result.value, &bf.ret, b, &path, 0));
        if c.expect.result.ty != bf.ret.to_string()
            || c.expect.output.len() > 8192
            || validated.is_err()
        {
            report["review"]["diagnostic_document"] = json!("suite");
            let original = validated.err();
            if let Some(d) = original.as_ref().filter(|d| d.kind == "Limit") {
                report["review"]["cause"] = json!({"document":"suite","diagnostic":d});
                fail!(d.clone());
            }
            let path = if c.expect.result.ty != bf.ret.to_string() {
                format!("{prefix}/expect/result/type")
            } else if c.expect.output.len() > 8192 {
                format!("{prefix}/expect/output")
            } else {
                original
                    .as_ref()
                    .and_then(|d| d.path.clone())
                    .unwrap_or(path)
            };
            if let Some(d) = original {
                report["review"]["cause"] = json!({"document":"suite","diagnostic":d});
            }
            fail!(data(
                err(
                    DiagnosticCode::ReviewExpectation,
                    "invalid typed expectation or output exceeds 8192 bytes",
                    Span::default()
                ),
                &path
            ));
        }
    }
    let mut cases = Vec::new();
    let (
        mut changed,
        mut unchanged,
        mut faulted,
        mut unknown,
        mut pass,
        mut fail,
        mut errors,
        mut expectation_unknown,
    ) = (0, 0, 0, 0, 0, 0, 0, 0);
    let (mut candidate_error, mut any_unknown) = (false, false);
    for (i, c) in suite.cases.iter().enumerate() {
        let before = cell(&r.source, &suite.target, &c.args, &limits, "baseline");
        let after = cell(&candidate, &suite.target, &c.args, &limits, "candidate");
        let expected = json!({"result":{"type":c.expect.result.ty,"value":serde_json::from_str::<Json>(c.expect.result.value.get()).unwrap()},"output":c.expect.output});
        let bs = before["status"].as_str().unwrap();
        let cs = after["status"].as_str().unwrap();
        let comparison = if bs == "Unknown" || cs == "Unknown" {
            unknown += 1;
            "Unknown"
        } else if cs == "Error" {
            faulted += 1;
            "Faulted"
        } else if bs == "Error"
            || before["result"] != after["result"]
            || before["output"] != after["output"]
        {
            changed += 1;
            "Changed"
        } else {
            unchanged += 1;
            "Unchanged"
        };
        let expectation = match cs {
            "Error" => {
                errors += 1;
                "Error"
            }
            "Unknown" => {
                expectation_unknown += 1;
                "Unknown"
            }
            _ if after["result"] == expected["result"] && after["output"] == expected["output"] => {
                pass += 1;
                "Pass"
            }
            _ => {
                fail += 1;
                "Fail"
            }
        };
        candidate_error |= cs == "Error";
        any_unknown |= bs == "Unknown" || cs == "Unknown";
        let reason = if comparison == "Unknown" {
            "incomplete_execution"
        } else if cs == "Error" {
            "candidate_fault"
        } else if bs == "Error" {
            "baseline_fault_repaired"
        } else {
            "observed_result_and_output"
        };
        cases.push(json!({"id":c.id,"index":i,"comparison":comparison,"comparison_reason":reason,"expectation":expectation,"expected":expected,"before":before,"after":after}));
    }
    report["status"] = json!(if candidate_error {
        "Error"
    } else if any_unknown {
        "Unknown"
    } else if fail > 0 {
        "Fail"
    } else {
        "Pass"
    });
    report["review"]["phase"] = json!("executed");
    report["review"]["new_execution"] = json!(true);
    report["review"]["target"] = json!(suite.target);
    report["review"]["cases"] = json!(cases);
    report["review"]["summary"] = json!({"total":suite.cases.len(),"changed":changed,"unchanged":unchanged,"faulted":faulted,"unknown":unknown,"expectation_pass":pass,"expectation_fail":fail,"expectation_error":errors,"expectation_unknown":expectation_unknown,"attempted_invocations":suite.cases.len()*2});
    report
}
