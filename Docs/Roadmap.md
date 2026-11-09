# Roadmap

1. First playable: shared native/WASM core, honest finite evidence, worker playground and agent-first docs.
   Shipped via PR #1 at `ff22d8703387872b24c1c07e386a59538d7f5e9d`; live CLI/WASM and published-site acceptance recorded on the PR. Next: ADR 0002 portable artifacts and native agent workflow.
2. Portable failure artifacts and native agent commands shipped via PR #2 at `37ec979f28b7f78dc279bdfaf298ebbc5aac1134`. CLI/browser cross-client files, strict validation and honest historical replay.
3. Immutable nominal records shipped via PR #3 at `d7c1beae34a8fc61315b9a2fe0e11ef471f6c4c7`; typed invoice and live metadata/compatibility acceptance verified. Tagged unions and structured edits remain future work.
4. Bounded typed function invocation shipped via PR #4 at `b2c353b0cd3fec263c5957ce4c0f3052529daec8`; native file/stdin and browser JSON data without rewriting source, live acceptance verified.
5. Stable machine diagnostic/discovery contract (ADR 0005): explicit codes, compiler-generated capability manifest, truthful permissions/limits/examples. Implementation/verification in progress.
6. Research property-specific context boundaries with explicit assumptions/unknowns, inspectable omissions and revision-aware evidence. No completeness or minimal-slice claims.
7. Benchmark against strong existing-language graph tooling and full protocols. Separately measure total task tokens, success, peak context, latency, toolchain RSS and generated runtime memory. No fabricated results.

Native C generation is deferred until the language earns it.
