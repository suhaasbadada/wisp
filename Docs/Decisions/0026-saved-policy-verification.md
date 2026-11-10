# ADR 0026: Guarded verification of saved finite cases

Status: accepted; shipped via PR #26 at
`c57c0707d0a2aece13f635b57bc5e9f0b79e8900`. Exact-head CI, immutable SDK/internal
triage checks, adverse artifacts and published contracts are recorded there.

Saved-project MCP could discover, inspect and invoke policies but not verify their
caller-owned suites. A Complete invocation is not evidence that saved expectations
pass. Add `project verify-policy`, `ProjectClient.verify(policy)` and optional
`wisp_project_verify`, all reusing unchanged shared Rust self-review semantics.

Native selected manifest/source/full-suite/compiler guards precede every attempt;
caller guards bind reasoning across reconnects and strict mode requires them.
No source, path or expectation overrides, automatic refresh, retries or approval.
All policy pins are exposed and validated by the client, but only selected cases
execute. Other-policy drift can be detected after those attempts; client failure
never implies zero execution. Stable-filesystem assumptions remain unchanged.

Preserve Pass/Fail/Error/Unknown, preflight and fresh-attempt markers. Finite Pass
is not whole-project/composed acceptance, requirements sufficiency, proof or
approval. The internal historical CI driver now obtains bounded context, verifies
saved cases, then separately invokes a decision. It does not measure model
reasoning, total token savings or language superiority. Rust remains the only
language implementation; no semantics, fixtures or host permissions change.
