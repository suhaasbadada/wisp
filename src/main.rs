use serde_json::{json, Value};
use std::fs::{File, OpenOptions};
use std::io::{self, Read, Write};
mod project;
mod wire;

const HELP: &str = "usage: wisp FILE | wisp --json < request.json
       wisp capabilities
       wisp run FILE
       wisp call FILE FUNCTION [--args-file INPUT]
       wisp review BEFORE AFTER --suite CASES
        wisp verify SOURCE --suite CASES
        wisp project verify MANIFEST
        wisp project review BASE_MANIFEST CANDIDATE_MANIFEST
        wisp project serve MANIFEST
       wisp edit FILE FUNCTION --replacement-file BODY --expected-revision SHA --expected-body SHA --out NEWFILE
       wisp check FILE
       wisp focus FILE FUNCTION [--budget N]
       wisp context FILE --probe INDEX [--budget N]
       wisp archive FILE --out ARTIFACT [--probe INDEX]
       wisp inspect ARTIFACT
       wisp replay FILE --artifact ARTIFACT
Files are UTF-8; '-' reads stdin. Probe indexes are zero-based.
New commands: exit 0 Complete/Ready/Pass; 1 Fail/Error; 3 Unknown; 2 IO/usage.
Legacy FILE and --json retain exit 0 for semantic reports.
Artifacts contain historical source; reproduction is not authentication.";

