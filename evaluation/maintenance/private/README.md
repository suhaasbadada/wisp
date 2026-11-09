# Author-only PRETRIAL material

Instructional holdout, not a filesystem security boundary. Trial agents must not
read this directory or the author harness implementation. Parent-run grading may
read it after a trial. No agent trial or comparative result is recorded here.

* `fixtures.mjs`: authored current/historical/reference and partial-repair sources.
* `cases.mjs`: independently designed unit-placement search oracle, no division.
* `cases.json`: frozen oracle outputs, 540 grid plus seven public **invocations**
  (duplicates are possible; do not label them 547 unique cases).
* `mutations.mjs`: negative controls, including invalid aggregate fields.
* `reference.*`, `packing.*`, `expiry.*`, `mutation-*`: private author fixtures.
* `preflight-*.json`: actual native/strict-tsc/Node fixture acceptance evidence.

From the repository root, build the native binary and install pinned TS once:
`cargo build` and `npm ci` if needed. This does not modify the language runtime.

```sh
node scripts/maintenance-preflight.mjs --init   # ONCE; fails rather than overwrite
node --test scripts/maintenance.test.mjs
node scripts/maintenance-preflight.mjs --out evaluation/maintenance/private/preflight-NEW.json
```

`--init` creates starter/source/case fixtures exclusively. Ordinary preflight
verifies existing cases, creates historical artifact/snapshot or new mutation
files exclusively if absent, otherwise verifies their exact contents, then
executes real tests. The archived source changes exactly one expression from the
starter. Archives are reproduced by the Rust core; TS snapshot stores actual
source hash, arguments, expected/actual Decision, versions and raw report.
Preflight never regenerates an oracle to make submissions pass. Freeze all stable
inputs/tools **after** preflight; the parent owns the manifest and trial lifecycle.

APIs in `scripts/maintenance.mjs`:

* `gradeCandidate('wisp' | 'typescript', path)` returns structural/compile gates,
  changed names, SHA, 547-case counters, at most 20 case failures, process metrics,
  and `passed`. Native usage includes summed per-call fuel and maximum per-call
  logical allocation (not process RSS). It never accepts Error/Unknown/malformed
  results. Wisp checks
  multi-body changes by sequential guarded Rust edits, reanalyzing each baseline.
* `studyCases()` returns authored cases with JSON-safe integer strings and typed
  expected Decisions. The oracle validates the specified valid-input domain.
* `executeCases(arm, source, cases, runner?)` is the actual native/strict TS backend,
  intentionally usable for author negative controls without structural acceptance.
* `structure`, `validResult`, `tsContext`, `sourceFile` are separately testable.

For grade counters, cases_executed counts returned reports graded, including
faults, not proof of completed executions. compile_check null means the combined
gate was not attempted, false means it did not finish successfully (which may be
a process/host error). A worker batch timeout is a failed gate, never partial
acceptance. Failures retain bounded diagnostic information. Every subprocess has
10-second/1-MiB bounds, no shell eval. Native calls execute in separate processes;
TS compiles once per batch and uses one bounded worker. This intentional transport
difference is not an agent-performance measurement or superiority result.

Only trusted authored submissions may run: process bounds and TS host-reference
checks are not a sandbox. Whole-source reading and own tests remain unrestricted
in trials. No Docker, production-repository claim, imports simulation, external
dependencies in candidates, trial agents, or language/runtime changes are needed.
