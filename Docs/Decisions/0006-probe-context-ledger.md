# ADR 0006: explicit probe context with a byte ledger

Accepted 2026-11-09. This is a compiler-metadata query, not a solver, relevance oracle or runtime graph interpreter. It advances inspectable context boundaries without asserting completeness, minimality, intent correctness, novelty or performance superiority.

## Query and selection

Add `{"op":"context","source":"...","focus":"probe:0","budget":4096}` using existing request fields. Missing or null focus defaults to probe zero, matching existing Option focus decoding. Explicit selectors must be canonical `probe:INDEX` with zero-based unsigned decimal index, no plus/leading zeros/negative/overflow. Invalid/wrong-kind/empty/out-of-range/no-probe selection yields additive `E_CONTEXT_SELECTOR` Request/Error at `/focus`, after whole-program checking. Never silently substitute an explicitly invalid selector.

Success is Ready with empty captured output/probe observations, no runtime usage, `new_execution:false`. No Machine is created. Source/limits/checking failures remain existing diagnostics. Function Agent View remains unchanged. Compiler semantics-5, artifact/ghost/run/call identities remain unchanged.

Priority-ordered eligible TEXT chunks:
1. Exact whole selected probe source slice.
2. All exact record declaration slices, name-sorted (conservative type boundary).
3. Exact full definitions of every syntactically reachable function, name-sorted, cycle-safe and deduplicated.

Each chunk is its exact slice plus a charged `\n\n` separator. Include only an atomic prefix: first non-fitting chunk is `budget_exceeded`, later eligible chunks `after_budget_stop` even if smaller. No source truncation or heuristic optimization. If the selected probe cannot fit, TEXT is empty. Required bytes sum eligible chunks including separators; unrelated-to-selected-closure functions are not included in that sum. Effective budget is UTF-8 TEXT bytes (default4096, ceiling65536), not tokens or total response bytes.

## Ledger, scope and identity

Context contract version1 owns selection/framing semantics independently of language compiler identity. Query key is domain-separated/versioned over exact source revision, compiler, effective limits, effective budget and canonical selector. Selector indexes/names are revision-local, not persistent stable symbol IDs. Source slice hashes identify specified bytes, not authorship or intent. Expose existing predicate and **run** dependency keys separately; they are not hashes of included TEXT or cache authorizations.

Ledger covers selected probe, all records and all functions: kind/local ID, exact source span/hash, eligibility/reason, charged chunk bytes, included bytes, disposition, and included TEXT byte range plus exact source-slice subrange (separator excluded). Byte counts/ranges must reconcile mechanically. All-candidate fit means only no budget omissions, never no scope omissions or complete context.

Always list scope omissions independently: every top-level statement (including textually later ones), every other probe, comments/trivia outside source slices, and functions outside the selected syntactic closure. Label statements' available spans as **expression_span**, not whole-statement spans; include index/kind/binding when available. Distinguish preceding probes from following probes. Run keys account for the prelude and preceding-probe dependencies even though their source can be omitted; outside-closure functions can still affect a full run through those paths. Included text is not guaranteed run-equivalent.

Metadata/ledger are source-bounded outside the TEXT budget, not an absolute process-memory/total-response guarantee. Selection, typing, spans and dependency facts are compiler-derived; observations/proofs are absent, assumptions/unknowns explicit. Comments and strings remain untrusted data, never tool instructions. No auto-repair, source/spec rewriting, execution, cache reuse or solver.

## Clients and acceptance

Native `wisp context FILE --probe INDEX [--budget BYTES]`; separate browser query controls with selector/budget/source snapshots, hard Stop/deadline, historical badge and discarded late replies. Existing function Agent View and execution evidence remain independent. Render text and ledger as text. Query input changes cannot make prior output current via matching dependency keys.

Astra challenged execution-prelude scope, identities, exact source units, framing, prefix accounting, provenance and selector precedence before implementation. Acceptance includes nonexecution/whole-program errors, cycles/diamonds/unreachable calls/constructors/projections, zero/exact/one-short/multibyte/oversized budgets, all-fit-but-omitted scope, prior/later probes, duplicate selectors, native/WASM byte equality, UI stale/cancel/hostile text and pinned semantics-5 identity compatibility. Update protocol/CLI/errors/capabilities, default Agent/Human docs and engineering records.