fn bounded(mut reader: impl Read, cap: usize) -> Result<String, String> {
    let mut bytes = Vec::new();
    reader
        .by_ref()
        .take(cap as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() > cap {
        return Err(format!("input exceeds {cap} byte limit"));
    }
    String::from_utf8(bytes).map_err(|e| e.to_string())
}
fn read(path: &str, cap: usize) -> Result<String, String> {
    if path == "-" {
        bounded(io::stdin().lock(), cap)
    } else {
        bounded(File::open(path).map_err(|e| format!("{path}: {e}"))?, cap)
    }
}
fn dispatch(request: Value) -> Value {
    serde_json::from_str(&wisp::dispatch(&request.to_string())).expect("core emits JSON")
}
fn source(path: &str) -> Result<String, String> {
    read(path, wisp::SOURCE_BYTES)
}
fn artifact_request(op: &str, source: &str, path: &str) -> Result<Value, String> {
    let raw = read(path, wisp::TRANSPORT_BYTES)?;
    // Require one complete JSON value before embedding, retaining original bytes
    // for strict schema/duplicate checks in the shared decoder.
    if serde_json::from_str::<Box<serde_json::value::RawValue>>(&raw).is_err() {
        return Ok(dispatch(json!({"op":op,"source":source,"artifact":raw})));
    }
    // Preserve duplicate fields and numeric widths for the shared Rust decoder.
    let request = format!(
        "{{\"op\":{},\"source\":{},\"artifact\":{raw}}}",
        json!(op),
        json!(source)
    );
    Ok(serde_json::from_str(&wisp::dispatch(&request)).expect("core emits JSON"))
}
fn number(s: &str) -> Result<u64, String> {
    s.parse().map_err(|_| "expected unsigned integer".into())
}
fn review_request(
    before: &str,
    after: &str,
    suite: &str,
    self_comparison: bool,
) -> Result<Value, String> {
    if [before, after, suite]
        .iter()
        .any(|p| p.is_empty() || p.starts_with("--"))
    {
        return Err(HELP.into());
    }
    if usize::from(before == "-")
        + usize::from(!self_comparison && after == "-")
        + usize::from(suite == "-")
        > 1
    {
        return Err("at most one physical input may read stdin".into());
    }
    let baseline = source(before)?;
    let candidate = if self_comparison {
        baseline.clone()
    } else {
        source(after)?
    };
    let raw = read(suite, wisp::REVIEW_BYTES)?;
    let raw = serde_json::from_str::<Box<serde_json::value::RawValue>>(&raw)
        .map(|v| v.get().to_owned())
        .unwrap_or_else(|_| "null".into());
    let request = format!(
        "{{\"op\":\"review\",\"source\":{},\"candidate\":{},\"suite\":{raw}}}",
        json!(baseline),
        json!(candidate)
    );
    Ok(serde_json::from_str(&wisp::dispatch(&request)).expect("core emits JSON"))
}
fn semantic_error(mut report: Value, code: wisp::DiagnosticCode, message: &str) -> Value {
    report["status"] = json!("Error");
    report["diagnostics"] =
        json!([{"code":code,"kind":code.kind(),"message":message,"span":{"start":0,"end":0}}]);
    report
}
fn execute(args: &[String]) -> Result<(Value, bool, Option<String>), String> {
    let a: Vec<&str> = args.iter().map(String::as_str).collect();
    let report = match a.as_slice() {
        ["project", "verify", manifest] => project::execute(manifest, None)?,
        ["project", "review", before, after] => project::execute(before, Some(after))?,
        ["review", before, after, "--suite", suite] => review_request(before, after, suite, false)?,
        ["verify", path, "--suite", suite] => review_request(path, path, suite, true)?,
        ["capabilities"] => dispatch(json!({"op":"capabilities","source":""})),
        ["--json"] => {
            let raw = read("-", wisp::TRANSPORT_BYTES)?;
            let response = wisp::dispatch(&raw);
            return Ok((
                serde_json::from_str(&response).unwrap(),
                true,
                Some(response),
            ));
        }
        ["run", path] => dispatch(json!({"op":"run","source":source(path)?})),
        ["call", path, function] | ["call", path, function, "--args-file", _] => {
            let input = if a.len() == 5 { Some(a[4]) } else { None };
            if *path == "-" && input == Some("-") {
                return Err("source and args cannot both read stdin".into());
            }
            let source = source(path)?;
            let raw = input
                .map(|p| read(p, wisp::ARGUMENT_BYTES))
                .transpose()?
                .unwrap_or_else(|| "[]".into());
            // A complete standalone RawValue is required before raw embedding.
            // Invalid JSON becomes null for shared Input diagnostics, never
            // pasted into the envelope or expanded into an oversized string.
            let response = if serde_json::from_str::<Box<serde_json::value::RawValue>>(&raw).is_ok()
            {
                let request = format!(
                    "{{\"op\":\"call\",\"source\":{},\"function\":{},\"args\":{raw}}}",
                    json!(source),
                    json!(function)
                );
                wisp::dispatch(&request)
            } else {
                wisp::dispatch(
                    &json!({"op":"call","source":source,"function":function,"args":null})
                        .to_string(),
                )
            };
            return Ok((
                serde_json::from_str(&response).expect("core emits JSON"),
                false,
                Some(response),
            ));
        }
        ["check", path] => dispatch(json!({"op":"analyze","source":source(path)?})),
        ["edit", path, function, rest @ ..] => {
            let (mut replacement, mut revision, mut body, mut out) = (None, None, None, None);
            for pair in rest.chunks(2) {
                if pair.len() != 2 || pair[1].starts_with("--") || pair[1].is_empty() {
                    return Err(HELP.into());
                }
                match pair {
                    ["--replacement-file", value] if replacement.is_none() => {
                        replacement = Some(*value)
                    }
                    ["--expected-revision", value] if revision.is_none() => revision = Some(*value),
                    ["--expected-body", value] if body.is_none() => body = Some(*value),
                    ["--out", value] if out.is_none() => out = Some(*value),
                    _ => return Err(HELP.into()),
                }
            }
            let (replacement, revision, body, out) = (
                replacement.ok_or(HELP)?,
                revision.ok_or(HELP)?,
                body.ok_or(HELP)?,
                out.ok_or(HELP)?,
            );
            if *path == "-" && replacement == "-" {
                return Err("source and replacement cannot both read stdin".into());
            }
            let source = source(path)?;
            let replacement = read(replacement, wisp::REPLACEMENT_BYTES)?;
            let r = dispatch(
                json!({"op":"edit","source":source,"focus":function,"change":{
                    "expected_revision":revision,"expected_body_hash":body,"replacement":replacement
                }}),
            );
            if r["status"] == "Ready" {
                let bytes = r["edit"]["source"]
                    .as_str()
                    .expect("prepared source")
                    .as_bytes();
                let mut file = OpenOptions::new()
                    .write(true)
                    .create_new(true)
                    .open(out)
                    .map_err(|e| format!("{out}: {e}"))?;
                file.write_all(bytes)
                    .and_then(|_| file.flush())
                    .map_err(|e| format!("{out}: {e}"))?;
            }
            r
        }
        ["context", path, rest @ ..] => {
            let mut probe = None;
            let mut budget = None;
            for pair in rest.chunks(2) {
                match pair {
                    ["--probe", value] if probe.is_none() => probe = Some(*value),
                    ["--budget", value] if budget.is_none() => budget = Some(number(value)?),
                    _ => return Err(HELP.into()),
                }
            }
            let probe = probe.ok_or(HELP)?;
            dispatch(
                json!({"op":"context","source":source(path)?,"focus":format!("probe:{probe}"),"budget":budget}),
            )
        }
        ["focus", path, function] | ["focus", path, function, "--budget", _] => {
            let budget = if a.len() == 5 { number(a[4])? } else { 4096 };
            let r = dispatch(
                json!({"op":"analyze","source":source(path)?,"focus":function,"budget":budget}),
            );
            if r["status"] == "Ready" && r["agent_view"]["focus"].is_null() {
                semantic_error(
                    r,
                    wisp::DiagnosticCode::FocusUnknown,
                    "no matching focus function",
                )
            } else {
                r
            }
        }
        ["inspect", path] => artifact_request("inspect-artifact", "", path)?,
        ["replay", path, "--artifact", archive] => {
            artifact_request("replay-artifact", &source(path)?, archive)?
        }
        ["archive", path, rest @ ..] => {
            let mut out = None;
            let mut probe = None;
            for pair in rest.chunks(2) {
                match pair {
                    ["--out", value] if out.is_none() => out = Some(*value),
                    ["--probe", value] if probe.is_none() => probe = Some(number(value)?),
                    _ => return Err(HELP.into()),
                }
            }
            let out = out.ok_or(HELP)?;
            let source = source(path)?;
            let run = dispatch(json!({"op":"run","source":source}));
            let selected = probe.unwrap_or(0);
            let ghost = usize::try_from(selected)
                .ok()
                .and_then(|index| run["probes"].get(index))
                .and_then(|p| p.get("ghost"))
                .filter(|g| !g.is_null());
            let Some(ghost) = ghost else {
                return Ok((
                    if run["status"] == "Unknown" {
                        run
                    } else {
                        semantic_error(
                            run,
                            wisp::DiagnosticCode::ArchiveSelection,
                            "selected probe has no failed ghost",
                        )
                    },
                    false,
                    None,
                ));
            };
            let r = dispatch(
                json!({"op":"archive","source":source,"ghost":ghost,"limits":run["limits"]}),
            );
            if r["status"] == "Ready" {
                let bytes = serde_json::to_vec_pretty(&r["artifact"]).unwrap();
                if bytes.len() > wisp::TRANSPORT_BYTES {
                    return Err("artifact exceeds transport limit".into());
                }
                let mut file = OpenOptions::new()
                    .write(true)
                    .create_new(true)
                    .open(out)
                    .map_err(|e| format!("{out}: {e}"))?;
                file.write_all(&bytes)
                    .and_then(|_| file.write_all(b"\n"))
                    .and_then(|_| file.flush())
                    .map_err(|e| format!("{out}: {e}"))?;
            }
            r
        }
        [path]
            if !path.starts_with('-')
                && ![
                    "run", "call", "edit", "check", "focus", "context", "archive", "inspect",
                    "replay", "review", "verify", "project",
                ]
                .contains(path) =>
        {
            return Ok((
                dispatch(json!({"op":"run","source":source(path)?})),
                true,
                None,
            ));
        }
        _ => return Err(HELP.into()),
    };
    Ok((report, false, None))
}
fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args == ["--help"] || args == ["-h"] {
        println!("{HELP}");
        return;
    }
    if let [project, serve, manifest] = args.as_slice() {
        if project == "project" && serve == "serve" {
            if let Err(e) = project::serve(manifest) {
                eprintln!("{e}");
                std::process::exit(2);
            }
            return;
        }
    }
    match execute(&args) {
        Ok((report, legacy, raw)) => {
            let code = if legacy {
                0
            } else {
                match report["status"].as_str() {
                    Some("Complete" | "Ready" | "Pass") => 0,
                    Some("Unknown") => 3,
                    _ => 1,
                }
            };
            let response = raw.unwrap_or_else(|| report.to_string());
            if let Err(e) = writeln!(io::stdout().lock(), "{response}") {
                eprintln!("{e}");
                std::process::exit(2);
            }
            std::process::exit(code);
        }
        Err(e) => {
            eprintln!("{e}");
            std::process::exit(2);
        }
    }
}
