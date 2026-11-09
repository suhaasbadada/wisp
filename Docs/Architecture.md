# Architecture

The Rust core owns tokenization, AST, checking, conservative call/effect analysis, interpretation, hashing and serializable reports. Native CLI and wasm-bindgen expose the same operations. TypeScript renders reports as text and runs WASM in a dedicated worker; it does not implement language semantics.

Whole-source SHA-256 revision identity is distinct from conservative per-function/transitive dependency identity. Evidence must include predicate/range, compiler semantics version and execution configuration. No cross-key cache reuse is permitted. Agent View is compiler-derived context selection, not guaranteed task relevance or completeness. Stable symbol identity separate from version hashes is deferred; names are local identities only.

Bounds cover source, syntax nesting, calls, fuel, output, probe cases and logical allocation. Browser worker termination provides hard cancellation. Logical allocation limits are not an absolute bound on Rust/WASM/JS/browser process memory. No backend or API key is required.

Portable artifacts (ADR 0002) are explicit local files with full historical source, compiler identity, exact limits and one receipt. Rust validates envelopes and reproduces the exact first failure before acceptance. CLI/UI preserve raw artifact JSON for the shared decoder (no JavaScript/Value normalization of duplicate fields); malformed UTF-8 is rejected. A 1 MiB raw dispatcher request cap bounds envelope parsing, in addition to source/execution ceilings. Native file IO stays in the CLI host, not the language. Artifacts are unauthenticated and give no proof of historical authorship or timing. No automatic upload, persistence, compiler migration or cache is added.

## Immutable records (semantics-5)

Named records live in a nominal type namespace, separate from functions/values. Explicit `new` construction avoids if/brace ambiguity. A memoized, depth-bounded type DAG pass rejects recursive/deep types without expanding shared schemas into trees. Runtime record values have a separate depth cap. Initializers run once in source order; storage, equality traversal and display use declaration order. The runtime has no derived aggregate Clone/PartialEq that could bypass bounds: copies preflight payload allocation/depth, and equality/display traversal and string/output bytes consume fuel. Formatting streams capped fragments and rolls back an interrupted print, not a whole prebuilt aggregate string. These are logical units, never actual allocator/process guarantees.

Compiler graph metadata exposes record declarations/ordered fields/spans/hashes. All name-sorted exact record declarations conservatively contribute to every function transitive hash, direct probe property dependency and run prefix. This intentionally over-invalidates unrelated record changes, including unused records; it is not minimal relevance analysis. Offsets alone are excluded. Agent View record definitions share the UTF-8 text budget and report truncation/omissions.

The compiler identity changes to `wisp-0.1.0-semantics-5` because keywords and resource metering change. Artifact format remains version 1 but requires exact compiler identity. Earlier compiler artifacts are explicitly unsupported before historical execution; no silent migration, rehashing or retroactive evidence upgrade.
