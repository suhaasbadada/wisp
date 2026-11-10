# First playable scope

Policy review v1 (ADR 0010) implements an agent-facing workbench with explicit
typed cases, shared Rust before/after execution, candidate expectations and
revision-linked evidence. Native review/verify and browser review shipped via
PR #10; saved repository projects shipped via PR #11; native decision adapter
shipped via PR #12; checked interface discovery shipped via PR #13. A composed
order reference workflow shipped via PR #14; caller-owned composed gates shipped
via PR #15; the reusable experimental Python client shipped via PR #16. Read-only
repository workflow triage shipped via PR #17. Explicit-attempt read-only GitHub
capture shipped via PR #18; observation receipts via PR #19. Offline replay and
operator handoff shipped via PR #20; local MCP tools via PR #21. Optional
owner-configured MCP project tools shipped via PR #22 and caller-owned snapshot
guards via PR #23; saved-project context via PR #24; bounded native collection via
PR #25; saved-policy finite-suite verification via PR #26; required pinned SDK CI
via PR #27; real-SDK failure/reconnect regressions via PR #28; historical-status
clarification via PR #29; inline preparation via PR #30; saved preparation via
PR #31; saved exact-candidate review via PR #32. The read-only pinned maintenance
driver (ADR 0032) is under verification/publication, coordinating these primitives
without expectation changes, writes or Apply.
No approval, automatic application,
new language syntax or core host permissions. See [Workbench](Workbench.md),
[Projects](Projects.md) and [Adapter](Adapter.md).

Repeated maintenance study (ADR 0009): completed, with both arms passing three
repetitions of one synthetic task. No language/core changes or efficiency claim.
The next product direction led to shipped policy review v1 and saved projects.
Necessary capability upgrades remain in scope for subsequent bounded increments.

Earlier product-validation pilot (ADR 0008) informed the current direction.
Guarded edits through PR #7 are shipped and live-verified. Three paired tasks and
an exact finite acceptance harness expose workflow friction with explicit study
limitations; no token-cost, performance or superiority claim. No core behavior or
permission changes. See [Evaluation](Evaluation.md).

Guarded edit v1 adds explicit single-body preparation from a checked baseline with source/body guards and preservation audit. Native hosts can write a new file; the browser offers explicit one-use Apply. No automatic execution, repair, solver, persistent IDs or intent proof. Invalid-baseline repair is deferred. Prior evidence remains historical. Context ledger and guarded edits are shipped.

Status: shipped through saved candidate review via PR #32; release acceptance is recorded on each corresponding PR. The pinned maintenance driver is under publication. Continued tested development is authorized. Experimental; not production-ready. No license selected (owner decision pending).

Wisp is function-oriented and statically typed. The first slice is a real Rust lexer, parser, checker and bounded interpreter, shared by the native CLI and browser WebAssembly. Its first domain is agent-generated sandboxed CLI/data transformations, later maintained business logic.

Included: checked signed i64 integers, Bool/String, immutable let, typed functions and nominal immutable records, field projection/structural equality/deterministic display, expression blocks/if, arithmetic/comparisons, captured print, ascending inclusive finite pure probes, structured diagnostics, revision-aware evidence, historical failing inputs (ghosts), compiler-derived dependency metadata, bounded Agent View, editable local worker playground, and Agent/Human documentation.

Post-first-playable increment: native check/focus/run/archive/inspect/replay commands and explicit versioned ghost file export/import, with bounded shared Rust validation. This extends workflows, not the language grammar or proof claims.

Structured invocation adds local type-directed input/output for one named function with native file/stdin and browser JSON hosts. Source is checked but top-level statements/probes do not execute. No language IO, new syntax, filesystem/network capability, input eval, backend or cache is added.

Machine-contract hardening adds explicit stable diagnostic codes and compiler-owned capabilities/static discovery with truthful permissions, logical limits, actual features, runnable examples and uncertainty. It does not change language semantics, existing evidence identities or artifact acceptance and does not authorize automatic intent repair.

Probe context adds non-executing selected-predicate/dependency source with a deterministic atomic TEXT-byte ledger and explicit budget/scope omissions. It is compiler-derived metadata, not a runtime graph interpreter, context-completeness/relevance/minimality guarantee, proof engine, persistent ID system or automatic source/spec edit.

Not included: tagged unions, recursive records, collections, modules, mutable state, loops, inheritance/methods/object identity, host filesystem/network/process access, solver/proofs, automatic intent repair, native C backend, persistent stable semantic editing IDs, incremental compilation, research-grade context capsules, package ecosystem. Graphs are development metadata, not runtime graph interpretation.

Acceptance: CLI and actual WASM execute the snack example; first failure is n=9; proposed repair clears exactly 11 adjacent pairs. Faults are errors, limits Unknown, never passing. Unrelated function edits may preserve dependency keys; changed transitive bodies invalidate them. Historical witnesses survive edits and replay is a new execution. Browser Stop hard-terminates its worker. Fresh documentation visits default Agent.

Passing probes do not establish intent correctness or universal properties. Novelty, adoption, context and performance benefits remain research hypotheses; Sley, Zerolang and Unison are relevant prior art. The small comparisons have demonstrated no superiority.
