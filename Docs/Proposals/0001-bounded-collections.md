# Proposal: bounded immutable collections

**Status: direction approved by the owner; implementation in progress.**
The selected syntax and safety decisions are in ADR 0035. This proposal remains
design rationale, not evidence that implementation or release gates have passed.

## User problem

The loan trial exercises records, arithmetic and tail-recursive state, but it
does not establish useful batch programming. At proposal time Wisp had no collections:
an invoice reconciler cannot accept a variable number of lines or return a
variable-length set of discrepancies without moving that logic into the host.
Fixed record slots or generating a function per input are not acceptable substitutes.

## Proposed acceptance task

Write an invoice reconciliation program entirely in Wisp. Accept a typed list of
line records plus an independently supplied payment amount; calculate line count,
amount due and discrepancy totals. Exercise empty, one-line and mixed multi-line
batches, malformed elements, overflow, long batches and deliberate nontermination.
Compare results against an independently implemented Decimal/BigInt reference.
Use authored fixtures honestly; actual operator adoption needs a separate trial.

## Recommended first scope

- Homogeneous immutable lists of existing primitive/record/list types, with
  explicit type identity at the public boundary. No mutable arrays, object
  identity, closures, network/filesystem/process access or implicit conversions.
- Length and checked indexing, enough for existing tail-recursive traversal;
  do not add loops, higher-order functions or a broad standard library merely to
  implement the first batch program. Bounds errors must be stable diagnostics.
- Keep empty lists unambiguous through an explicit type or checked expected type.
  The literal/type syntax and inference rule require a design decision; this
  proposal deliberately does not advertise unimplemented syntax as runnable Wisp.
- Preserve exact integer strings in JSON. Decode each array element against its
  declared type, preserve duplicate-field checks inside records, and use indexed
  JSON Pointer diagnostics. Existing root argument arrays remain argument lists;
  they must not be confused with a list-valued argument.
- Reject recursive nominal type cycles through lists as well as records. Enforce
  nesting, element count, input bytes and encoded output budgets before accepting
  values. Choose element ceilings from the acceptance workload and measurements,
  not a promise that any arbitrary batch will fit existing resources.

## Runtime and safety work that cannot be skipped

Passing an unchanged immutable list through a tail call must not deep-copy all
its elements each iteration. Otherwise ordinary traversal becomes quadratic and
repeats the allocation failure that motivated semantics-6. Specify immutable
sharing/ownership and its logical accounting before implementation; reference
sharing must not imply mutation or evade bounds on construction, access, equality,
encoding, recursion or total work. Logical accounting is not measured process memory.

The Rust core remains the only evaluator. Native/WASM must agree on types,
results, ordering, failures and metering; browser TypeScript only transports and
renders values. Whole-source checking still precedes execution. Invalid data or
resource exhaustion must not become a partial successful reconciliation.

## Compatibility and decision gate

This changes the type system, grammar/transport boundary, value accounting and
compiler-dependent evidence identities. It needs a new compiler identity,
documented old-artifact rejection, a complete contract and independent review.
Do not rewrite historical fixtures or implement this as a host-language bypass.

Before coding, confirm the product direction: should Wisp remain intentionally
limited to small scalar/record decisions, or support bounded batch programs?
The recommendation is **bounded batch programs**, starting with the reconciliation
task above. This is a consequential language expansion, not another example or
workbench feature, so the proposal is not itself authorization to implement it.
