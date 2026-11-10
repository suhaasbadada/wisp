//! Native, read-only repository orchestration. Language semantics stay in the core.
use super::wire::{self, Object};
use serde::Deserialize;
use serde_json::{json, value::RawValue, Value};
use sha2::{Digest, Sha256};
use std::collections::BTreeSet;
use std::fs;
use std::io::{self, BufRead, Read, Write};
use std::path::{Component, Path};

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Manifest {
    version: u64,
    #[serde(deserialize_with = "wire::objects")]
    policies: Vec<Policy>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Policy {
    id: String,
    source: String,
    suite: String,
}
struct Snapshot {
    id: String,
    source: String,
    suite: String,
    suite_raw: String,
}
struct Project {
    manifest_hash: String,
    policies: Vec<Snapshot>,
}
fn hash(bytes: &str) -> String {
    format!("{:x}", Sha256::digest(bytes.as_bytes()))
}
fn regular(path: &Path) -> Result<(), String> {
    let metadata = fs::symlink_metadata(path).map_err(|e| format!("{}: {e}", path.display()))?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(format!(
            "{}: expected regular non-symlink file",
            path.display()
        ));
    }
    Ok(())
}
fn file(root: &Path, relative: &str, cap: usize) -> Result<String, String> {
    // Reject non-normal spellings too: no platform-dependent interpretation of
    // backslashes, dot segments, empty segments, roots or drive prefixes.
    if relative.is_empty()
        || relative.contains(['\\', ':'])
        || relative
            .split('/')
            .any(|s| s.is_empty() || s == "." || s == "..")
        || Path::new(relative)
            .components()
            .any(|c| !matches!(c, Component::Normal(_)))
    {
        return Err(format!("invalid confined relative path: {relative:?}"));
    }
    let mut path = root.to_path_buf();
    for part in Path::new(relative).components() {
        path.push(part);
        if fs::symlink_metadata(&path)
            .map_err(|e| format!("{}: {e}", path.display()))?
            .file_type()
            .is_symlink()
        {
            return Err(format!(
                "{}: symlink components are not allowed",
                path.display()
            ));
        }
    }
    regular(&path)?;
    super::bounded(
        fs::File::open(&path).map_err(|e| format!("{}: {e}", path.display()))?,
        cap,
    )
}
fn load(path: &str) -> Result<Project, String> {
    if path == "-" || path.is_empty() || path.starts_with("--") {
        return Err("project requires a manifest file, not stdin".into());
    }
    let path = Path::new(path);
    regular(path)?;
    let raw = super::read(path.to_str().ok_or("path is not UTF-8")?, 16_384)?;
    let Object(manifest): Object<Manifest> =
        serde_json::from_str(&raw).map_err(|e| format!("invalid project: {e}"))?;
    if manifest.version != 1 || manifest.policies.is_empty() || manifest.policies.len() > 8 {
        return Err("project version must be 1 with 1–8 policies".into());
    }
    let root = path.parent().unwrap_or(Path::new("."));
    let mut ids = BTreeSet::new();
    let mut policies = Vec::new();
    for p in manifest.policies {
        if p.id.is_empty()
            || p.id.len() > 64
            || !p
                .id
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-')
            || !ids.insert(p.id.clone())
        {
            return Err("policy IDs must be unique ASCII [A-Za-z0-9_-]{1,64}".into());
        }
        let source = file(root, &p.source, wisp::SOURCE_BYTES)?;
        let suite = file(root, &p.suite, wisp::REVIEW_BYTES)?;
        let suite_raw: Box<RawValue> = serde_json::from_str(&suite)
            .map_err(|e| format!("policy {}: invalid suite JSON: {e}", p.id))?;
        policies.push(Snapshot {
            id: p.id,
            source,
            suite,
            suite_raw: suite_raw.get().into(),
        });
    }
    policies.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(Project {
        manifest_hash: hash(&raw),
        policies,
    })
}

