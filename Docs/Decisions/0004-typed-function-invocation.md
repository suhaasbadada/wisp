# ADR 0004: bounded structured input for typed functions

Accepted 2026-11-09. Functions and records are now real language capabilities, but data tools should not rewrite source to accept a request. Add a host JSON invocation protocol, not new language IO or syntax.

## Contract

```json
{"op":"call","source":"record Item { quantity: Int, unit_price: Int } fn total(item: Item) -> Int { item.quantity * item.unit_price }","function":"total","args":[{"quantity":"9","unit_price":"100"}]}
```

Whole-program checking remains mandatory. Invoke only the named global function with its declared parameter types. Do not execute top-level statements or probes. Function-internal captured print remains permitted and bounded; no host filesystem/network/process capability is introduced. Missing args defaults to `[]`; exact arity required. Unknown functions/type mismatch/malformed data are errors before function execution.

Input is type-directed plain JSON: Int is a canonical signed decimal **string** (no leading plus, whitespace or redundant leading zeros, within i64); Bool is JSON boolean; String is JSON string; record is an object with each declared field once, no extras. Nested arrays/null/numbers are unsupported values. Preserve raw argument JSON through Rust decoding so duplicates/numeric widths are not normalized away. Bound raw argument JSON to 64 KiB as well as the existing 1 MiB whole-envelope limit. Structured input errors identify the argument/field path separately from source spans.

The core constructs literal input values/AST only; input strings never become source or expressions. Inputs consume the same logical allocation, fuel and depth budgets as language values. Call result is `result:{type:<language name>,value:<same type-directed JSON encoding>}`. i64 remains a string in both directions. Captured print plus encoded result value share the output-byte ceiling; streaming/metered encoding must not construct an unbounded intermediate. Report metadata is outside that ceiling, as for existing reports. Faults Error, limits Unknown; no partial result accepted. A successful call is observed execution, never finite-probe Clear or proof.

Execution identity includes call operation, compiler, effective config, input material, target/transitive body and conservative record declaration dependencies. Whole source revision remains separate. No cache or cross-key reuse. This additive host operation does not change language semantics or invalidate existing semantics-5 artifacts.

## Clients and acceptance

Native `wisp call FILE FUNCTION [--args-file INPUT]` reads bounded explicit local data (or `-` stdin); no JSON secrets in command arguments. Existing command/exit compatibility remains. Browser adds a clearly labeled typed-function invocation form with editable JSON args, target selector, real local WASM, Stop/deadline and current-vs-historical source/input labels. Default Run remains whole-program/probes; invocation never masquerades as a probe run.

Require native/WASM agreement for primitive/extreme-i64/nested-record input/output; exact type/arity/duplicate/unknown/invalid data; no source injection; skip top-level runtime effects while still whole-program checking; nested captured prints; input/output/depth/fuel/allocation bounds; call identity changes on target/transitive/type/config/input changes; unchanged unrelated functions; malformed or interrupted calls never passing evidence. Update protocol/CLI/Agent/Human docs and shared test examples. No arbitrary eval, JSON library in the language, solver, backend or new permission.
