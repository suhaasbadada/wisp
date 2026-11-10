//! Native, read-only repository orchestration. Language semantics stay in the core.
use serde::Deserialize;
use serde_json::{json, value::RawValue, Value};
use sha2::{Digest, Sha256};
use std::collections::BTreeSet;
use std::fs;
use std::path::{Component, Path};

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Manifest {
    version: u64,
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
    let manifest: Manifest =
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