pub(super) fn execute(before: &str, after: Option<&str>) -> Result<Value, String> {
    let baseline = load(before)?;
    let candidate = after.map(load).transpose()?;
    let candidate = candidate.as_ref().unwrap_or(&baseline);
    let mut report = json!({"status":"Error","output":"","diagnostics":[],"project":{
        "contract_version":1,"mode":if after.is_some(){"review"}else{"verify"},
        "phase":"preflight","approval":"not_granted","new_execution":false,
        "baseline_manifest_hash":baseline.manifest_hash,
        "candidate_manifest_hash":candidate.manifest_hash,"policies":[]
    }});
    let drift = if baseline.policies.len() != candidate.policies.len()
        || baseline
            .policies
            .iter()
            .zip(&candidate.policies)
            .any(|(b, c)| b.id != c.id)
    {
        Some("policy ID sets differ")
    } else if baseline
        .policies
        .iter()
        .zip(&candidate.policies)
        .any(|(b, c)| b.suite != c.suite)
    {
        Some("saved suite bytes differ; review requires unchanged specifications")
    } else {
        None
    };
    if let Some(message) = drift {
        report["diagnostics"] =
            json!([{"code":"PROJECT_SPEC_DRIFT","kind":"Project","message":message}]);
        return Ok(report);
    }
    // All bounded filesystem snapshots and drift guards precede any execution.
    // Semantic preflight remains per policy in shared Rust review, not global.
    let mut rows = Vec::new();
    let mut error = false;
    let mut unknown = false;
    let mut fail = false;
    let mut attempted = 0u64;
    for (b, c) in baseline.policies.iter().zip(&candidate.policies) {
        let request = format!(
            "{{\"op\":\"review\",\"source\":{},\"candidate\":{},\"suite\":{}}}",
            json!(b.source),
            json!(c.source),
            c.suite_raw
        );
        let result: Value =
            serde_json::from_str(&wisp::dispatch(&request)).expect("core emits JSON");
        error |= result["status"] == "Error";
        unknown |= result["status"] == "Unknown";
        fail |= result["status"] == "Fail";
        attempted += result["review"]["summary"]["attempted_invocations"]
            .as_u64()
            .unwrap_or(0);
        rows.push(json!({"id":c.id,"suite_file_hash":hash(&c.suite),"report":result}));
    }
    report["status"] = json!(if error {
        "Error"
    } else if unknown {
        "Unknown"
    } else if fail {
        "Fail"
    } else {
        "Pass"
    });
    report["project"]["phase"] = json!("completed");
    report["project"]["new_execution"] = json!(attempted > 0);
    report["project"]["summary"] = json!({"total":rows.len(),"attempted_invocations":attempted});
    report["project"]["policies"] = json!(rows);
    Ok(report)
}

const ADAPTER_LINE_BYTES: usize = 131_072;
const ADAPTER_REQUESTS: usize = 1_024;

pub(super) fn focus(
    manifest: &str,
    policy_id: &str,
    function: &str,
    options: &[&str],
) -> Result<Value, String> {
    // Validate the complete command before touching the filesystem. The four
    // optional pins form one guard, never a partially enforced expectation.
    if manifest.is_empty()
        || manifest == "-"
        || manifest.starts_with("--")
        || !adapter_id(policy_id)
        || function.is_empty()
        || function.starts_with("--")
    {
        return Err(super::HELP.into());
    }
    let (budget, expected) = selection_options(options, true)?;
    let project = load(manifest)?;
    let (mut outer, policy) = select(&project, policy_id, "focus", expected);
    let Some(policy) = policy else {
        return Ok(outer);
    };
    // Analyze only retained bytes: no execution, suite verification or rereads.
    let mut report = super::dispatch(json!({"op":"analyze","source":policy.source,
        "focus":function,"budget":budget.unwrap_or(4096)}));
    if report["status"] == "Ready" && report["agent_view"]["focus"].is_null() {
        report = super::semantic_error(
            report,
            wisp::DiagnosticCode::FocusUnknown,
            "no matching focus function",
        );
    }
    outer["status"] = report["status"].clone();
    outer["project"]["phase"] = json!("focused");
    outer["report"] = report;
    Ok(outer)
}

// Share the exact guard grammar and snapshot selection with focus. Verification
// has no budget/limit override: the saved suite uses shared review defaults.
fn selection_options<'a>(
    options: &[&'a str],
    allow_budget: bool,
) -> Result<(Option<u64>, [Option<&'a str>; 4]), String> {
    let mut budget = None;
    let mut expected = [None; 4];
    for pair in options.chunks(2) {
        if pair.len() != 2 || pair[1].is_empty() || pair[1].starts_with("--") {
            return Err(super::HELP.into());
        }
        let slot = match pair[0] {
            "--budget" if allow_budget && budget.is_none() => {
                budget = Some(super::number(pair[1])?);
                continue;
            }
            "--expected-manifest" => 0,
            "--expected-revision" => 1,
            "--expected-suite" => 2,
            "--expected-compiler" => 3,
            _ => return Err(super::HELP.into()),
        };
        if expected[slot].is_some()
            || (slot < 3
                && (pair[1].len() != 64
                    || !pair[1]
                        .bytes()
                        .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))))
        {
            return Err(super::HELP.into());
        }
        expected[slot] = Some(pair[1]);
    }
    let guarded = expected.iter().any(Option::is_some);
    if guarded && expected.iter().any(Option::is_none) {
        return Err(super::HELP.into());
    }
    Ok((budget, expected))
}

