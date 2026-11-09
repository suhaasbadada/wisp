# Diagnostic contract v1

Every diagnostic has stable `code` and legacy `kind`, human `message`, half-open
UTF-8 source `span:{start,end}`, and optional JSON Pointer `path`. An absent
path is omitted, not null. Input data uses sentinel source span `0..0`.
Messages are not machine identifiers; no message parsing is required.

Code meanings and code-to-kind mappings are pinned and never reused. New codes
are additive. Consumers must tolerate unknown codes, falling back to `kind`
and the enclosing report/probe/replay `status`. Unknown names remain Type, not
a new Name kind. Diagnostic contract version 1 and discovery contract version 1
are independent of exact compiler identity `wisp-0.1.0-semantics-5`.

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

| Code | Legacy kind | Meaning |
| --- | --- | --- |
| E_REQUEST_INVALID | Request | Invalid request schema, limits, or operation-specific fields. |
| E_OPERATION_UNKNOWN | Request | Unsupported dispatch operation. |
| E_TRANSPORT_LIMIT | Request | Raw request exceeds the fixed transport byte ceiling. |
| E_SYNTAX | Syntax | Invalid language token, literal or grammar. |
| E_NAME_UNKNOWN | Type | Unknown variable, function, record or declared type. |
| E_NAME_DUPLICATE | Type | Duplicate declaration, parameter or immutable binding. |
| E_TYPE_MISMATCH | Type | Incompatible expression, argument, result or projection type. |
| E_FIELD_UNKNOWN | Type | Unknown record field in language source. |
| E_FIELD_MISSING | Type | Missing record initializer field. |
| E_FIELD_DUPLICATE | Type | Duplicate record declaration or initializer field. |
| E_TYPE_RECURSIVE | Type | Recursive record type. |
| E_PROBE_IMPURE | Purity | Probe directly or transitively contains print. |
| E_INT_OVERFLOW | Runtime | Signed i64 arithmetic overflow, including minimum divided or remainder by minus one. |
| E_DIV_ZERO | Runtime | Division or remainder by zero. |
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
| E_LIMIT_TYPE_DEPTH | Limit | Fixed record type depth ceiling exceeded. |
| E_LIMIT_VALUE_DEPTH | Limit | Fixed runtime record value depth ceiling exceeded. |
| E_LIMIT_CALL_DEPTH | Limit | Function call depth budget exceeded. |
| E_LIMIT_EVALUATION_DEPTH | Limit | Combined evaluation stack depth budget exceeded. |
| E_LIMIT_FUEL | Limit | Execution fuel budget exhausted. |
| E_LIMIT_OUTPUT | Limit | Captured print and encoded call value byte budget exceeded; metadata excluded. |
| E_LIMIT_ALLOCATION | Limit | Cumulative logical allocation budget exceeded; not actual memory usage. |
| E_LIMIT_CASES | Limit | Attempted probe case budget exceeded. |
| E_LIMIT_INPUT_BYTES | Limit | Raw argument value byte ceiling exceeded. |
| E_LIMIT_INPUT_DEPTH | Limit | Input JSON container or typed record nesting ceiling exceeded. |
| E_EXECUTION_BLOCKED | Limit | Probe not executed after interrupted top-level execution. |
| E_FOCUS_UNKNOWN | Request | Native focus command found no matching function. |
| E_ARCHIVE_SELECTION | Request | Native archive command selected no failed ghost. |

See [Protocol.md](Protocol.md) for ordering, raw JSON and status semantics,
[CLI.md](CLI.md) for host exits, and [Language.md](Language.md) for accounting.
