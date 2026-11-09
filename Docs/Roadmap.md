# Roadmap

Current increment: policy-change workbench v1 implements structured cases,
revision-linked before/after decisions and explicit behavioral review in shared
Rust/native/browser hosts; validation/publication pending. No automatic approval.
Next validate the workflow on real policy changes and add the capabilities those
tasks need. The repeated study established no Wisp advantage. See
[Workbench](Workbench.md) and [Maintenance study](Maintenance-study.md).

Product validation (ADR 0008) informed this direction: the first
paired pilot accepted five of six submissions, preserving a Wisp body-boundary
failure. No comparative advantage is established. Next gates are independent
tasks, isolated holdouts, verified usage/settings and repeated repository-scale
trials with strong existing-language tooling. See [Evaluation](Evaluation.md).

Guarded editing shipped via PR #7 at `6f1378bdff3faa5be4606e238415c9e85d6123e0`;
published acceptance is recorded in Testing.

1. First playable: shared native/WASM core, honest finite evidence, worker playground and agent-first docs.
   Shipped via PR #1 at `ff22d8703387872b24c1c07e386a59538d7f5e9d`; live CLI/WASM and published-site acceptance recorded on the PR.
2. Portable failure artifacts and native agent commands shipped via PR #2 at `37ec979f28b7f78dc279bdfaf298ebbc5aac1134`. CLI/browser cross-client files, strict validation and honest historical replay.
3. Immutable nominal records shipped via PR #3 at `d7c1beae34a8fc61315b9a2fe0e11ef471f6c4c7`; typed invoice and live metadata/compatibility acceptance verified. Tagged unions remain future work.
4. Bounded typed function invocation shipped via PR #4 at `b2c353b0cd3fec263c5957ce4c0f3052529daec8`; native file/stdin and browser JSON data without rewriting source, live acceptance verified.
5. Stable machine diagnostic/discovery contract shipped via PR #5 at `6f3bc4d4531ee7549bcb41dcb52a49be6b730deb`: compiler-generated manifest, exact code/reference agreement, live acceptance verified.
6. Explicit probe-context ledger shipped via PR #6 (ADR 0006): compiler-derived exact chunks and byte/scope omissions, not a completeness/relevance/minimality or proof claim.
7. Guarded body preparation shipped via PR #7 (ADR 0007): explicit guards/Preview/Apply/new-file output, no automatic execution or repair.
8. Frozen validation pilot shipped via PR #8; repeated maintenance follow-up (ADR 0009) locally complete. Neither demonstrates a Wisp advantage.
9. Build the policy-change workbench; use real workflow needs to prioritize upgrades.

Longer-term research: deeper property-specific context boundaries with explicit
unknowns/omissions, and strong repository-scale comparisons with actual task
tokens, success, peak context, latency and memory. No completeness or fabricated
performance claims; these are not prerequisites for every useful product step.

Native C generation is deferred until the language earns it.