fn select<'a>(
    project: &'a Project,
    policy_id: &str,
    mode: &str,
    expected: [Option<&str>; 4],
) -> (Value, Option<&'a Snapshot>) {
    let guarded = expected.iter().any(Option::is_some);
    let mut outer = json!({"status":"Error","output":"","diagnostics":[],"project":{
        "contract_version":1,"mode":mode,"phase":"selector","approval":"not_granted",
        "new_execution":false,"manifest_hash":project.manifest_hash,"policy_id":policy_id,
        "source_revision":null,"suite_file_hash":null,
        "guard_status":if guarded{"not_evaluated"}else{"not_requested"},
        "policies":project.policies.iter().map(|p| json!({"id":p.id,
            "source_revision":hash(&p.source),"suite_file_hash":hash(&p.suite)})).collect::<Vec<_>>()
    },"report":null});
    let Some(policy) = project.policies.iter().find(|p| p.id == policy_id) else {
        outer["diagnostics"] = json!([{"code":"PROJECT_POLICY_UNKNOWN","kind":"Project","message":"policy ID is not in the project snapshot"}]);
        return (outer, None);
    };
    let revision = hash(&policy.source);
    let suite_hash = hash(&policy.suite);
    outer["project"]["source_revision"] = json!(revision);
    outer["project"]["suite_file_hash"] = json!(suite_hash);
    if guarded {
        if expected
            != [
                Some(project.manifest_hash.as_str()),
                Some(revision.as_str()),
                Some(suite_hash.as_str()),
                Some(wisp::COMPILER),
            ]
        {
            outer["project"]["phase"] = json!("guard");
            outer["project"]["guard_status"] = json!("rejected");
            outer["diagnostics"] = json!([{"code":"PROJECT_SNAPSHOT_DRIFT","kind":"Project","message":"project snapshot does not match expected pins"}]);
            return (outer, None);
        }
        outer["project"]["guard_status"] = json!("matched");
    }
    (outer, Some(policy))
}

pub(super) fn verify_policy(
    manifest: &str,
    policy_id: &str,
    options: &[&str],
) -> Result<Value, String> {
    if manifest.is_empty()
        || manifest == "-"
        || manifest.starts_with("--")
        || !adapter_id(policy_id)
    {
        return Err(super::HELP.into());
    }
    let (_, expected) = selection_options(options, false)?;
    let project = load(manifest)?;
    let (mut outer, policy) = select(&project, policy_id, "verify-policy", expected);
    let Some(policy) = policy else {
        return Ok(outer);
    };
    // Preserve raw suite tokens (including duplicate keys and integer widths).
    // The sole evaluator and semantic preflight are shared core review.
    let request = format!(
        "{{\"op\":\"review\",\"source\":{},\"candidate\":{},\"suite\":{}}}",
        json!(policy.source),
        json!(policy.source),
        policy.suite_raw
    );
    let report: Value = serde_json::from_str(&wisp::dispatch(&request)).expect("core emits JSON");
    outer["status"] = report["status"].clone();
    // Finished orchestration is neither approval nor evidence of success.
    outer["project"]["phase"] = json!("verified");
    outer["project"]["new_execution"] = json!(report["review"]["new_execution"] == true);
    outer["report"] = report;
    Ok(outer)
}

pub(super) fn describe(manifest: &str) -> Result<Value, String> {
    let project = load(manifest)?;
    let mut rows = Vec::new();
    let mut error = false;
    let mut unknown = false;
    for policy in project.policies {
        let report = super::dispatch(json!({"op":"describe","source":policy.source}));
        error |= report["status"] == "Error";
        unknown |= report["status"] == "Unknown";
        rows.push(json!({"id":policy.id,"suite_file_hash":hash(&policy.suite),"report":report}));
    }
    Ok(
        json!({"status":if error {"Error"}else if unknown {"Unknown"}else{"Ready"},"output":"","diagnostics":[],
        "project":{"contract_version":1,"mode":"describe","phase":"described","approval":"not_granted","new_execution":false,
            "manifest_hash":project.manifest_hash,"summary":{"total":rows.len(),"attempted_invocations":0},"policies":rows}}),
    )
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct DecisionRequest {
    id: String,
    policy: String,
    function: String,
    args: Box<RawValue>,
}

fn adapter_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}

