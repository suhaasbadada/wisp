//! Compiler-owned, source-independent discovery. Never included in hash material.
use crate::*;

pub const DISCOVERY_CONTRACT_VERSION: u32 = 1;
pub const CAPABILITIES_BYTES: usize = 32_768;

pub(super) fn document() -> Json {
    let operations = [
        (
            "capabilities",
            vec![],
            "discovery only; no checking or execution",
        ),
        (
            "analyze",
            vec!["focus", "budget", "limits"],
            "whole-program checking and metadata; no execution",
        ),
        ("describe", vec!["limits"], "whole-program checking and structured global function/record types; no execution, suite verification or authorization"),
        (
            "context",
            vec!["focus", "budget", "limits"],
            "whole-program checking then explicit probe source selection and byte ledger; no execution",
        ),
        (
            "run",
            vec!["focus", "budget", "limits"],
            "top-level statements then finite probes, shared budgets",
        ),
        (
            "call",
            vec!["function", "args", "focus", "budget", "limits"],
            "whole-program checking then one named function; no top-level/probe execution",
        ),
        (
            "edit",
            vec!["focus", "change", "limits"],
            "checked-baseline function-body preparation only; no execution or automatic application",
        ),
        ("review", vec!["candidate", "suite", "limits"], "explicit finite policy cases across two checked revisions; fresh per-cell invocations; no approval or application"),
        (
            "replay",
            vec!["ghost", "focus", "budget", "limits"],
            "whole-program checking then one historical input; not a domain check",
        ),
        (
            "archive",
            vec!["ghost", "limits"],
            "bounded full historical reproduction",
        ),
        (
            "inspect-artifact",
            vec!["artifact"],
            "bounded full historical reproduction; source unused",
        ),
        (
            "replay-artifact",
            vec!["artifact", "focus", "budget", "limits"],
            "historical reproduction then current-source single-input replay",
        ),
    ]
    .into_iter()
    .map(|(op, fields, scope)| {
        let required = match op {
            "call" => vec!["op", "source", "function"],
            "edit" => vec!["op", "source", "focus", "change"],
            "review" => vec!["op", "source", "candidate", "suite"],
            "replay" => vec!["op", "source", "ghost"],
            "archive" => vec!["op", "source", "ghost", "limits"],
            "inspect-artifact" | "replay-artifact" => vec!["op", "source", "artifact"],
            _ => vec!["op", "source"],
        };
        let optional: Vec<_> = fields
            .into_iter()
            .filter(|f| !required.contains(f))
            .collect();
        json!({"op":op,"required_fields":required,"optional_fields":optional,"scope":scope})
    })
    .collect::<Vec<_>>();
    let defaults = serde_json::to_value(Limits::default()).unwrap();
    let configurable = [
        ("source_bytes", "UTF-8 bytes", "source only; request escaping/envelope excluded"),
        ("fuel", "logical execution units", "compilation and report metadata excluded"),
        ("call_depth", "active function calls", "parser and evaluation depth separate"),
        ("evaluation_depth", "active evaluation frames", "includes nested expressions and calls"),
        ("output_bytes", "UTF-8 bytes", "captured prints plus encoded call value; result type and report metadata excluded"),
        ("allocation_bytes", "cumulative logical allocation units", "not live allocator bytes or process/browser memory"),
        ("cases", "attempted probe inputs", "call operation attempts zero probe cases"),
    ].into_iter().map(|(name, unit, scope)| json!({"name":name,"default":defaults[name],"ceiling":defaults[name],"unit":unit,"scope":scope})).collect::<Vec<_>>();
    let fixed = [
        ("request_bytes", TRANSPORT_BYTES, "UTF-8 bytes", "entire raw dispatch request before parsing; Request/Error on excess"),
        ("argument_bytes", ARGUMENT_BYTES, "UTF-8 bytes", "raw args value, including internal whitespace; envelope excluded"),
        ("replacement_bytes", REPLACEMENT_BYTES, "UTF-8 bytes", "raw replacement block including outer whitespace; candidate also obeys effective source_bytes"),
        ("review_bytes", REVIEW_BYTES, "UTF-8 bytes", "retained raw suite value, excluding outer whitespace"),
        ("review_cases", 16, "cases", "explicit suite cases, independent of limits.cases"),
        ("review_expected_output_bytes", 8192, "UTF-8 bytes", "exact expected captured output per case"),
        ("tokens", 8192, "tokens", "language lexer tokens, excluding end sentinel"),
        ("syntax_depth", 64, "nodes", "syntax/AST, operator and projection chains"),
        ("record_fields", 32, "fields", "per declaration or constructor"),
        ("record_type_depth", 16, "record nodes", "primitive depth zero"),
        ("record_value_depth", 16, "record nodes", "runtime construction, copying and encoding"),
        ("input_depth", 17, "JSON containers", "root argument array plus at most 16 record objects"),
        ("capabilities_bytes", CAPABILITIES_BYTES, "UTF-8 bytes", "entire serialized discovery response"),
    ].into_iter().map(|(name, ceiling, unit, scope)|json!({"name":name,"ceiling":ceiling,"unit":unit,"scope":scope})).collect::<Vec<_>>();
    let examples = json!([
        {"request":{"op":"describe","source":"record Input { count: Int } fn decide(input: Input) -> Bool { input.count > 0 }"},"expected_status":"Ready"},
        {"request":{"op":"analyze","source":"fn twice(n: Int) -> Int { n * 2 }"},"expected_status":"Ready"},
        {"request":{"op":"run","source":"probe n in 1..=3 { n + 1 > n }"},"expected_status":"Complete"},
        {"request":{"op":"call","source":"fn twice(n: Int) -> Int { n * 2 }","function":"twice","args":["21"]},"expected_status":"Complete","expected_result":{"type":"Int","value":"42"}},
        {"request":{"op":"context","source":"probe n in 1..=3 { n + 1 > n }","focus":"probe:0","budget":4096},"expected_status":"Ready"},
        {"request":{"op":"edit","source":"fn twice(n: Int) -> Int { n * 2 }","focus":"twice","change":{"expected_revision":"f59809bffc2adfed70f4dbc000d5bb7223b50359189a05c1fa312a0f017f86c7","expected_body_hash":"64cd3cbb8f071e01a74d17007ab3df19b7d47332bf133633a0f8171e92b50928","replacement":"{ n + n }"}},"expected_status":"Ready"},
        {"request":{"op":"review","source":"fn twice(n: Int) -> Int { n * 2 }","candidate":"fn twice(n: Int) -> Int { n + n }","suite":{"version":1,"target":"twice","cases":[{"id":"positive","args":["2"],"expect":{"result":{"type":"Int","value":"4"},"output":""}}]}},"expected_status":"Pass"}
    ]);
    json!({
        "status":"Ready", "compiler":COMPILER,
        "capabilities":{
            "discovery_contract_version":DISCOVERY_CONTRACT_VERSION,
            "diagnostic_contract_version":DIAGNOSTIC_CONTRACT_VERSION,
            "context_contract_version":CONTEXT_CONTRACT_VERSION,
            "edit_contract_version":EDIT_CONTRACT_VERSION,
            "review_contract_version":REVIEW_CONTRACT_VERSION,
            "interface_contract_version":INTERFACE_CONTRACT_VERSION,
            "operations":operations,
            "request":{
                "required_fields":["op","source"],
                "operation_fields":"Per-operation required_fields describe prerequisites for success; omission may decode and then produce an Input/Request diagnostic rather than a schema error.",
                "optional_fields":["focus","budget","ghost","artifact","function","args","limits","change","candidate","suite"],
                "policy":"Unknown/duplicate envelope fields rejected; source is always a string. Candidate/suite presence (even null) requires review; change presence requires edit. These policies precede early call/discovery dispatch, after limits decoding. Function/args are call-only; review rejects args/change presence and non-null legacy function/focus/budget/ghost/artifact. Edit requires explicit focus and strict lowercase source/body hashes. Missing call args means []; null call args is invalid. Review preflights both sources, compatible target boundaries and every typed case before any execution.",
                "function_null":"Explicit function:null is an envelope error on every operation; it is not legacy null-as-absent.",
                "capabilities":"Source is required but never checked, executed, hashed or reflected. Allowed known unused fields do not alter discovery; edit/review-only presence is rejected."
            },
            "features":["checked signed i64 arithmetic","Bool and UTF-8 String","immutable lexical bindings","typed global functions and recursion","immutable nominal nonrecursive records","field projection and structural equality","if expressions and blocks","captured print","finite ascending inclusive pure probes","typed JSON function invocation","conservative syntactic dependency graph and bounded Agent View","single-input historical replay","portable reproduced ghost artifacts","revision-guarded checked-baseline function-body preparation; no execution or automatic application","explicit typed policy cases with baseline/candidate review; finite expectations, not approval"],
            "permissions":{"language_core":{"filesystem":false,"network":false,"process":false,"arbitrary_host_code":false},"native_cli":"Explicit bounded local file/stdin IO is host transport only, not a language permission."},
            "limits":{
                "configurable":configurable,"policy":"Omitted configurable fields default; unsigned u64 values above ceilings clamp. Requests may lower, never raise ceilings.",
                "fixed":fixed,
                "agent_view_text":{"default":4096,"ceiling":65536,"unit":"UTF-8 bytes","scope":"text only; metadata excluded; UTF-8 boundary truncation may omit important facts"},
                "context_text":{"default":4096,"ceiling":65536,"unit":"UTF-8 bytes","scope":"Atomic prefix of exact source chunks plus two newlines each; metadata excluded, not a total response or token cap"},
                "native_readers":"Source, replacement, args and review suite files: 65536 bytes; artifact/request files: 1048576 bytes. Host reader failure is stderr/exit 2, not guaranteed JSON."
            },
            "artifacts":{"format":"wisp-ghost","version":1,"compiler":COMPILER,"compatibility":"Exact compiler identity required; full effective archived limits required; no migration.","authenticated":false,"validation":"Fresh bounded full historical run must reproduce the exact first failed ghost. Reproduction is not authentication or proof of historical author/time."},
            "diagnostics":{"version":DIAGNOSTIC_CONTRACT_VERSION,"shape":"{code,kind,message,span:{start,end},path?}","span":"Half-open UTF-8 source byte offsets; input uses sentinel 0..0 and JSON Pointer path; absent path omitted.","consumer_policy":"Code meanings and wire kinds are stable, never reused. New codes are additive. Unknown codes fall back to kind and report status; human messages are not identifiers. Status is not derived universally from kind/code.","codes":DiagnosticCode::ALL.iter().map(|c|json!({"code":c.wire(),"kind":c.kind(),"meaning":c.meaning()})).collect::<Vec<_>>()},
            "uncertainty":["Finite probe observations and single-input calls/replays are not proofs or intent guarantees.","Dependency edges include unreachable syntactic calls and all record declarations; graph is conservative, not property-specific.","Agent View truncation can omit facts; not context-complete, minimal or guaranteed task relevant.","Logical fuel/allocation units are not absolute CPU, allocator or process/browser bounds; host cancellation is separate.","No automatic repair, cache reuse, telemetry, backend or language IO."],
            "docs":{"language":"Docs/Language.md","protocol":"Docs/Protocol.md","cli":"Docs/CLI.md","errors":"Docs/Errors.md","scope":"Docs/Scope.md","interface":"Docs/Interface.md"},
            "examples":examples
        }
    })
}
