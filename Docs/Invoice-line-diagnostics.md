# Invoice line diagnostics

The [invoice batch example](Invoice-batches.md) returns two additional `Int`
fields beside the corresponding counts:

| Field | Meaning |
| --- | --- |
| `first_mismatched_index` | First nonnegative row whose declared cents differ from quantity × unit cents. |
| `first_invalid_index` | First row with negative quantity, unit cents or declared cents. |

Indices are zero-based positions in the original input list, not positions in a
filtered list. Each field is `-1` if there is no matching row. Invalid rows count
only as invalid and remain excluded from both monetary totals, even if their
declared amount differs from their product. Later matching rows do not replace
the first index. Negative payment can make `balanced` false but cannot create an
invalid row. Counts, amounts, payment differences and the existing meaning of
`balanced` are unchanged.

The three-row sample returns `first_mismatched_index: 1` and
`first_invalid_index: -1`. Correcting its second row to 300 declared cents yields
`-1` for both fields. An empty batch also returns `-1` for both. With a valid row,
an invalid row, then two mismatches, the indices are respectively `2` and `1`.
The positions are navigation hints, not invoice identities, authentication,
accounting advice or payment approval.

## Implementation and boundaries

`reconcile` remains the first declared function and accepts the same arguments.
Its Wisp tail traversal carries first indices in immutable `Totals` state,
initialized to `-1`, and retains each first observation. The Rust core is still
the sole evaluator. No JavaScript or Python production business logic, compiler
semantics, interface contract version, protocol or runtime limits changed. The
returned record schema adds the two fields; source revisions and checked schema
boundaries reflect that change. Browser Invoke renders
the actual native/WASM result; Run displays the actual Wisp record.

Overflow returns Error without a partial result. Malformed typed input, including
a malformed final row, is rejected before execution. A physically final row
with a well-typed negative amount is instead a complete reconciliation with an
invalid-row diagnostic; it is not a malformed input or an accepted partial run.

## Finite checks and measured resource use

`tests/invoice_batch.rs` checks the sample, empty and isolated-invalid batches,
multiple mismatches mixed with invalid rows, final-row diagnostics, negative
payment and a 200-row valid batch. The independent Decimal oracle in
`evaluation/invoice-dogfood/experiment.py` uses selection and aggregation, with
`enumerate` over the original rows to obtain indices, rather than copying the
Wisp recurrence. Its 12 complete cases include mixed 200-row input; separate
overflow and malformed-last checks require no partial result.

For 200 valid rows with quantity `i % 7 + 1`, unit cents `100 + i * 3` and
declared cents equal to their product (`i = 0..199`), the computed total is
317012 cents and both indices are `-1`. A native measured call with these new
state fields used **33,964 fuel** and **559,708 logical allocation bytes**, within
the unchanged defaults of 100,000 fuel and 1,048,576 logical allocation bytes.
These are logical interpreter counters, not heap or timing measurements, and
this finite observation does not guarantee arbitrary batches fit the limits.

The browser tests exercise the real WASM summary, including a 200-row mismatch
at index 99 and a packaged-input mismatch at index 199. Native/WASM parity retains
an exact expected result for the all-valid 200-row case. These checks are not
proofs of universal correctness, financial approval or production adoption.

During isolated release verification, two host watchdogs stopped parity after the
guarded-edit section. Sherlock subsequently completed all 367 comparisons using
the same native/WASM artifacts, including instrumented and uninstrumented review
requests; no deterministic evaluator failure or exact blocked request was found.
The cause remains unproven. Review parity subprocesses now have a 30-second timeout
with comparison index/request-byte diagnostics, while the outer host watchdog
still bounds synchronous WASM. A successful later run does not explain away the
earlier watchdog failures.
