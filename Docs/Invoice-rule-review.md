# Review an explicitly authored invoice rule change

## Decision and ownership

This author-owned demonstration extends [invoice batches](Invoice-batches.md)
without changing their baseline. Its explicitly chosen illustrative requirement
is **10% off valid lines whose quantity is at least 10**, rounding each discounted
line down to integer cents: `floor(9 * gross / 10)`. It does not infer user intent,
select a rule on an owner's behalf, approve money movement, attest invoice
authenticity, or demonstrate production adoption. A real owner must decide which
requirements apply; updating expectations is a separate explicit business act.

The baseline is [`examples/invoice-batch.wisp`](../examples/invoice-batch.wisp).
The [candidate](../examples/invoice-rule-review/bulk-discount.wisp) changes only
`line.quantity * line.unit_cents` within `summarize` to:

```text
{ let gross = line.quantity * line.unit_cents;
  if line.quantity >= 10 {
    (gross / 10) * 9 + ((gross % 10) * 9) / 10
  } else { gross } }
```

For nonnegative gross this computes the specified floor without an unnecessary
`9 * gross` intermediate overflow. Multiplication to obtain gross, summation and
payment subtraction remain checked i64 arithmetic. A gross product outside i64
still errors even if its mathematical discounted value might fit. Invalid rows
do not multiply at all. The quantity threshold is per line, not per invoice;
rounding is per line, not after aggregation.

No record fields/types, reconciliation conditions, state transitions, top-level
sample or bounds change. Negative quantity/unit/declared makes a row invalid and
excludes both amounts; invalid rows still occupy their original index. Payment
minus rule total is **not** the diagnostic: the signed difference is computed
total **minus payment**. Balanced still requires nonnegative payment, no invalid
rows, no mismatches and exact payment agreement. The old small-quantity sample
is unchanged and does not exercise the new rule.

## Load data, review, run

From the repository root, with a trusted native toolchain:

```sh
cargo run -- validate examples/invoice-rule-review/bulk-discount.wisp reconcile --args-file examples/invoice-rule-review/args.json
cargo run -- review examples/invoice-batch.wisp examples/invoice-rule-review/bulk-discount.wisp --suite examples/invoice-rule-review/cases.json
cargo run -- verify examples/invoice-rule-review/bulk-discount.wisp --suite examples/invoice-rule-review/cases.json
cargo run -- call examples/invoice-rule-review/bulk-discount.wisp reconcile --args-file examples/invoice-rule-review/args.json
```

`args.json` has a nine-unit line for 900 cents and a ten-unit line declared at its
new 900-cent discounted amount, with payment 1800 cents. The candidate returns
line count 2, computed/declared/payment 1800, no mismatches or invalids, both first
indices -1, difference 0, balanced true. Validate checks shapes without execution;
Call makes a fresh attempt and skips top-level statements. All Ints are decimal
strings, including counts, indices, quantities and amounts.

Review and Verify against `cases.json` Pass (exit 0). To see why the rule cannot
be automatically blessed, retain the old requirements:

```sh
cargo run -- verify examples/invoice-batch.wisp --suite examples/invoice-rule-review/previous-requirements.json
cargo run -- review examples/invoice-batch.wisp examples/invoice-rule-review/bulk-discount.wisp --suite examples/invoice-rule-review/previous-requirements.json
cargo run -- verify examples/invoice-rule-review/bulk-discount.wisp --suite examples/invoice-rule-review/previous-requirements.json
```

Baseline Verify Passes. The latter two deliberately Fail (exit 1), not host/tool
failure. Both reviews show **6 Changed, 3 Unchanged**, with 18 attempted
invocations. The candidate matches all nine new expectations and fails six old
ones. Both suites are manually authored requirements on the exact same inputs;
neither is synthesized from observed reports. Review never applies the candidate,
rewrites source/data/expectations, or grants approval (`not_granted`).

## Hand-worked finite ledger

Full expected records and empty expected output appear in
[`cases.json`](../examples/invoice-rule-review/cases.json) and
[`previous-requirements.json`](../examples/invoice-rule-review/previous-requirements.json).
Here `B` means baseline, `C` candidate, and indices are zero-based:

