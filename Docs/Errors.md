# Diagnostic contract v1

Review contract v1 adds five explicit codes. Candidate preflight causes retain
their original diagnostic under `review.cause`, tagged with `document`;
root candidate diagnostics use `/candidate` and sentinel `0..0`, not baseline
offsets. Suite paths use `/suite/cases/INDEX/...`. Expected-value non-limit
failures use E_REVIEW_EXPECTATION with a tagged suite cause; Limit reasons
remain their original code/kind and Unknown. Runtime diagnostics remain inside
the source-owned before/after cell.

| Code | Kind | Meaning |
| --- | --- | --- |
| E_REVIEW_REQUEST | Request | Invalid review fields or strict suite schema. |
| E_REVIEW_TARGET | Input | Missing or incompatible review target boundary. |
| E_REVIEW_EXPECTATION | Input | Invalid typed candidate expectation. |
| E_LIMIT_REVIEW_BYTES | Limit | Raw suite exceeds 65536 bytes. |
| E_LIMIT_REVIEW_CASES | Limit | Review suite exceeds sixteen cases. |

Every diagnostic has stable `code` and legacy `kind`, human `message`, half-open
UTF-8 source `span:{start,end}`, and optional JSON Pointer `path`. An absent
path is omitted, not null. Input data uses sentinel source span `0..0`.
Context selector errors likewise use `0..0` and `/focus`, after whole-program
checking (including unused/unreachable code and every probe's purity). Explicit
invalid selectors never fall back to another probe. Context budget overflow is
Ready metadata with a ledger, not an error or Unknown execution outcome.
Messages are not machine identifiers; no message parsing is required.

Code meanings and code-to-kind mappings are pinned and never reused. New codes
are additive. Consumers must tolerate unknown codes, falling back to `kind`
and the enclosing report/probe/replay `status`. Unknown names remain Type, not
a new Name kind. Diagnostic contract version 1 and discovery contract version 1
are independent of exact compiler identity `wisp-0.1.0-semantics-7`.

Do not derive every outcome from diagnostic kind: transport excess is
Request/Error; a blocked probe is Limit/Unknown even after top-level Runtime
Error; failed bounded artifact reproduction may be overall Unknown with an
Artifact diagnostic. Check nested probe/replay diagnostics as well as the
top-level array. Unknown means incomplete work, not success. CLI IO/usage errors
are stderr/exit 2 without guaranteed JSON; legacy `--json` semantic exits stay 0.

The compiler's `capabilities.diagnostics.codes` catalog is generated from the
same exhaustive enum as construction and serialization. The table below is
checked against that catalog. It is a taxonomy, not an automatic repair policy
or inference about user intent.

Guarded edit contract v1 adds five codes without changing existing meanings.
Baseline parse/check diagnostics retain baseline source spans and precede stale
guard errors. Replacement/candidate failures use Input at `/change/replacement`
with sentinel `0..0`; nested `edit.cause` or `edit.rejected_candidate` explicitly
tags the owning document and relative diagnostics. Never treat candidate spans
(including shifted unchanged probe spans) as current-editor spans. Resource
exhaustion retains its original Limit code/reason and Unknown status, including
replacement/candidate provenance; it is not converted into an edit Input error.
Rejected source is never prepared source. Ready preparation is not execution,
passing probes, proof, automatic repair, or evidence of human intent. See the
[precise response and precedence contract](Protocol.md#guarded-function-body-preparation-edit-contract-v1).

| Code | Legacy kind | Meaning |
| --- | --- | --- |
| E_REQUEST_INVALID | Request | Invalid request schema, limits, or operation-specific fields. |
| E_EDIT_REQUEST | Request | Invalid edit fields, explicit focus, change schema or canonical hash guards. |
| E_EDIT_CONFLICT | Request | Edit revision or exact body hash guard does not match the checked baseline. |
| E_EDIT_TARGET | Request | Edit target is not a unique global function in the checked baseline. |
| E_EDIT_REPLACEMENT | Input | Replacement is not one standalone block with only outer whitespace. |
| E_EDIT_CANDIDATE | Input | Combined candidate failed checking or preservation audit; not accepted source. |
| E_OPERATION_UNKNOWN | Request | Unsupported dispatch operation. |
| E_CONTEXT_SELECTOR | Request | Invalid canonical probe selector or selected probe does not exist. |
| E_TRANSPORT_LIMIT | Request | Raw request exceeds the fixed transport byte ceiling. |
| E_SYNTAX | Syntax | Invalid language token, literal or grammar. |
| E_NAME_UNKNOWN | Type | Unknown variable, function, record or declared type. |
| E_NAME_DUPLICATE | Type | Duplicate declaration, parameter or immutable binding. |
| E_TYPE_MISMATCH | Type | Incompatible expression, argument, result or projection type. |
| E_FIELD_UNKNOWN | Type | Unknown record field in language source. |
| E_FIELD_MISSING | Type | Missing record initializer field. |
| E_FIELD_DUPLICATE | Type | Duplicate record declaration or initializer field. |
| E_TYPE_RECURSIVE | Type | Recursive record type, including cycles through lists. |
| E_PROBE_IMPURE | Purity | Probe directly or transitively contains print. |
| E_INT_OVERFLOW | Runtime | Signed i64 arithmetic overflow, including minimum divided or remainder by minus one. |
| E_DIV_ZERO | Runtime | Division or remainder by zero. |
| E_INDEX_BOUNDS | Runtime | Negative or out-of-range list index. |
| E_PROBE_DOMAIN | Runtime | Reversed or empty probe domain. |
| E_REPLAY_SPECIFICATION | Replay | Historical predicate or domain no longer matches. |
| E_REPLAY_RECEIPT | Replay | Invalid witness identity or historical input. |
| E_ARTIFACT_COMPATIBILITY | Artifact | Unsupported artifact format, version or exact compiler. |
| E_ARTIFACT_INVALID | Artifact | Missing artifact data or invalid archived limits, source revision or witness identity. |
| E_ARTIFACT_REPRODUCTION | Artifact | Exact historical first failure could not be reproduced by bounded execution. |
| E_INPUT_TARGET | Input | Unknown global invocation target. |
| E_INPUT_ARITY | Input | Invocation argument count mismatch. |
| E_INPUT_TYPE | Input | Argument JSON does not have its required language type or root array shape. |
| E_INPUT_INT_CANONICAL | Input | Int string is not canonical signed i64 decimal. |
| E_INPUT_FIELD_MISSING | Input | Missing typed input record field. |
| E_INPUT_FIELD_UNKNOWN | Input | Unknown typed input record field. |
| E_INPUT_FIELD_DUPLICATE | Input | Duplicate typed input record field after JSON unescaping. |
| E_LIMIT_SOURCE | Limit | Source UTF-8 byte budget exceeded. |
| E_LIMIT_TOKENS | Limit | Fixed token ceiling exceeded. |
| E_LIMIT_SYNTAX_DEPTH | Limit | Fixed syntax, AST, operator or projection depth ceiling exceeded. |
| E_LIMIT_RECORD_FIELDS | Limit | Fixed record declaration or initializer field ceiling exceeded. |
| E_LIMIT_LIST_ELEMENTS | Limit | Fixed list literal or typed input ceiling of 1024 elements exceeded. |
| E_LIMIT_TYPE_DEPTH | Limit | Fixed combined record/list type depth ceiling exceeded. |
| E_LIMIT_VALUE_DEPTH | Limit | Fixed combined runtime record/list value depth ceiling exceeded. |
| E_LIMIT_CALL_DEPTH | Limit | Function call depth budget exceeded. |
| E_LIMIT_EVALUATION_DEPTH | Limit | Combined evaluation stack depth budget exceeded. |
| E_LIMIT_FUEL | Limit | Execution fuel budget exhausted. |
| E_LIMIT_OUTPUT | Limit | Captured print and encoded call value byte budget exceeded; metadata excluded. |
| E_LIMIT_ALLOCATION | Limit | Cumulative logical allocation budget exceeded; not actual memory usage. |
| E_LIMIT_CASES | Limit | Attempted probe case budget exceeded. |
| E_LIMIT_INPUT_BYTES | Limit | Raw argument value byte ceiling exceeded. |
| E_LIMIT_INPUT_DEPTH | Limit | Input JSON or combined typed record/list container nesting ceiling exceeded. |
| E_EXECUTION_BLOCKED | Limit | Probe not executed after interrupted top-level execution. |
| E_FOCUS_UNKNOWN | Request | Native focus command found no matching function. |
| E_ARCHIVE_SELECTION | Request | Native archive command selected no failed ghost. |

See [Protocol.md](Protocol.md) for ordering, raw JSON and status semantics,
[CLI.md](CLI.md) for host exits, and [Language.md](Language.md) for accounting.
