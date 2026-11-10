# ADR 0031: Exact candidate review against saved requirements

Status: implemented; full local checks, exact hash-locked SDK workflow and
independent review passed. Exact-head Linux CI/publication pending.

Saved preparation returns a proposal but saved verification checks the unchanged
original. Add `project review-candidate`, Python `review_candidate` and an optional
MCP tool to compare that exact proposal against retained baseline and the owner's
unchanged saved suite. Reuse shared Rust review and preserve raw suite tokens.

Candidate hash is mandatory and checked before attempts; project guards precede
candidate IO. Python always supplies project pins and validates returned all-policy
pins plus separate baseline/candidate identities. Strict MCP caller guards cover
all five saved policy operations. No baseline/path/suite/expectation override,
automatic repair, persistence or Apply is added.

Review can accept any bounded candidate; it does not itself enforce one-body
preservation. Pair with guarded preparation for its separate audit. Finite
Pass/Fail/Error/Unknown, preflight and fresh attempts remain separate from
preparation, provenance, intent, whole-project/composed acceptance and approval.
Other-policy drift may be detected after case attempts; lost results are unresolved.

Default tools remain seven; configured tools become thirteen. SDK checks a typed
Ready saved proposal that fails all seven saved reservation expectations while
the original remains unchanged. This is authored workflow evidence, not model
reasoning quality, language superiority or requirements-completeness proof.
