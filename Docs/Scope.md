# First playable scope

Status: implementation in progress. Experimental; not production-ready. No license selected (owner decision pending).

Wisp is function-oriented and statically typed. The first slice is a real Rust lexer, parser, checker and bounded interpreter, shared by the native CLI and browser WebAssembly. Its first domain is agent-generated sandboxed CLI/data transformations, later maintained business logic.

Included: checked signed i64 integers, Bool/String, immutable let, typed functions, expression blocks/if, arithmetic/comparisons, captured print, ascending inclusive finite pure probes, structured diagnostics, revision-aware evidence, historical failing inputs (ghosts), compiler-derived dependency metadata, bounded Agent View, editable local worker playground, and Agent/Human documentation.

Not included: records/tagged unions, modules, mutable state, loops, inheritance, host filesystem/network/process access, solver/proofs, automatic intent repair, native C backend, persistent stable semantic editing IDs, incremental compilation, research-grade context capsules, package ecosystem. Graphs are development metadata, not runtime graph interpretation.

Acceptance: CLI and actual WASM execute the snack example; first failure is n=9; proposed repair clears exactly 11 adjacent pairs. Faults are errors, limits Unknown, never passing. Unrelated function edits may preserve dependency keys; changed transitive bodies invalidate them. Historical witnesses survive edits and replay is a new execution. Browser Stop hard-terminates its worker. Fresh documentation visits default Agent.

Passing probes do not establish intent correctness or universal properties. Novelty, adoption, context and performance benefits remain research hypotheses; Sley, Zerolang and Unison are relevant prior art. No superiority benchmarks have been measured.
