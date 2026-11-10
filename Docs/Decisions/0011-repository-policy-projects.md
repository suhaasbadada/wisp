# ADR 0011: Native repository policy projects

Status: accepted; shipped via PR #11 at
`47366afc25a32bac20052c69769d8c542252f990`. Exact-head/merge CI, deployment,
artifacts and published contracts are
[accepted](https://github.com/suhaasbadada/wisp/pull/11#issuecomment-6757764759).
Joffrey's finding was repaired; post-fix verification was primary plus CI, not an
independent re-review.

## Need

An agent or CI job should check a saved policy set without manually assembling
requests, or losing each policy's revision-linked evidence. A language demo and
one browser session do not provide a recurring repository workflow.

## Decision

Add native-only `project verify MANIFEST` and `project review BASE CANDIDATE`.
Strict versioned manifests name 1–8 ID/source/suite entries. Bounded read-only
loading snapshots all files before execution. Confined normalized paths and
non-symlink regular files prevent accidental traversal in a stable checkout;
they are not a race-proof hostile-filesystem sandbox. No new core operation,
language syntax, compiler version, browser IO, dependencies or permissions.

Review requires identical policy-ID sets and exact whole suite-file bytes. The
conservative gate rejects whitespace-only spec changes but cannot silently bless
case deletion or rewritten expectations. Intentional specification work uses a
separate diff and verify; there is no approval override. Path/order changes are
allowed. Policy rows sort by ID; each embeds the shared Rust review report.

Use fixed core defaults for both revisions. No second limits decoder or asymmetric
budgets. Core semantic preflight stays per-policy; filesystem/config/drift checks
are global. All policies are reported despite semantic faults. Root precedence
is Error > Unknown > Fail > Pass; semantic exit codes match existing native
commands, host failures use stderr/2. Approval is always not_granted.

## Limits and non-goals

Maximum 256 invocations, not an aggregate time/memory guarantee. CLI verifies via
self-review (two observations/case) for one semantics path, not optimization.
No scaffolding, file writes, Git invocation, automatic expectation repair, remote
adapters, CI credentials or deployment. Full-file hashes and core suite hashes
have distinct meanings. Acceptance demonstrates this workflow's behavior, not
external-user value, context completeness, correctness proof or superiority.
