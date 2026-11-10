# Policy-change workbench v1

For saved suites across a repository and a single agent/CI entry point, use
[native policy projects](Projects.md): `wisp project verify MANIFEST` or
`wisp project review BASE_MANIFEST CANDIDATE_MANIFEST`.

For interacting policies, use the [composed order workflow](Order-workflow.md).
It retains component evidence and full before/after application observations;
passing individual expectations is not approval of the composed business effect.

Review a concrete policy change using caller-owned structured examples, exact
source revisions and observed before/after results. The shared Rust implementation
runs in native CLI and browser WASM. It does not pick your requirements, change
expectations, apply edits, approve a change, commit or deploy.

## Try the reservation workflow

In the playground open **Policy change workbench** and select **Load reservation
walkthrough (replaces editor)**. This explicit action captures the old policy as
baseline, places the proposed policy in Code and loads seven expectations. Nothing
executes until **Review cases**. Expect Pass with **2 Changed / 5 Unchanged**:
partial-pack rounding changes from 2 to 3 packs, and expiry equality becomes a
rejection. Expand cases for exact typed results, outputs, diagnostics and usage.

Change an expected value to an incorrect number **string**, then review again:
the candidate expectation fails. The tool leaves that specification untouched.
Pass means only these finite examples matched under limits; **Pass is not
approval**, Changed is not an intent judgment, and Unknown cannot pass.

To use your own policy: put its source in Code, **Capture editor as baseline**,
edit the candidate, enter the suite and Review. Baseline is an immutable in-memory
snapshot until explicit recapture; it is not a stable semantic ID or saved file.
Existing Run output/probes and historical ghosts remain independent.

Native equivalents:

```sh
cargo build
target/debug/wisp review examples/policies/reservations-before.wisp \
  examples/policies/reservations-after.wisp --suite examples/policies/cases.json
target/debug/wisp verify examples/policies/reservations-after.wisp \
  --suite examples/policies/cases.json
```

`verify` self-compares one source against the same explicit expectations. It is
not a proof or full-domain verification. The first command reports two changes;
candidate verify passes with no before/after differences. Verifying the old
policy fails. Commands write no files; stdout is structured JSON. Exit 0 Pass,
1 Fail/Error, 3 Unknown, 2 host IO/usage. Source/suite files are bounded UTF-8,
64 KiB each, with at most one physical stdin input. See [CLI](CLI.md).

## Author explicit cases

```json
{"version":1,"target":"twice","cases":[
  {"id":"positive","args":["2"],
   "expect":{"result":{"type":"Int","value":"4"},"output":""}}
]}
```

Int values are canonical signed-i64 strings, Bool is JSON boolean, String is JSON
text and nominal records are exact objects. Every expected result names the
checked return type; captured output is mandatory and exact, including newlines,
Unicode and NUL. Duplicate/unknown/missing fields are rejected by Rust. Expected
data is validated, never executed or rewritten. Object field order/JSON escape
spelling does not change typed equality; captured output is not normalized.

Use 1–16 unique ASCII IDs (`A-Z`, `a-z`, digits, underscore, hyphen; 1–64 bytes).
Raw suite JSON is limited to 65,536 UTF-8 bytes. A suite hash identifies the
retained JSON value excluding outer file whitespace, not necessarily the whole
file. Query identity includes compiler, both source revisions, raw suite hash and
effective limits. No cache reuse or authenticity follows from these hashes.

Both programs are whole-program checked and every case is preflighted before
any execution. They must expose the same canonical target signature (including
parameter names) and recursively reachable nominal record layouts. Unrelated
records/comments/declaration placement may differ. Signature/type migrations and
invalid-baseline repair are outside v1. A last invalid case prevents all cells
from executing. Preflight failures have zero observations, not fabricated runtime
statuses. Data paths and source-document ownership remain visible in JSON.

## Understand faults, limits and history

Each case runs baseline then candidate using a **fresh per-invocation** budget;
maximum 32 invocations. Top-level statements and probes do not execute.
`limits.cases` remains the separate probe budget. Compilation/reporting are outside
machine fuel; counts and output caps are not an absolute memory/time guarantee.

Complete results compare typed value plus output. A known baseline runtime fault
fixed by the candidate is Changed and can pass if the candidate matches its
expectation; the old fault remains visible. Candidate faults are Error/Faulted.
Any Unknown makes that comparison incomplete; a baseline Unknown cannot yield a
passing review. Root priority is candidate Error, either-side Unknown, expectation
Fail, then Pass. Later cases still run after faults. Inspect all three axes:
source observations, behavioral differences and candidate expectations.

Every candidate/suite/baseline change—including programmatic example/guarded-edit
replacement, recapture and edit-and-revert—invalidates the current review. Old
accepted reports are marked Historical. Stop/deadline terminates an independent
worker, excludes late callbacks and accepts no partial report; the host does not
guess how many cases executed. Review never automatically Runs or Applies code.
Nothing is uploaded or automatically persisted. Source/output/JSON remain
untrusted text, not instructions or HTML.

This is a useful workflow slice, not validated external-user value, production
readiness, superiority or intent correctness. Modules, collections, richer types
and host adapters may still be needed by broader policy workflows. See
[ADR 0010](Decisions/0010-policy-change-workbench.md) and the exact
[protocol](Protocol.md#policy-review-contract-v1).
