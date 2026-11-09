# First playable scope

Policy review v1 (ADR 0010) implements an agent-facing workbench with explicit
typed cases, shared Rust before/after execution, candidate expectations and
revision-linked evidence. Native review/verify and browser review are under
integration verification. No approval, automatic application, language semantics
change or new core permissions. See [Workbench](Workbench.md).

Repeated maintenance study (ADR 0009): completed, with both arms passing three
repetitions of one synthetic task. No language/core changes or efficiency claim.
The next product direction led to policy review v1, now under publication review.
Necessary capability upgrades remain in scope for subsequent bounded increments.

Earlier product-validation pilot (ADR 0008) informed the current direction.
Guarded edits through PR #7 are shipped and live-verified. Three paired tasks and
an exact finite acceptance harness expose workflow friction with explicit study
limitations; no token-cost, performance or superiority claim. No core behavior or
permission changes. See [Evaluation](Evaluation.md).

Guarded edit v1 adds explicit single-body preparation from a checked baseline with source/body guards and preservation audit. Native hosts can write a new file; the browser offers explicit one-use Apply. No automatic execution, repair, solver, persistent IDs or intent proof. Invalid-baseline repair is deferred. Prior evidence remains historical. Context ledger and guarded edits are shipped.

Status: first playable through guarded edits/initial validation shipped via PRs #1–#8. Repeated maintenance study is locally verified; its remote publication remains pending. Experimental; not production-ready. No license selected (owner decision pending).

Wisp is function-oriented and statically typed. The first slice is a real Rust lexer, parser, checker and bounded interpreter, shared by the native CLI and browser WebAssembly. Its first domain is agent-generated sandboxed CLI/data transformations, later maintained business logic.

Included: checked signed i64 integers, Bool/String, immutable let, typed functions and nominal immutable records, field projection/structural equality/deterministic display, expression blocks/if, arithmetic/comparisons, captured print, ascending inclusive finite pure probes, structured diagnostics, revision-aware evidence, historical failing inputs (ghosts), compiler-derived dependency metadata, bounded Agent View, editable local worker playground, and Agent/Human documentation.

Post-first-playable increment: native check/focus/run/archive/inspect/replay commands and explicit versioned ghost file export/import, with bounded shared Rust validation. This extends workflows, not the language grammar or proof claims.

Structured invocation adds local type-directed input/output for one named function with native file/stdin and browser JSON hosts. Source is checked but top-level statements/probes do not execute. No language IO, new syntax, filesystem/network capability, input eval, backend or cache is added.

Machine-contract hardening adds explicit stable diagnostic codes and compiler-owned capabilities/static discovery with truthful permissions, logical limits, actual features, runnable examples and uncertainty. It does not change language semantics, existing evidence identities or artifact acceptance and does not authorize automatic intent repair.

Probe context adds non-executing selected-predicate/dependency source with a deterministic atomic TEXT-byte ledger and explicit budget/scope omissions. It is compiler-derived metadata, not a runtime graph interpreter, context-completeness/relevance/minimality guarantee, proof engine, persistent ID system or automatic source/spec edit.

Not included: tagged unions, recursive records, collections, modules, mutable state, loops, inheritance/methods/object identity, host filesystem/network/process access, solver/proofs, automatic intent repair, native C backend, persistent stable semantic editing IDs, incremental compilation, research-grade context capsules, package ecosystem. Graphs are development metadata, not runtime graph interpretation.

Acceptance: CLI and actual WASM execute the snack example; first failure is n=9; proposed repair clears exactly 11 adjacent pairs. Faults are errors, limits Unknown, never passing. Unrelated function edits may preserve dependency keys; changed transitive bodies invalidate them. Historical witnesses survive edits and replay is a new execution. Browser Stop hard-terminates its worker. Fresh documentation visits default Agent.

Passing probes do not establish intent correctness or universal properties. Novelty, adoption, context and performance benefits remain research hypotheses; Sley, Zerolang and Unison are relevant prior art. The small comparisons have demonstrated no superiority.
