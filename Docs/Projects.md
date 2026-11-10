# Repository policy projects (native v1)

## Non-executing saved-function context

```sh
target/debug/wisp project focus examples/policies/project.json reservations decide --budget 2048
```

This loads the bounded, confined project snapshot and returns the existing Rust
`analyze` Agent View for the selected function. It does not evaluate top-level
statements, probes, functions or suite cases. All policy files are loaded and all
suites must be JSON, but only the selected source is semantically checked; valid
JSON is not necessarily a valid case suite. This is not project verification.

Optional `--expected-manifest HASH --expected-revision HASH --expected-suite HASH
--expected-compiler ID` must appear together. Hashes are lowercase SHA-256; suite
identity covers its complete file bytes. Comparison precedes analysis and uses
retained source without rereads. Mismatch returns Error/`PROJECT_SNAPSHOT_DRIFT`,
phase `guard`, guard status `rejected`, and `report:null`, with no source context.
Unknown policy returns `PROJECT_POLICY_UNKNOWN`, phase `selector`; a supplied
guard is `not_evaluated` there. Unknown function follows core `E_FOCUS_UNKNOWN`.
Malformed options fail host exit 2 before filesystem access. Other semantic exits
are 0 Ready, 1 Error, 3 Unknown.

The outer report contains `status`, empty `output`, project `diagnostics`,
`project` metadata and unchanged inner core `report`. Metadata includes
`contract_version:1`, `mode:focus`, `phase:focused`, `approval:not_granted`,
`new_execution:false`, manifest/selected-source/full-suite hashes, policy ID,
`guard_status:matched|not_requested`, and sorted `policies` with every policy's
source/suite pins. `focused` does not mean Ready: inspect inner status/diagnostics.

Budget defaults to 4096 UTF-8 text bytes. Native u64 budgets clamp to 65536 through
the shared core. Graph/identity JSON is outside this budget; inspect `overflow`,
`omitted`, `uncertainty` and the byte ledger. Context can omit the focus itself and
is not guaranteed relevant or complete. No savings or correctness claim follows.
The existing stable-filesystem assumptions below remain; hashes are not approval.

Use [`project describe MANIFEST`](Interface.md) to discover structured function
and record types without executing policies or verifying cases.

The [order workflow](Order-workflow.md) exercises a three-policy project and
composed before/after decisions, with component and application gates kept separate.

For host applications that consume decisions rather than verify saved examples,
use [`project serve MANIFEST`](Adapter.md), the pinned JSON-lines adapter.

Save a project manifest beside policies and caller-owned suites. An agent or CI
job can check the saved examples with one read-only command:

```sh
cargo build --locked
target/debug/wisp project verify examples/policies/project.json
target/debug/wisp project review examples/policies/project-before.json examples/policies/project.json
```

The candidate verifies Pass; the baseline verifies Fail. Review reports two
changed decisions and five unchanged. Each policy embeds the unmodified shared
Rust review report, including exact revisions, suite/query identities, individual
observations and candidate expectation verdicts. No second evaluator is added.
Pass is only finite evidence, not approval, proof or deployment authorization.

## Selected saved-case verification

`wisp project verify-policy MANIFEST POLICY` verifies only the selected policy's
saved suite, using the same optional all-or-none four `--expected-*` flags as
focus. Manifest/selected-source/full-suite/compiler guards run before any case
attempt, using retained snapshots. Unknown policy and guard drift use the same
selector/guard diagnostics and no-execution reports as focus. Syntax failures are
host exit 2 before file access; existing bounded/confined loading still applies.

The outer shape matches focus with `mode:verify-policy`, terminal `phase:verified`
and `new_execution` copied from inner `review.new_execution`. The inner report is
unchanged shared Rust self-review (`source == candidate`), exactly as `wisp verify`.
This attempts fresh before/after calls for each saved case: 1–16 cases, at most 32
attempts. It does not run top-level statements or probes. Pass/Fail/Error/Unknown
remain distinct (exits 0/1/1/3); invalid suite schemas and resource bounds are core
evidence, not automatically repaired expectations. `verified` means orchestration
returned, not Pass; inspect case expectations and execution/preflight markers.

