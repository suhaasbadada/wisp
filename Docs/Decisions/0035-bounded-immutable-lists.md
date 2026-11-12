# 0035: Bounded immutable lists

## Objective and authorization

The owner approved proceeding from proposal 0001. This increment enables typed,
variable-size batch programs, starting with invoice reconciliation whose business
logic runs entirely in Wisp. It does not add host permissions or claim external
adoption, universal correctness, or superiority to another language.

## Language boundary

- Type: `[T]`, with primitive, nominal record or list element types. No Unit in
  source signatures/literals, no generic functions or new reserved identifiers.
- Explicit typed literal: `[Int; 1, 2]`, empty `[Int;]`, nested
  `[[Int]; [Int; 1], [Int; 2]]`. Elements evaluate exactly once left-to-right.
  No trailing comma. Validate annotation types even on empty/unreachable literals.
- Index: `items[index]`, list receiver before Int index, each evaluated once.
  Negative or out-of-range indices yield Runtime/Error `E_INDEX_BOUNDS`, not a
  default value, wrapping conversion, panic, or partial accepted result.
- Length: `items.length` returns Int. Other list fields are type errors. Nominal
  records can still have ordinary fields named `length`.
- Equality is ordered structural equality for the same list element type;
  different lengths differ. Display is `[value, value]` / `[]`, with nested string
  escaping as for records. The function return type separately types JSON output.
- Lists are immutable, with no update, append, slicing, mutation or object identity.
  Existing tail recursion supports traversal; no new loops/closures/host execution.

## Bounds, sharing and work

Every list has at most 1024 elements. Oversize source literals or typed JSON lists
yield Limit/Unknown `E_LIMIT_LIST_ELEMENTS`. Input bytes, source bytes, tokens,
fuel, cumulative logical allocation, call/evaluation depth and output ceilings
remain unchanged. Combined List/Record static and runtime container depth is at
most 16, counting an empty container as one. Recursive nominal cycles through
lists are rejected. Recursive type parsing is bounded before semantic traversal.
Raw argument JSON includes its root argument-array level (17 maximum); a review
expected value has no argument root level (16 maximum).

Runtime list storage is immutable and shared. Construction reserves a 32-unit
header plus 16 units per element slot before building the runtime vector; each
element expression/construction is charged normally. A copied list reference
costs 16 logical allocation units and one fuel unit, rather than recharging or
traversing its backing payload. Per-expression costs and parameter/binding costs
remain in force. A privately established cached aggregate height lets copy and
record-construction preflight check shared lists without repeated full traversal.
Selected records/strings still pay their actual logical copy costs; selected
lists share their backing storage. No public value mutation can invalidate height.

Index evaluation must not reorder receiver/index effects to satisfy borrowing.
A metered temporary shared handle is acceptable; no vector clone or copy-on-write.
Equality, printing and JSON encoding traverse actual elements and meter work,
including equal shared handles. Structural sharing is not permission for an
unmetered comparison or serialized expansion. Output remains capped and an
interrupted typed call accepts no partial result. Logical units are not measured
heap bytes, CPU time or a bound on all process memory.

## Transport, interfaces and compatibility

Lists use JSON arrays at their declared typed positions. The outer invocation
array remains the argument list. Int elements remain canonical decimal strings;
record children retain duplicate-field rejection and exact key checks. Indexed
JSON Pointer errors identify malformed elements. Decode all arguments/cases and
expectations before any execution, including a malformed last batch element.

Checked interface contract v2 adds `{"kind":"List","element":TYPE}` and an
explicit List array encoding. Review boundary compatibility recursively checks
list elements and nested record schemas on both parameters and return values.
AST traversal includes all literal elements plus receiver and index expressions
for checking, purity, dependency/context graphs and source identities.

Compiler identity becomes semantics-7. Preserve prior fixtures as historical;
reject old artifacts before execution without re-identifying or migrating them.
Request/review/edit envelope versions do not change merely because a new checked
type is available. Native and WASM use the same Rust implementation.

## Acceptance and presentation

Measure, rather than assume, that a 1024-Int tail traversal and a 200-row invoice
batch fit defaults. Compare the invoice calculation to an independent reference.
Test empty/nested/mixed-type lists, overflow, limits, duplicate object keys,
source-order effects, type cycles, equality/display/JSON expansion and runaway
work. Native/WASM agreement and old-artifact rejection remain release gates.

The browser Invoke form transports typed list JSON, never executes host code.
Unsupported List-shaped scenario-builder forms may fail closed with a clear
raw-JSON alternative in this first increment; authoritative native JSON must
remain accessible and no unavailable projection may be described as no change.
