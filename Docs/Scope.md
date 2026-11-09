# First playable scope

Status: first playable, portable failure workflow, immutable records and bounded typed invocation shipped via PRs #1–#4. Stable diagnostic/discovery contract (ADR 0005) in progress. Experimental; not production-ready. No license selected (owner decision pending).

Wisp is function-oriented and statically typed. The first slice is a real Rust lexer, parser, checker and bounded interpreter, shared by the native CLI and browser WebAssembly. Its first domain is agent-generated sandboxed CLI/data transformations, later maintained business logic.

Included: checked signed i64 integers, Bool/String, immutable let, typed functions and nominal immutable records, field projection/structural equality/deterministic display, expression blocks/if, arithmetic/comparisons, captured print, ascending inclusive finite pure probes, structured diagnostics, revision-aware evidence, historical failing inputs (ghosts), compiler-derived dependency metadata, bounded Agent View, editable local worker playground, and Agent/Human documentation.

Post-first-playable increment: native check/focus/run/archive/inspect/replay commands and explicit versioned ghost file export/import, with bounded shared Rust validation. This extends workflows, not the language grammar or proof claims.

Structured invocation adds local type-directed input/output for one named function with native file/stdin and browser JSON hosts. Source is checked but top-level statements/probes do not execute. No language IO, new syntax, filesystem/network capability, input eval, backend or cache is added.

Machine-contract hardening adds explicit stable diagnostic codes and compiler-owned capabilities/static discovery with truthful permissions, logical limits, actual features, runnable examples and uncertainty. It does not change language semantics, existing evidence identities or artifact acceptance and does not authorize automatic intent repair.

Not included: tagged unions, recursive records, collections, modules, mutable state, loops, inheritance/methods/object identity, host filesystem/network/process access, solver/proofs, automatic intent repair, native C backend, persistent stable semantic editing IDs, incremental compilation, research-grade context capsules, package ecosystem. Graphs are development metadata, not runtime graph interpretation.

Acceptance: CLI and actual WASM execute the snack example; first failure is n=9; proposed repair clears exactly 11 adjacent pairs. Faults are errors, limits Unknown, never passing. Unrelated function edits may preserve dependency keys; changed transitive bodies invalidate them. Historical witnesses survive edits and replay is a new execution. Browser Stop hard-terminates its worker. Fresh documentation visits default Agent.

Passing probes do not establish intent correctness or universal properties. Novelty, adoption, context and performance benefits remain research hypotheses; Sley, Zerolang and Unison are relevant prior art. No superiority benchmarks have been measured.
