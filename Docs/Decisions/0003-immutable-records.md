# ADR 0003: immutable nominal records for tool data

Accepted 2026-11-09. This follows the agreed function+records direction: inventory/invoice tools need named aggregates rather than parallel primitive parameters. No classes, inheritance, methods, object identity, mutation, recursive data, collections, solver or host IO.

## Contract

```wisp
record Item { quantity: Int, unit_price: Int }
fn total(item: Item) -> Int { item.quantity * item.unit_price }
print(total(new Item { quantity: 9, unit_price: 100 }));
```

Use explicit `new Name { field: expression, ... }` to avoid constructor/if-condition ambiguity. `new` constructs an immutable value, not a class instance. Only `record` and `new` become new keywords; type names remain separate from function/value names. Types are nominal. Forward type references are allowed; all declarations (including unused ones) are checked, and direct/indirect recursive record definitions rejected. Require exact fields once each, with matching types. No defaults, shorthand, spread/update or trailing commas. Empty records allowed.

Evaluate initializers once in source order; store/display in declaration order. Projection binds tighter than unary/binary operators and works on expression receivers (`make_item().quantity`, `new Item { ... }.quantity`). No methods or callable fields. Equality requires the same nominal type and compares fields structurally. Display is deterministic with quoted/escaped nested strings while standalone strings keep raw printing.

## Bounds and evidence

Aggregate copy, projection, scope cloning, equality and display must not bypass allocation/fuel/output accounting. Check before copying/allocating; bound record type/value depth separately from AST/call depth. Budget-aware display never constructs unbounded intermediate output. Limits remain Unknown, never Clear or a fabricated Boolean. Final exact ceilings/accounting are specified in Language.md with tests.

Conservatively hash all name-sorted exact record declaration slices (not source offsets) into function transitive keys, every probe dependency key directly, and run-prefix keys. Record-only changes must invalidate even a direct probe with no calls. Unrelated function edits retain their prior behavior. Metadata exposes record definitions/ordered fields/spans/hashes; Agent View includes bounded definitions or explicit omissions. No minimality, relevance or stable-ID claim.

New reserved words and aggregate semantics require a new compiler semantics identity. Artifact envelope v1 may remain unchanged, but old-compiler artifacts are explicitly rejected before historical execution—no silent migration. This compatibility boundary must be visible in site and native docs.

## Challenge and acceptance

Astra independently challenged grammar ambiguity, initializer/fault ordering, aggregate bound bypasses, direct-probe hash invalidation and compiler compatibility. Acceptance requires native/WASM agreement, invoice example, invalid/recursive/deep types, field errors/spans, transitive effects inside initializers/receivers, copy/equality/display limits and record-bearing artifact roundtrips. Engineering/protocol/Agent/Human docs must match built behavior.
