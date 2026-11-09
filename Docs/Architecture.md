# Architecture

The Rust core owns tokenization, AST, checking, conservative call/effect analysis, interpretation, hashing and serializable reports. Native CLI and wasm-bindgen expose the same operations. TypeScript renders reports as text and runs WASM in a dedicated worker; it does not implement language semantics.

Whole-source SHA-256 revision identity is distinct from conservative per-function/transitive dependency identity. Evidence must include predicate/range, compiler semantics version and execution configuration. No cross-key cache reuse is permitted. Agent View is compiler-derived context selection, not guaranteed task relevance or completeness. Stable symbol identity separate from version hashes is deferred; names are local identities only.

Bounds cover source, syntax nesting, calls, fuel, output, probe cases and logical allocation. Browser worker termination provides hard cancellation. Logical allocation limits are not an absolute bound on Rust/WASM/JS/browser process memory. No backend or API key is required.

Portable artifacts (ADR 0002) are explicit local files with full historical source, compiler identity, exact limits and one receipt. Rust validates envelopes and reproduces the exact first failure before acceptance. CLI/UI preserve raw artifact JSON for the shared decoder (no JavaScript/Value normalization of duplicate fields); malformed UTF-8 is rejected. A 1 MiB raw dispatcher request cap bounds envelope parsing, in addition to source/execution ceilings. Native file IO stays in the CLI host, not the language. Artifacts are unauthenticated and give no proof of historical authorship or timing. No automatic upload, persistence, compiler migration or cache is added.
