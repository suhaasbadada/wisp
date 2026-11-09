use serde_json::{json, Value};
use std::fs::{File, OpenOptions};
use std::io::{self, Read, Write};

const HELP: &str = "usage: wisp FILE | wisp --json < request.json
       wisp run FILE
       wisp check FILE
       wisp focus FILE FUNCTION [--budget N]
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
fn semantic_error(mut report: Value, message: &str) -> Value {
    report["status"] = json!("Error");
    report["diagnostics"] =
        json!([{"kind":"Request","message":message,"span":{"start":0,"end":0}}]);
    report
}
fn execute(args: &[String]) -> Result<(Value, bool), String> {
    let a: Vec<&str> = args.iter().map(String::as_str).collect();
    let report = match a.as_slice() {
        ["--json"] => {
            let raw = read("-", wisp::TRANSPORT_BYTES)?;
            return Ok((serde_json::from_str(&wisp::dispatch(&raw)).unwrap(), true));
        }
        ["run", path] => dispatch(json!({"op":"run","source":source(path)?})),
        ["check", path] => dispatch(json!({"op":"analyze","source":source(path)?})),
        ["focus", path, function] | ["focus", path, function, "--budget", _] => {
            let budget = if a.len() == 5 { number(a[4])? } else { 4096 };
            let r = dispatch(
                json!({"op":"analyze","source":source(path)?,"focus":function,"budget":budget}),
            );
            if r["status"] == "Ready" && r["agent_view"]["focus"].is_null() {
                semantic_error(r, "no matching focus function")
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
                        semantic_error(run, "selected probe has no failed ghost")
                    },
                    false,
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
                && !["run", "check", "focus", "archive", "inspect", "replay"].contains(path) =>
        {
            return Ok((dispatch(json!({"op":"run","source":source(path)?})), true));
        }
        _ => return Err(HELP.into()),
    };
    Ok((report, false))
}
fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args == ["--help"] || args == ["-h"] {
        println!("{HELP}");
        return;
    }
    match execute(&args) {
        Ok((report, legacy)) => {
            let code = if legacy {
                0
            } else {
                match report["status"].as_str() {
                    Some("Complete" | "Ready" | "Pass") => 0,
                    Some("Unknown") => 3,
                    _ => 1,
                }
            };
            if let Err(e) = writeln!(io::stdout().lock(), "{report}") {
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
