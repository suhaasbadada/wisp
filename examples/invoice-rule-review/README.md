# Invoice batch: review an authored rule change

This is an illustrative business decision, **not** payment approval or a rule
chosen on a real owner's behalf. The author explicitly requests: for a valid
line with quantity at least 10, charge `floor(9 * gross / 10)` cents; otherwise
charge gross. Invalid lines remain excluded. Wisp's Rust core alone evaluates
the rule; there is no browser business-logic implementation.

The baseline remains [`../invoice-batch.wisp`](../invoice-batch.wisp).
[`bulk-discount.wisp`](bulk-discount.wisp) differs by exactly one product-expression
replacement inside `summarize`. Records, reconciliation, immutable tail-recursive
state, first-index diagnostics and the three-small-quantity printed sample stay
unchanged. The unchanged sample does **not** exercise the discount: use the files
below instead.

From the repository root:

```sh
cargo run -- review examples/invoice-batch.wisp examples/invoice-rule-review/bulk-discount.wisp --suite examples/invoice-rule-review/cases.json
cargo run -- verify examples/invoice-rule-review/bulk-discount.wisp --suite examples/invoice-rule-review/cases.json
cargo run -- call examples/invoice-rule-review/bulk-discount.wisp reconcile --args-file examples/invoice-rule-review/args.json
```

The review is Pass (exit 0), with 6 changed and 3 unchanged cases. The call has
two rows, 1800 computed/declared/payment cents, no invalid/mismatched lines and
`balanced: true`. Review/Call skip the source's top-level print.

Now retain the previous requirements, without silently updating them:

```sh
cargo run -- review examples/invoice-batch.wisp examples/invoice-rule-review/bulk-discount.wisp --suite examples/invoice-rule-review/previous-requirements.json
cargo run -- verify examples/invoice-rule-review/bulk-discount.wisp --suite examples/invoice-rule-review/previous-requirements.json
```

These deliberately Fail (exit 1): six changed cases violate the previous authored
requirements. Both suites use identical inputs and explicit, hand-worked complete
`Reconciliation` expectations, not results copied from an execution. Passing the
new suite means nine finite observations meet those new requirements, not that
the business choice is right, universally correct or authorized. Review reports
`approval: "not_granted"` in either case.

For generic browser file import, raw list-shaped scenarios, the hand calculation
ledger, overflow boundaries and runnable package workflow, see
[`Docs/Invoice-rule-review.md`](../../Docs/Invoice-rule-review.md).
