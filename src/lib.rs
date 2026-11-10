//! One bounded implementation shared by native and WebAssembly clients.
mod capabilities;
mod context;
mod diagnostics;
mod edit;
mod engine;
mod interface;
mod invocation;
mod review;
mod syntax;
mod wire;
pub use capabilities::{CAPABILITIES_BYTES, DISCOVERY_CONTRACT_VERSION};
pub use context::CONTEXT_CONTRACT_VERSION;
pub use diagnostics::{DiagnosticCode, DIAGNOSTIC_CONTRACT_VERSION};
pub use edit::{EDIT_CONTRACT_VERSION, REPLACEMENT_BYTES};
use engine::*;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value as Json};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use syntax::*;
pub const COMPILER: &str = "wisp-0.1.0-semantics-5";
fn hash(s: &str) -> String {
    format!("{:x}", Sha256::digest(s.as_bytes()))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Request {
    op: String,
    source: String,
    focus: Option<String>,
    budget: Option<u64>,
    #[serde(default, deserialize_with = "wire::optional_object")]
    ghost: Option<Ghost>,
    #[serde(default, deserialize_with = "wire::optional_object")]
    artifact: Option<Artifact>,
    #[serde(default, deserialize_with = "function_name")]
    function: Option<String>,
    #[serde(default, deserialize_with = "present_limits")]
    args: Option<Box<serde_json::value::RawValue>>,
    #[serde(default, deserialize_with = "present_limits")]
    limits: Option<Box<serde_json::value::RawValue>>,
    #[serde(default, deserialize_with = "present_limits")]
    change: Option<Box<serde_json::value::RawValue>>,
    #[serde(default, deserialize_with = "present_limits")]
    candidate: Option<Box<serde_json::value::RawValue>>,
    #[serde(default, deserialize_with = "present_limits")]
    suite: Option<Box<serde_json::value::RawValue>>,
}
fn function_name<'de, D: serde::Deserializer<'de>>(
    d: D,
) -> std::result::Result<Option<String>, D::Error> {
    String::deserialize(d).map(Some)
}
fn present_limits<'de, D: serde::Deserializer<'de>>(
    d: D,
) -> std::result::Result<Option<Box<serde_json::value::RawValue>>, D::Error> {
    Box::<serde_json::value::RawValue>::deserialize(d).map(Some)
}
struct LanguageRequest {
    op: String,
    source: String,
    focus: Option<String>,
    budget: Option<u64>,
    ghost: Option<Ghost>,
    limits: Limits,
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Ghost {
    pub revision: String,
    pub predicate_key: String,
    pub dependency_key: String,
    pub input: String,
    pub witness_id: String,
}
/// Unauthenticated portable data; acceptance always requires bounded reproduction.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Artifact {
    format: String,
    version: u64,
    compiler: String,
    source: String,
    limits: Box<serde_json::value::RawValue>,
    #[serde(deserialize_with = "wire::object")]
    ghost: Ghost,
}
pub const TRANSPORT_BYTES: usize = 1_048_576;
pub const SOURCE_BYTES: usize = 65_536;
pub use interface::INTERFACE_CONTRACT_VERSION;
pub use invocation::ARGUMENT_BYTES;
pub use review::{REVIEW_BYTES, REVIEW_CONTRACT_VERSION};

fn artifact_error(code: DiagnosticCode, message: &str, source: &str, limits: &Limits) -> Json {
    let mut report = diagnostic_report(err(code, message, Span::default()), &hash(source), limits);
    report["validation"] = json!({"status":"Error","phase":"artifact","new_execution":false});
    report
}

fn validate_artifact(a: &Artifact) -> std::result::Result<Json, Json> {
    let defaults = Limits::default();
    let invalid = |message: &str| {
        artifact_error(
            DiagnosticCode::ArtifactInvalid,
            message,
            &a.source,
            &defaults,
        )
    };
    if a.format != "wisp-ghost" || a.version != 1 || a.compiler != COMPILER {
        return Err(artifact_error(
            DiagnosticCode::ArtifactCompatibility,
            "unsupported artifact format, version or compiler",
            &a.source,
            &defaults,
        ));
    }
    let limits: Limits = serde_json::from_str::<wire::Object<Limits>>(a.limits.get())
        .map(|wire::Object(l)| l)
        .map_err(|_| invalid("invalid archived limits"))?;
    let mut effective = limits.clone();
    effective.clamp();
    // Exact equality also requires every field and rejects values that would
    // otherwise be clamped (including host-sized transport conversions).
    if serde_json::to_value(&effective).unwrap()
        != serde_json::from_str::<Json>(a.limits.get()).unwrap()
    {
        return Err(invalid(
            "artifact requires full effective limits within ceilings",
        ));
    }
    if a.source.len() > SOURCE_BYTES
        || a.ghost.revision != hash(&a.source)
        || a.ghost.witness_id != witness_id(&a.ghost)
    {
        return Err(invalid("invalid source revision or witness identity"));
    }
    let run = execute_language("run", &a.source, None, None, None, limits);
    let exact = run["probes"].as_array().is_some_and(|ps| {
        ps.iter()
            .any(|p| p["status"] == "Fail" && p["ghost"] == json!(a.ghost))
    });
    if !exact {
        let unknown = run["status"] == "Unknown";
        let mut report = artifact_error(
            DiagnosticCode::ArtifactReproduction,
            "historical first failure could not be reproduced exactly",
            &a.source,
            &defaults,
        );
        if unknown {
            report["status"] = json!("Unknown");
        }
        report["validation"] = json!({"status":if unknown {"Unknown"} else {"Error"},"phase":"artifact","new_execution":true,"reproduction_status":run["status"]});
        return Err(report);
    }
    Ok(
        json!({"status":"Ready","phase":"artifact","new_execution":true,"note":"Exact historical first failure reproduced by bounded execution; not authentication or proof of history."}),
    )
}

fn execute_request(r: Request) -> Json {
    let limits: Limits = match r
        .limits
        .as_ref()
        .map(|raw| serde_json::from_str::<wire::Object<Limits>>(raw.get()).map(|wire::Object(l)| l))
        .transpose()
    {
        Ok(limits) => limits.unwrap_or_default(),
        Err(e) => {
            return diagnostic_report(
                err(
                    DiagnosticCode::RequestInvalid,
                    format!("invalid limits: {e}"),
                    Span::default(),
                ),
                &hash(&r.source),
                &Limits::default(),
            )
        }
    };
    if r.op == "review" {
        return review::execute(r, limits);
    }
    if r.candidate.is_some() || r.suite.is_some() {
        return diagnostic_report(
            err(
                DiagnosticCode::RequestInvalid,
                "candidate and suite require review operation",
                Span::default(),
            ),
            &hash(&r.source),
            &limits,
        );
    }
    if r.op != "edit" && r.change.is_some() {
        return diagnostic_report(
            err(
                DiagnosticCode::RequestInvalid,
                "change requires edit operation",
                Span::default(),
            ),
            &hash(&r.source),
            &limits,
        );
    }
    if r.op == "call" {
        return invocation::execute(r, limits);
    }
    if r.function.is_some() || r.args.is_some() {
        return diagnostic_report(
            err(
                DiagnosticCode::RequestInvalid,
                "function and args require call operation",
                Span::default(),
            ),
            &hash(&r.source),
            &limits,
        );
    }
    if r.op == "edit" {
        return edit::execute(r, limits);
    }
    if r.op == "capabilities" {
        return capabilities::document();
    }
    if r.op == "describe" {
        return interface::execute(r, limits);
    }
    if ["archive", "inspect-artifact", "replay-artifact"].contains(&r.op.as_str()) {
        let a = if r.op == "archive" {
            let Some(ghost) = r.ghost else {
                return artifact_error(
                    DiagnosticCode::ArtifactInvalid,
                    "archive requires ghost",
                    &r.source,
                    &limits,
                );
            };
            if r.limits.is_none() {
                return artifact_error(
                    DiagnosticCode::ArtifactInvalid,
                    "archive requires historical effective limits",
                    &r.source,
                    &limits,
                );
            }
            Artifact {
                format: "wisp-ghost".into(),
                version: 1,
                compiler: COMPILER.into(),
                source: r.source.clone(),
                limits: r.limits.unwrap(),
                ghost,
            }
        } else {
            let Some(a) = r.artifact else {
                return artifact_error(
                    DiagnosticCode::ArtifactInvalid,
                    "operation requires artifact",
                    &r.source,
                    &limits,
                );
            };
            a
        };
        let validation = match validate_artifact(&a) {
            Ok(v) => v,
            Err(e) => return e,
        };
        let mut report = if r.op == "replay-artifact" {
            execute_language(
                "replay",
                &r.source,
                r.focus,
                r.budget,
                Some(a.ghost.clone()),
                limits,
            )
        } else {
            // The validation already checked and executed the historical source.
            diagnostic_report(
                err(
                    DiagnosticCode::ArtifactInvalid,
                    "validated",
                    Span::default(),
                ),
                &hash(&a.source),
                &serde_json::from_str(a.limits.get()).unwrap(),
            )
        };
        if r.op != "replay-artifact" {
            report["status"] = json!("Ready");
            report["diagnostics"] = json!([]);
        } else {
            report["new_execution"] = json!(true);
        }
        report["artifact"] = json!(a);
        report["validation"] = validation;
        return report;
    }
    execute_language(&r.op, &r.source, r.focus, r.budget, r.ghost, limits)
}
fn witness_id(g: &Ghost) -> String {
    hash(&json!([g.revision, g.predicate_key, g.dependency_key, g.input]).to_string())
}
fn diagnostic_report(d: Diagnostic, revision: &str, limits: &Limits) -> Json {
    json!({"compiler":COMPILER,"revision":revision,"limits":limits,"status":if d.kind=="Limit"{"Unknown"}else{"Error"},"diagnostics":[d],"output":"","probes":[],"graph":{"records":[],"functions":[],"edges":[]}})
}
struct Metadata {
    graph: Json,
    hashes: BTreeMap<String, String>,
    record_key: String,
}
fn metadata(p: &Program, facts: &Facts, source: &str, limits: &Limits) -> Metadata {
    let mut hashes = BTreeMap::new();
    let mut nodes = Vec::new();
    let mut edges = Vec::new();
    let mut records: Vec<_> = p.records.iter().collect();
    records.sort_by_key(|r| &r.name);
    let declarations: Vec<_> = records
        .iter()
        .map(|r| (&r.name, &source[r.span.start..r.span.end]))
        .collect();
    let record_key = hash(&json!(declarations).to_string());
    let record_nodes: Vec<_> = records.iter().map(|r| json!({"name":r.name,"span":r.span,"declaration_hash":hash(&source[r.span.start..r.span.end]),"fields":r.fields.iter().map(|(n,t,s)|json!({"name":n,"type":t.to_string(),"span":s})).collect::<Vec<_>>()})).collect();
    for f in &p.functions {
        let deps = closure(&BTreeSet::from([f.name.clone()]), &facts.calls);
        let bodies: Vec<_> = p
            .functions
            .iter()
            .filter(|g| deps.contains(&g.name))
            .map(|g| (&g.name, &source[g.span.start..g.span.end]))
            .collect();
        let mut bodies = bodies;
        bodies.sort_by_key(|(n, _)| *n);
        let h = hash(&json!([COMPILER, limits, record_key, bodies]).to_string());
        hashes.insert(f.name.clone(), h.clone());
        nodes.push(json!({"name":f.name,"signature":signature(f),"span":f.span,"body_span":f.body.span,"body_hash":hash(&source[f.body.span.start..f.body.span.end]),"transitive_hash":h,"dependencies":deps,"pure":!deps.iter().any(|n|facts.impure.contains(n))}));
        for to in &facts.calls[&f.name] {
            edges.push(json!({"from":f.name,"to":to,"kind":"call"}));
        }
    }
    Metadata {
        graph: json!({"records":record_nodes,"functions":nodes,"edges":edges,"omissions":["No data-flow or property-specific relevance analysis","Names are local identities, not persistent symbol IDs"],"uncertainty":"Conservative syntactic call edges include unreachable branches; every record declaration contributes to all dependency hashes."}),
        hashes,
        record_key,
    }
}
fn signature(f: &Function) -> String {
    format!(
        "fn {}({}) -> {}",
        f.name,
        f.params
            .iter()
            .map(|(n, t)| format!("{n}: {t}"))
            .collect::<Vec<_>>()
            .join(", "),
        f.ret
    )
}
fn predicate_key(p: &Probe, source: &str) -> String {
    hash(
        &json!([
            COMPILER,
            p.var,
            p.lo.to_string(),
            p.hi.to_string(),
            &source[p.body.span.start..p.body.span.end]
        ])
        .to_string(),
    )
}
fn dependency_key(
    p: &Probe,
    source: &str,
    facts: &Facts,
    meta: &Metadata,
    limits: &Limits,
) -> String {
    let deps = closure(&dependencies(&p.body), &facts.calls);
    let hs: Vec<_> = deps.iter().map(|n| (n, &meta.hashes[n])).collect();
    hash(
        &json!([
            COMPILER,
            limits,
            meta.record_key,
            predicate_key(p, source),
            hs
        ])
        .to_string(),
    )
}
fn agent_view(
    p: &Program,
    facts: &Facts,
    source: &str,
    focus: Option<&str>,
    budget: usize,
) -> Json {
    let selected = focus
        .and_then(|name| p.functions.iter().find(|f| f.name == name))
        .or_else(|| {
            if focus.is_none() {
                p.functions.first()
            } else {
                None
            }
        });
    let mut text = String::new();
    let mut omitted = Vec::new();
    if !p.records.is_empty() {
        text.push_str("Record declarations (conservative type boundary):\n");
        for r in &p.records {
            text.push_str(&source[r.span.start..r.span.end]);
            text.push('\n');
        }
    }
    if let Some(f) = selected {
        text.push_str(&format!(
            "Focus (compiler fact):\n{}\n{}\nDependency boundary signatures:\n",
            signature(f),
            &source[f.body.span.start..f.body.span.end]
        ));
        let deps = closure(&dependencies(&f.body), &facts.calls);
        for g in &p.functions {
            if deps.contains(&g.name) && g.name != f.name {
                text.push_str(&signature(g));
                text.push('\n');
            }
        }
        for g in &p.functions {
            if g.name != f.name {
                omitted.push(format!("body of {}", g.name));
            }
        }
    } else {
        text.push_str("No matching focus function.\n");
        for f in &p.functions {
            omitted.push(format!("function {}", f.name));
        }
    }
    omitted.extend([
        "top-level statements".into(),
        "probe bodies".into(),
        "dependency implementation bodies (except focus)".into(),
    ]);
    text.push_str("Uncertainty: syntactic dependency boundary only; no task relevance, minimality or context completeness guarantee.\n");
    let required = text.len();
    let mut end = required.min(budget);
    while !text.is_char_boundary(end) {
        end -= 1;
    }
    let overflow = end < required;
    if overflow && !p.records.is_empty() {
        omitted.push("record declarations may be truncated by text byte budget".into());
    }
    text.truncate(end);
    json!({"focus":selected.map(|f|&f.name),"text":text,"budget_bytes":budget,"used_bytes":end,"required_bytes":required,"overflow":overflow,"omitted":omitted,"uncertainty":["Budget applies only to UTF-8 text field, not JSON metadata","Truncation may omit focus or boundary facts","Selection is not guaranteed task relevant or context complete"]})
}
// Earlier statements/probes consume shared budgets. Include their possible
// transitive callees, but not uncalled functions or incidental source offsets.
fn run_keys(
    p: &Program,
    source: &str,
    facts: &Facts,
    meta: &Metadata,
    limits: &Limits,
) -> Vec<String> {
    let prelude: Vec<_> = p
        .statements
        .iter()
        .map(|s| {
            let e = stmt_expr(s);
            let kind = match s {
                Stmt::Let(n, _) => format!("let:{n}"),
                Stmt::Print(_) => "print".into(),
                Stmt::Eval(_) => "eval".into(),
            };
            let deps = closure(&dependencies(e), &facts.calls);
            let hashes: Vec<_> = deps.iter().map(|n| (n, &meta.hashes[n])).collect();
            json!([kind, &source[e.span.start..e.span.end], hashes])
        })
        .collect();
    let mut prefix = hash(&json!([COMPILER, "run", limits, meta.record_key, prelude]).to_string());
    p.probes
        .iter()
        .map(|probe| {
            let property = dependency_key(probe, source, facts, meta, limits);
            prefix = hash(&json!([prefix, property]).to_string());
            prefix.clone()
        })
        .collect()
}
fn execute_language(
    op: &str,
    source: &str,
    focus: Option<String>,
    budget: Option<u64>,
    ghost: Option<Ghost>,
    limits: Limits,
) -> Json {
    // Keep the language execution path and its identities unchanged.
    let mut r = LanguageRequest {
        op: op.into(),
        source: source.into(),
        focus,
        budget,
        ghost,
        limits,
    };
    r.limits.clamp();
    let revision = hash(&r.source);
    if !["run", "analyze", "replay", "context"].contains(&r.op.as_str()) {
        return diagnostic_report(
            err(
                DiagnosticCode::OperationUnknown,
                "unknown operation",
                Span::default(),
            ),
            &revision,
            &r.limits,
        );
    }
    if r.source.len() > r.limits.source_bytes {
        return diagnostic_report(
            err(
                DiagnosticCode::LimitSource,
                "source byte limit exceeded",
                Span {
                    start: 0,
                    end: r.source.len(),
                },
            ),
            &revision,
            &r.limits,
        );
    }
    let p = match parse(&r.source) {
        Ok(p) => p,
        Err(d) => return diagnostic_report(d, &revision, &r.limits),
    };
    let facts = match check(&p) {
        Ok(f) => f,
        Err(d) => return diagnostic_report(d, &revision, &r.limits),
    };
    let meta = metadata(&p, &facts, &r.source, &r.limits);
    let keys = run_keys(&p, &r.source, &facts, &meta, &r.limits);
    if r.op == "context" {
        return context::report(&p, &facts, &r, &meta, &keys);
    }
    let specs: Vec<_> = p.probes.iter().zip(&keys).map(|(probe, key)| json!({"predicate_key":predicate_key(probe, &r.source),"dependency_key":key})).collect();
    let mut report = json!({"compiler":COMPILER,"revision":revision,"limits":r.limits,"syntax_limits":{"depth":64,"tokens":8192,"record_type_depth":16,"record_value_depth":16,"record_fields":32},"status":"Ready","output":"","diagnostics":[],"probes":[],"probe_metadata":specs,"graph":meta.graph,"agent_view":agent_view(&p,&facts,&r.source,r.focus.as_deref(),r.budget.unwrap_or(4096).min(65536) as usize)});
    if r.op == "analyze" {
        return report;
    }
    let mut machine = Machine::new(&p, &r.limits);
    if r.op == "replay" {
        let Some(g) = r.ghost else {
            return diagnostic_report(
                err(
                    DiagnosticCode::RequestInvalid,
                    "replay requires ghost",
                    Span::default(),
                ),
                &revision,
                &r.limits,
            );
        };
        if witness_id(&g) != g.witness_id {
            return diagnostic_report(
                err(
                    DiagnosticCode::ReplayReceipt,
                    "invalid witness identity",
                    Span::default(),
                ),
                &revision,
                &r.limits,
            );
        }
        let Some(probe) = p
            .probes
            .iter()
            .find(|p| predicate_key(p, &r.source) == g.predicate_key)
        else {
            return diagnostic_report(
                err(
                    DiagnosticCode::ReplaySpecification,
                    "predicate or domain changed; historical ghost cannot be reinterpreted",
                    Span::default(),
                ),
                &revision,
                &r.limits,
            );
        };
        let input = match g.input.parse::<i64>() {
            Ok(n) if n >= probe.lo && n <= probe.hi => n,
            _ => {
                return diagnostic_report(
                    err(
                        DiagnosticCode::ReplayReceipt,
                        "invalid ghost input",
                        probe.span,
                    ),
                    &revision,
                    &r.limits,
                )
            }
        };
        let key = hash(
            &json!([
                "replay",
                dependency_key(probe, &r.source, &facts, &meta, &r.limits),
                g.input
            ])
            .to_string(),
        );
        let mut env = Env::from([(probe.var.clone(), Value::Int(input))]);
        let execution = if r.limits.cases == 0 {
            Err(err(
                DiagnosticCode::LimitCases,
                "probe case limit exceeded",
                probe.span,
            ))
        } else {
            machine.eval(&probe.body, &mut env)
        };
        let (status, diagnostic) = match execution {
            Ok(Value::Bool(true)) => ("Pass", None),
            Ok(Value::Bool(false)) => ("Fail", None),
            Err(d) => (
                if d.kind == "Limit" {
                    "Unknown"
                } else {
                    "Error"
                },
                Some(d),
            ),
            _ => unreachable!(),
        };
        report["status"] = json!(status);
        report["replay"] = json!({"status":status,"input":g.input,"revision":revision,"dependency_key":key,"historical":g,"new_execution":true,"diagnostic":diagnostic,"note":"One historical input only; Pass is not a Clear domain result."});
        return report;
    }
    let mut diagnostics = Vec::new();
    let mut blocked = false;
    let mut overall = "Complete";
    let mut top_env = Env::new();
    for stmt in &p.statements {
        if let Err(d) = machine.stmt(stmt, &mut top_env) {
            overall = if d.kind == "Limit" {
                "Unknown"
            } else {
                "Error"
            };
            diagnostics.push(d);
            blocked = true;
            break;
        }
    }
    let mut probes = Vec::new();
    let mut total_cases = 0u64;
    for (probe, key) in p.probes.iter().zip(&keys) {
        let pk = predicate_key(probe, &r.source);
        let mut status = "Clear";
        let mut completed = 0u64;
        let mut failure = None;
        let mut diagnostic = None;
        let mut ghost = None;
        if blocked {
            status = "Unknown";
            diagnostic = Some(err(
                DiagnosticCode::ExecutionBlocked,
                "not executed after interrupted top-level execution",
                probe.span,
            ));
        } else if probe.lo > probe.hi {
            status = "Error";
            diagnostic = Some(err(
                DiagnosticCode::ProbeDomain,
                "reversed or empty probe range",
                probe.span,
            ));
        } else {
            let count = i128::from(probe.hi) - i128::from(probe.lo) + 1;
            if count > i128::from(r.limits.cases.saturating_sub(total_cases)) {
                status = "Unknown";
                diagnostic = Some(err(
                    DiagnosticCode::LimitCases,
                    "probe case limit exceeded",
                    probe.span,
                ));
            } else {
                for n in probe.lo..=probe.hi {
                    total_cases += 1;
                    let mut env = Env::from([(probe.var.clone(), Value::Int(n))]);
                    match machine.eval(&probe.body, &mut env) {
                        Ok(Value::Bool(true)) => completed += 1,
                        Ok(Value::Bool(false)) => {
                            completed += 1;
                            status = "Fail";
                            failure = Some(n.to_string());
                            let mut g = Ghost {
                                revision: revision.clone(),
                                predicate_key: pk.clone(),
                                dependency_key: key.clone(),
                                input: n.to_string(),
                                witness_id: String::new(),
                            };
                            g.witness_id = witness_id(&g);
                            ghost = Some(g);
                            break;
                        }
                        Err(d) => {
                            status = if d.kind == "Limit" {
                                "Unknown"
                            } else {
                                "Error"
                            };
                            diagnostic = Some(d);
                            break;
                        }
                        _ => unreachable!(),
                    }
                }
            }
        }
        if status != "Clear" && overall != "Error" {
            overall = match (status, overall) {
                ("Error", _) => "Error",
                (_, "Unknown") => "Unknown",
                ("Unknown", _) => "Unknown",
                _ => "Fail",
            };
        }
        probes.push(json!({"status":status,"variable":probe.var,"domain":{"start":probe.lo.to_string(),"end":probe.hi.to_string(),"inclusive":true},"span":probe.span,"predicate_key":pk,"dependency_key":key,"completed_cases":completed,"failing_input":failure,"diagnostic":diagnostic,"ghost":ghost,"claim":"Finite declared domain only; not a proof or intent guarantee."}));
    }
    report["status"] = json!(overall);
    report["output"] = json!(machine.output);
    report["diagnostics"] = json!(diagnostics);
    report["probes"] = json!(probes);
    report["usage"] = json!({"fuel":machine.fuel,"logical_allocation_bytes":machine.allocation,"attempted_cases":total_cases});
    report
}
/// JSON transport shared byte-for-byte by CLI and WASM. No host execution.
#[wasm_bindgen::prelude::wasm_bindgen]
pub fn dispatch(request_json: &str) -> String {
    if request_json.len() > TRANSPORT_BYTES {
        return diagnostic_report(
            err(
                DiagnosticCode::TransportLimit,
                "request exceeds 1 MiB transport limit",
                Span::default(),
            ),
            "",
            &Limits::default(),
        )
        .to_string();
    }
    let report = match serde_json::from_str::<wire::Object<Request>>(request_json) {
        Ok(wire::Object(r)) => execute_request(r),
        Err(e) => diagnostic_report(
            err(
                DiagnosticCode::RequestInvalid,
                format!("invalid request: {e}"),
                Span::default(),
            ),
            "",
            &Limits::default(),
        ),
    };
    invocation::serialize_report(report)
}