| Case | Hand calculation and consequences |
| --- | --- |
| empty | No rows, zero payment/totals, no diagnostics, balanced in both. |
| quantity-nine | `9 * 100 = 900`; threshold not reached, balanced in both. |
| ten-old-declaration | `10 * 100 = 1000`, C charges 900; declaration 1000/payment 900. B has no mismatch but difference 100; C mismatch index 0 but difference 0. Neither balanced. |
| ten-new-declaration | Same gross, declaration/payment 900. B mismatch index 0 and difference 100; C no mismatch, balanced. |
| mixed-original-indices | Five rows: 900; invalid; gross 1000/declared 1000; gross 1111/declared 998; invalid last. B total `900+1000+1111=3011`; C `900+900+999=2799`; declared `900+1000+998=2898`. Payment 2799, B difference 212/C 0. B one mismatch first 3; C two first 2. Both two invalid first 1 and unbalanced. |
| exact-discount | `10 * 101 = 1010`, `9 * 1010 / 10 = 909` exactly. Declaration 1010/payment 909: B difference 101/no mismatch; C difference 0/mismatch first 0, neither balanced. |
| floor-and-old-payment | `11 * 101 = 1111`; floor of 999.9 is 999. Declaration 999/payment 1111: B difference 0/mismatch first 0; C difference -112/no mismatch, neither balanced. |
| maximum-valid-gross | `9223372036854775807 * 1`. Quotient 922337203685477580, remainder 7; discounted `8301034833169298220 + 6 = 8301034833169298226`. Declaration/payment equal discount. B mismatch first 0/difference 922337203685477581; C balanced without intermediate overflow. |
| invalid-last | First row 900; last has max quantity, unit 2, declared -1. Invalid guard excludes it before multiplication. Both count 2, total/declared/payment 900, one invalid at index 1, no mismatch, unbalanced. |

Missing first indices are -1. Additional native tests (outside the Complete-only
review fixtures) make a **valid** max-quantity/unit-2 row fault with
`E_INT_OVERFLOW`, never an accepted partial reconciliation. Changing the final
row's quantity in the final scenario to a JSON number makes whole-suite preflight
reject `/suite/cases/8/args/0/1/quantity` with zero executions, even though all
earlier cases are valid.

## Existing browser paths, no specialized UI

Use the generic [focused workbench](https://suhaasbadada.github.io/wisp/?workbench)
and **Open your policy files**: select the existing baseline, candidate and
`cases.json`, then explicitly **Open files — replace unsaved inputs**. Selection
alone does not load or execute. Inspect all three inputs, then explicitly Review.
Keep a draft before replacing unsaved work. List-shaped scenario arguments and
requirements can use [manual List JSON fields](List-scenario-builder.md) or the
advanced raw editor. Add stages owner-entered values without execution or inferred
expectations; Review remains explicit. List result differences use bounded
positional paths, not row identities; full native JSON remains authoritative when
the view is limited or unavailable. Open the old suite and
Review again to observe Fail without inferring replacement expectations. The
existing review-package download preserves supported evidence; it is not a
deployment or authorization. See [Workbench](Workbench.md) for its contract.

For runnable data in the [language playground](https://suhaasbadada.github.io/wisp/#playground),
load the invoice example, explicitly replace source with the candidate text,
choose `reconcile` and use **Open, check or reproduce function inputs** to select
`args.json`, then **Load inputs**. Select **Check input shapes**, then optionally
**Download runnable inputs package** and explicitly **Invoke**. Ready is only
shape validation, not a successful invocation. Use the downloaded exact source
and args with a trusted matching compiler as described in
[Function inputs](Function-inputs.md). The default starter/example is not changed.
These are existing browser paths, not a new invoice UI. Separate browser tests
exercise explicit file import, both native/WASM review outcomes, exported-review
native reproduction, and validation followed by explicit invocation. Native
integration tests alone do not establish browser behavior. The static build
publishes the fixed linked baseline, candidate and data files byte-for-byte;
download them explicitly before selecting them in the browser's file chooser.

## Compatibility, verification and limits

Business evaluation remains exclusively in the Rust core, shared by native and
WASM transport. The unchanged `reconcile` body depends on changed `summarize`;
its transitive hash changes, while its own body hash/signature and record shapes
stay fixed. Focus metadata includes `summarize`; it is a conservative syntactic
dependency, not proof or context completeness.

The native integration test checks exact one-expression source equality, manual
fixtures on both programs, both review outcomes/counts, CLI exit behavior, shape
compatibility, hashes/dependencies, malformed-last-case preflight, overflow,
runnable data and unchanged input files:

```sh
cargo test --test invoice_rule_review
cargo clippy --test invoice_rule_review -- -D warnings
cargo fmt --all -- --check
```

Existing list size 1024, argument byte 64 KiB, combined depth 16, default fuel
100,000 and logical allocation 1,048,576 bounds remain. A shape-valid arbitrary
batch may still exhaust work (Unknown) or overflow (Error). Nine finite examples
do not prove a universal property, performance superiority or business validity.
No tax/currency conversion, external host execution, filesystem/network language
access, real invoice import adapter, payment integration or approval is added.