fn decision(project: &Project, line: &[u8]) -> String {
    let mut response = json!({"status":"Error","diagnostics":[],"adapter":{
        "contract_version":1,"phase":"response","manifest_hash":project.manifest_hash,
        "approval":"not_granted","new_execution":false
    }});
    let request: DecisionRequest = match serde_json::from_slice::<Object<DecisionRequest>>(line) {
        Ok(Object(r)) => r,
        Err(_) => {
            response["diagnostics"] = json!([{"code":"ADAPTER_REQUEST_INVALID","kind":"Adapter","message":"expected strict JSON object with string id, policy, function and raw args"}]);
            return response.to_string();
        }
    };
    if !adapter_id(&request.id) || !adapter_id(&request.policy) {
        response["diagnostics"] = json!([{"code":"ADAPTER_REQUEST_INVALID","kind":"Adapter","message":"id and policy must be ASCII [A-Za-z0-9_-]{1,64}"}]);
        return response.to_string();
    }
    response["adapter"]["request_id"] = json!(request.id);
    response["adapter"]["policy_id"] = json!(request.policy);
    let Some(policy) = project.policies.iter().find(|p| p.id == request.policy) else {
        response["diagnostics"] = json!([{"code":"ADAPTER_POLICY_UNKNOWN","kind":"Adapter","message":"policy ID is not in the pinned project"}]);
        return response.to_string();
    };
    response["adapter"]["source_revision"] = json!(hash(&policy.source));
    response["adapter"]["suite_file_hash"] = json!(hash(&policy.suite));
    // Preserve exact raw argument bytes, duplicates and integer widths. The core
    // owns target/type validation, checking, limits, invocation identity and execution.
    let raw = wisp::dispatch(&format!(
        "{{\"op\":\"call\",\"source\":{},\"function\":{},\"args\":{}}}",
        json!(policy.source),
        json!(request.function),
        request.args.get()
    ));
    let report: Value = serde_json::from_str(&raw).expect("core emits JSON");
    response["status"] = report["status"].clone();
    response["adapter"]["new_execution"] = json!(report["invocation"]["new_execution"] == true);
    // Embed the original serialized report, preserving nominal result field order
    // as well as the core's private encoded-value finalization boundary.
    let mut serialized = response.to_string();
    serialized.pop();
    format!("{serialized},\"report\":{raw}}}")
}

pub(super) fn serve(manifest: &str) -> Result<(), String> {
    let project = load(manifest)?;
    let ready = json!({"status":"Ready","diagnostics":[],"adapter":{
        "contract_version":1,"phase":"ready","manifest_hash":project.manifest_hash,
        "approval":"not_granted","new_execution":false,
        "line_bytes":ADAPTER_LINE_BYTES,"requests":ADAPTER_REQUESTS,
        "policies":project.policies.iter().map(|p| json!({"id":p.id,
            "source_revision":hash(&p.source),"suite_file_hash":hash(&p.suite)})).collect::<Vec<_>>()
    }});
    let stdin = io::stdin();
    let mut input = stdin.lock();
    let stdout = io::stdout();
    let mut output = stdout.lock();
    writeln!(output, "{ready}")
        .and_then(|_| output.flush())
        .map_err(|e| e.to_string())?;
    for index in 0..=ADAPTER_REQUESTS {
        let mut line = Vec::new();
        // take() bounds allocation even when a peer never sends a newline. The
        // extra two bytes distinguish full content + LF from an oversized frame.
        let n = (&mut input)
            .take(ADAPTER_LINE_BYTES as u64 + 2)
            .read_until(b'\n', &mut line)
            .map_err(|e| e.to_string())?;
        if n == 0 {
            return Ok(());
        }
        if line.last() == Some(&b'\n') {
            line.pop();
        }
        if line.len() > ADAPTER_LINE_BYTES {
            return Err(format!(
                "adapter line exceeds {ADAPTER_LINE_BYTES} bytes; session terminated"
            ));
        }
        if index == ADAPTER_REQUESTS {
            return Err(format!(
                "adapter session exceeds {ADAPTER_REQUESTS} requests; session terminated"
            ));
        }
        writeln!(output, "{}", decision(&project, &line))
            .and_then(|_| output.flush())
            .map_err(|e| e.to_string())?;
    }
    unreachable!("bounded session returns on EOF or request limit")
}
