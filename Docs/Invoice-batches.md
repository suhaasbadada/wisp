# Reconcile a variable-size invoice batch

This program accepts a list of invoice lines, recomputes their amounts, checks
declared totals and compares the result with a separately supplied payment.
All calculation and validation logic is Wisp, not browser JavaScript or Python.
It is an illustrative reconciliation model, not accounting/tax advice or payment
authorization. Authored examples are not evidence of production adoption.

## Browser

Open the [language playground](https://suhaasbadada.github.io/wisp/#playground),
select **Invoice batch reconciliation**, and select **Run**. Selection only
loads/checks. The sample deliberately includes a line declared as 290 cents whose
quantity and unit price produce 300 cents. Its output includes:

```text
line_count: 3, computed_cents: 1500, declared_cents: 1490,
mismatched_lines: 1, first_mismatched_index: 1,
invalid_lines: 0, first_invalid_index: -1,
payment_cents: 1500, payment_difference_cents: 0, balanced: false
```

Matching payment alone does not hide a mismatched invoice line.

To change data without editing source, choose `reconcile` in **Invoke a typed
function** and use this argument array:

```json
[[{"quantity":"2","unit_cents":"250","declared_cents":"500"},{"quantity":"3","unit_cents":"100","declared_cents":"290"},{"quantity":"1","unit_cents":"700","declared_cents":"700"}],"1500"]
```

The outer array holds two arguments. Its first argument is a typed list of
`InvoiceLine` records; the second is payment cents. Int values are decimal
strings, never floating-point JSON numbers. Change the second line's declared
amount to `"300"`, then select **Invoke**: the result has zero mismatches and
`balanced: true`. Invoke skips the sample's top-level print; Run executes it.
An empty batch with zero payment uses `[[],"0"]`.
To load a dataset file, check types without execution and download exact inputs
for a fresh native attempt, see [Function inputs](Function-inputs.md).
To change an explicitly authored pricing rule and review its consequences against
both new and retained requirements, see [Invoice rule review](Invoice-rule-review.md).
For CSV datasets already expressed as integer cents, use the explicit local
[CSV host transport](Invoice-CSV.md); it validates by default and never evaluates
CSV formulas or calculates prices itself.

Explicit example selection replaces source/resets arguments. Save current inputs
before switching. Manual source edits and metadata refresh do not reset arguments.

## Native and Python

```sh
cargo run -- check examples/invoice-batch.wisp
cargo run -- examples/invoice-batch.wisp
cargo run -- call examples/invoice-batch.wisp reconcile --args-file examples/invoice-batch-args.json
```

CLI stdout is a structured JSON report. Whole-program print is captured in
`output`; Invoke returns `result.value`. The Python project client supports
checked-interface v2 List metadata and typed list arguments/results; it is host
transport, not a second evaluator. See [Python client](Python-client.md).

## Meaning and bounds

All amounts are integer cents. Quantity is an integer count. A negative quantity,
unit price or declared amount makes that line invalid: it is counted in
`invalid_lines` and excluded from both monetary totals. Other lines still
contribute. Mismatch counts apply to nonnegative lines only. `balanced` requires
nonnegative payment, no invalid lines, no declared mismatches and exact payment
agreement. It does not authorize payment or assert the invoice's authenticity.
`first_mismatched_index` and `first_invalid_index` locate the first corresponding
row in the original input, zero-based, or return `-1` when none exists. Invalid
rows are never also mismatches; negative payment does not create an invalid row.
See [Invoice line diagnostics](Invoice-line-diagnostics.md) for examples and checks.

There is no currency conversion, tax, discount, dates, identity matching or fraud
detection. Arithmetic overflow is Error; work exhaustion is Unknown, never an
accepted partial reconciliation. A malformed last input element prevents the
entire invocation from executing and carries an indexed JSON Pointer diagnostic.

Each list is capped at 1024 elements; raw invocation arguments are capped at
64 KiB, so a list of large records can hit the byte cap first. Combined list/record
depth is 16. Existing default ceilings remain 100,000 fuel and 1,048,576 logical
allocation units. A measured 200-row valid batch completes within them; that is
not a guarantee for every shape/value/batch. List sharing is constant-cost, but
construction, access, equality, display and output encoding remain metered.
Logical units do not measure actual heap memory or elapsed CPU time.

## Language and current UI scope

The source uses `[InvoiceLine]`, an explicit typed literal `[InvoiceLine; ...]`,
`lines.length`, checked `lines[index]` and tail recursion. No mutable arrays,
loops, imports or host permissions are involved. Empty source lists are explicit,
for example `[Int;]`. Negative/out-of-range indexing is a native Runtime Error.

Typed Invoke and raw scenario/review JSON support lists. The new-scenario builder
also offers [manual List JSON fields](List-scenario-builder.md), including record
members and required results. Owners type all values; Add does not execute or
infer expectations. The raw editor remains available for unsupported form data.
Field-difference views show bounded positional list differences, not row identity
or moves; full native JSON remains available when the view is limited or
unsupported. See [List value differences](List-value-differences.md). These are UI limits,
not list execution failures. See [Language](Language.md), [Interface](Interface.md)
and [Workbench](Workbench.md). Compiler semantics-7 does not migrate old evidence.
