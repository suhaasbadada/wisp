# Roadmap

1. First playable: shared native/WASM core, honest finite evidence, worker playground and agent-first docs.
   Shipped via PR #1 at `ff22d8703387872b24c1c07e386a59538d7f5e9d`; live CLI/WASM and published-site acceptance recorded on the PR. Next: ADR 0002 portable artifacts and native agent workflow.
2. Harden semantics and diagnostic ergonomics based on real tasks; investigate records/tagged unions and structured edits.
3. Research property-specific context boundaries with explicit assumptions/unknowns, inspectable omissions and revision-aware evidence. No completeness or minimal-slice claims.
4. Benchmark against strong existing-language graph tooling and full protocols. Separately measure total task tokens, success, peak context, latency, toolchain RSS and generated runtime memory. No fabricated results.

Native C generation is deferred until the language earns it.
