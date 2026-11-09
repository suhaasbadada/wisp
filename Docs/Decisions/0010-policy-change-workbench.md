# ADR 0010: explicit policy cases and revision-linked review

Accepted 2026-11-09. First useful workbench slice: compare two versions of one typed policy function against an explicit caller-owned suite. Shared Rust orchestration, native CLI and browser host; no second language interpreter, arbitrary host execution, automatic repair, approval, commit or deployment. Modules/collections/richer types remain possible upgrades when the workflow needs them, not prerequisites fabricated for this slice.

## Request and preflight

Add `op:"review"` with existing required string `source` (baseline), new string `candidate`, and new strict `suite` value. Preserve presence of both new fields; reject their presence on every other operation, even null, before early call dispatch. Existing transport, limits and null policies stay compatible. For review, reject `change` or `args` presence, and non-null `function`/`focus`/`budget`/`ghost`/`artifact`; legacy null-as-absent Option fields remain absent.

Suite v1:

```json
{"version":1,"target":"twice","cases":[
  {"id":"positive","args":["2"],
   "expect":{"result":{"type":"Int","value":"4"},"output":""}}
]}
```

All objects reject missing, unknown, duplicate and escaped-duplicate members. Args and expected result value retain raw JSON until type validation; never interpolate unvalidated file text into a request. One through sixteen cases, unique ASCII IDs of 1–64 letters/digits/underscore/hyphen. Empty suite is Request/Error; more than sixteen is Limit/Unknown. Raw suite value cap is 65,536 UTF-8 bytes, independent of two effective source-byte caps and existing 1 MiB request ceiling. Native suite files also have a 64 KiB cap+1 reader. `RawValue` excludes outer file whitespace: `suite_hash` identifies that retained JSON value, not necessarily entire file bytes.

Precedence: existing transport/envelope → limits → operation fields/presence/schema and raw suite cap → suite version/count/IDs → both source caps → baseline whole-program parse/check → candidate whole-program parse/check → target/boundary compatibility → every case's arguments and typed expectation → execution. Any preflight failure means **zero Machines**, no invented executed cells. Original resource reasons remain Unknown, including expected-value depth limits; never turn a Limit into generic Input/Error.

Require exact existing canonical target signature (including parameter names) and recursively reachable nominal record definitions: same ordered fields/names/types. Ignore unrelated records, comments, offsets and declaration placement. Do not compare whole-record/source hashes for compatibility. Arguments follow the actual invocation decoder on both programs; expectations use the checked return type, not a machine. `expect.result.type` must equal that return type. Exact captured-output expectation is mandatory and hard-bounded by 8,192 UTF-8 bytes. No output normalization or expectation rewriting. JSON result object ordering/escape spelling is irrelevant after strict typed validation; review's nested result keys may serialize sorted, unlike standalone call's declaration-order encoding.

## Execution, differences and verdict

Execute baseline then candidate in suite order, with one fresh bounded invocation per cell (at most 32). No top-level statements/probes. Existing raw-args execution-key material is unchanged; use existing invocation execute/serialize machinery, never read its private encoded value as a missing result. Source/expected preflight is non-executing; compilation/reporting remain outside runtime fuel. Effective runtime limits apply **per invocation**, not cumulatively across the suite. `limits.cases` remains the probe-case budget and is not this suite's 16-case ceiling. Sequential execution and bounded counts/results are not an absolute memory or wall-clock guarantee.

Compare complete typed results and captured output, not revision/hash/usage differences:

| Baseline | Candidate | Comparison |
| --- | --- | --- |
| Complete | Complete | Changed or Unchanged |
| Error | Complete | Changed (`baseline_fault_repaired`) |
| Complete or Error | Error | Faulted |
| Either Unknown | Any | Unknown |

Candidate expectation independently reports Pass/Fail/Unknown/Error. Root precedence is candidate Error → either-side Unknown → expectation Fail → Pass. Known baseline runtime faults remain visible and may be fixed by a passing candidate; a baseline Unknown can never produce root Pass. Continue later cases after per-cell faults. Never flatten candidate spans onto baseline editor offsets.

Report baseline/candidate exact revisions, effective limits, retained raw suite hash, domain-separated review query key over version/compiler/both revisions/suite hash/limits, explicit preflight or executed phase, per-case IDs/comparison/expectation/expected data and slim before/after observations. Each observation names its source document and contains status, execution-attempt flag/key, captured output, typed result when available, diagnostics and usage when executed. No repeated graphs/Agent Views or fictional probe observations. Root approval is always `not_granted`; Pass means only those finite examples matched candidate expectations under limits. It is not intent correctness, full behavioral equivalence or permission to apply/merge/deploy.

Baseline preflight diagnostics own baseline spans. Candidate preflight diagnostics use a root data-path/sentinel plus tagged candidate cause with original candidate offsets. Suite argument/expectation diagnostics own `/suite/cases/INDEX/...` JSON pointers and sentinel spans, retaining duplicate-field/type/limit reasons. Executed diagnostics stay inside the correct before/after document. Failed preflight never exposes accepted execution or partial case results.

## Hosts and acceptance

Native `wisp review BEFORE AFTER --suite CASES` and `wisp verify SOURCE --suite CASES` (self-comparison) write no files: stdout is the structured review. Strict flags, bounded UTF-8 readers and at most one stdin operand. Exit 0 Pass; 1 Fail/Error; 3 Unknown; 2 usage/IO. Legacy commands and `--json` semantic exits remain unchanged.

Browser explicitly captures an immutable baseline, edits the current candidate and suite, and starts Review in an independent disposable worker. Stop/deadline discards late replies without manufacturing compiler counts. Source/case/baseline changes, including recapture, programmatic replacements and edit-and-revert, increment a generation; pending replies are excluded and accepted old reports visibly historical. No automatic Run/Apply; execution/ghost history is untouched. Render untrusted source, IDs, diagnostics, output and JSON as text. Include a coherent reservation-policy example with a deliberate mismatch and a known runtime-fault repair case.

Review contract v1 and additive discovery/diagnostics remain independent of compiler semantics-5. Add five explicit codes: `E_REVIEW_REQUEST` Request, `E_REVIEW_TARGET` Input, `E_REVIEW_EXPECTATION` Input, `E_LIMIT_REVIEW_BYTES` Limit, `E_LIMIT_REVIEW_CASES` Limit. Preserve all existing artifact/context/invocation fixtures and identity algorithms. Acceptance includes schema/precedence/old-operation presence/null behavior, final-invalid-case zero execution, raw argument key parity, recursively compatible/unrelated types, full Complete/Error/Unknown matrix, output-only/Unicode/NUL differences, native/WASM equality, native readers/exits/no writes and browser historical/cancel/evidence isolation. Sherlock challenged these boundaries before implementation.