All project files and JSON suites load; only the selected source/suite is
semantically checked and its cases attempted. This is not whole-project or
composed-application acceptance. Finite Pass is not proof, intended-requirement
verification or approval. Neither the command nor MCP allows source/expectation
overrides. Full-file suite pins remain distinct from core's retained-JSON hash.

## Manifest format

```json
{"version":1,"policies":[
  {"id":"reservations","source":"policies/reservations.wisp","suite":"cases/reservations.json"}
]}
```

Objects are strict: no missing, unknown or duplicate members. Version is 1;
there are 1–8 policies with unique ASCII `[A-Za-z0-9_-]{1,64}` IDs. Files resolve
relative to the manifest's parent directory, not the shell working directory.
Paths must be normal relative slash-separated paths: no absolute paths, `.` or
`..` segments, empty segments, backslashes or colons. Referenced files must be
regular files, with no symlink components below that parent. The manifest itself
must be a regular non-symlink file. The caller selects and trusts its parent path.

Manifest cap is 16,384 UTF-8 bytes; each source and suite file cap is 65,536 bytes,
including outer whitespace. All inputs are bounded reads and retained snapshots;
all filesystem loading and specification-drift gates finish before any invocation.
These checks are not a sandbox against a concurrently hostile filesystem: do not
run on directories another actor can replace during loading. No stdin, includes,
host adapters, shell commands, output writes or network access are supported.

## Review immutable specifications

Review two manifests, often from separate baseline/candidate directories. Their
policy-ID sets and **entire suite-file bytes** must match, including whitespace.
Paths and manifest order may change. Policy rows are always sorted by ID.
Any added/removed policy or edited suite returns Error / `PROJECT_SPEC_DRIFT`,
phase `preflight`, empty policy observations and no execution. This deliberately
rejects formatting-only suite edits too. Full-file SHA-256 identities are separate
from core review's retained JSON suite hash (which excludes outer whitespace).
Hashes identify bytes, not trust or authentic authorship.

For an intentional specification change, review that diff separately and run
`project verify` against the new specification. There is no override that silently
accepts suite drift, repairs expectations or labels a spec change approved.

## Results, budgets and CI

Stdout is one JSON report: root `status`, empty `output`, project diagnostics,
and `project.{contract_version:1,mode,phase,approval:not_granted,new_execution,
baseline_manifest_hash,candidate_manifest_hash,policies,summary?}`. Rows have
`id`, `suite_file_hash`, and `report` (the shared review report). `summary` has
`total` policies and `attempted_invocations`. Phase `completed` means orchestration
finished, not that all policies passed or all cells executed. Inspect each row's
review phase and diagnostics. No root usage/probe totals are fabricated.

Semantic preflight is **per policy**, not global: a later invalid program or case
can follow earlier completed invocations. All policy rows are retained, including
after a failure. Aggregate precedence: Error, Unknown, Fail, Pass. Exit codes are
0 Pass, 1 Fail/Error, 3 Unknown, 2 host IO/usage/config errors (stderr, no JSON).
Invalid manifests, file/encoding/size errors and malformed standalone suite JSON
are host errors; well-formed but invalid suite schemas are core row errors.

Budgets are fixed core defaults in project v1; no manifest limits field is
accepted. Each policy has 1–16 cases and at most 32 fresh invocations; a project
has at most 256. Limits are per invocation, not a total project time/memory
guarantee. CI should impose an outer job deadline too. `verify` self-compares each
source through the exact same review operation, so it runs two fresh observations
per case. Unknown never passes. No browser filesystem permissions or language
semantics/identity versions change.

A CI job can build the trusted CLI then run `wisp project verify path/project.json`
and retain stdout as an artifact. Preserve its exit code; do not turn Unknown or
Error into success. Reviewing code from an untrusted branch must not grant it
deployment credentials. This repository's tests cover the example plus adversarial
inputs; they do not establish external adoption or a TypeScript advantage.
