# Roadmap

Current next milestone: an agent-facing **policy-change workbench** for structured
cases, revision-linked before/after decisions and explicit behavioral review.
Build missing capabilities when the workflow needs them; the feature freeze was
temporary. The repeated maintenance study passed three repetitions per arm but
established no Wisp advantage. See [Maintenance study](Maintenance-study.md).

Product validation (ADR 0008) takes priority over feature expansion: the first
paired pilot accepted five of six submissions, preserving a Wisp body-boundary
failure. No comparative advantage is established. Next gates are independent
tasks, isolated holdouts, verified usage/settings and repeated repository-scale
trials with strong existing-language tooling. See [Evaluation](Evaluation.md).

Guarded editing shipped via PR #7 at `6f1378bdff3faa5be4606e238415c9e85d6123e0`;
published acceptance is recorded in Testing. Earlier “in progress” entries below
are historical implementation notes, not current deployment status.

Guarded edits (ADR 0007) under verification: checked-baseline single-body preparation, exact guards, immutable probe specifications, document-scoped diagnostics and native/browser explicit application. No automatic repair, persistent IDs or invalid-baseline repair. Context ledger PR #6 shipped; see Testing for published acceptance.

1. First playable: shared native/WASM core, honest finite evidence, worker playground and agent-first docs.
   Shipped via PR #1 at `ff22d8703387872b24c1c07e386a59538d7f5e9d`; live CLI/WASM and published-site acceptance recorded on the PR. Next: ADR 0002 portable artifacts and native agent workflow.
2. Portable failure artifacts and native agent commands shipped via PR #2 at `37ec979f28b7f78dc279bdfaf298ebbc5aac1134`. CLI/browser cross-client files, strict validation and honest historical replay.
3. Immutable nominal records shipped via PR #3 at `d7c1beae34a8fc61315b9a2fe0e11ef471f6c4c7`; typed invoice and live metadata/compatibility acceptance verified. Tagged unions and structured edits remain future work.
4. Bounded typed function invocation shipped via PR #4 at `b2c353b0cd3fec263c5957ce4c0f3052529daec8`; native file/stdin and browser JSON data without rewriting source, live acceptance verified.
5. Stable machine diagnostic/discovery contract shipped via PR #5 at `6f3bc4d4531ee7549bcb41dcb52a49be6b730deb`: compiler-generated manifest, exact code/reference agreement, live acceptance verified.
6. Explicit probe-context ledger (ADR 0006): compiler-derived exact chunks, deterministic atomic prefix, per-item byte/scope omissions. Implementation/verification in progress, not a context completeness/relevance/minimality or proof claim.
7. Research deeper property-specific context boundaries with explicit assumptions/unknowns, inspectable omissions and revision-aware evidence. No completeness or minimal-slice claims.
8. Benchmark against strong existing-language graph tooling and full protocols. Separately measure total task tokens, success, peak context, latency, toolchain RSS and generated runtime memory. No fabricated results.

Native C generation is deferred until the language earns it.
