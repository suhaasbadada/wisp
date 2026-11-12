// Illustrative invoice reconciliation, not accounting/tax advice or payment approval.
// All amounts are integer cents. Invalid lines are counted and excluded from totals.
record InvoiceLine { quantity: Int, unit_cents: Int, declared_cents: Int }
record Totals { count: Int, computed: Int, declared: Int, mismatched: Int, first_mismatched: Int, invalid: Int, first_invalid: Int }
record Reconciliation {
    line_count: Int,
    computed_cents: Int,
    declared_cents: Int,
    mismatched_lines: Int,
    first_mismatched_index: Int,
    invalid_lines: Int,
    first_invalid_index: Int,
    payment_cents: Int,
    payment_difference_cents: Int,
    balanced: Bool
}

fn reconcile(lines: [InvoiceLine], payment_cents: Int) -> Reconciliation {
    let totals = summarize(lines, 0, new Totals {
        count: 0, computed: 0, declared: 0, mismatched: 0, first_mismatched: -1, invalid: 0, first_invalid: -1
    });
    new Reconciliation {
        line_count: totals.count,
        computed_cents: totals.computed,
        declared_cents: totals.declared,
        mismatched_lines: totals.mismatched,
        first_mismatched_index: totals.first_mismatched,
        invalid_lines: totals.invalid,
        first_invalid_index: totals.first_invalid,
        payment_cents: payment_cents,
        payment_difference_cents: totals.computed - payment_cents,
        balanced: payment_cents >= 0 && totals.invalid == 0 && totals.mismatched == 0 && totals.computed == payment_cents
    }
}

fn summarize(lines: [InvoiceLine], index: Int, state: Totals) -> Totals {
    if index == lines.length {
        state
    } else {
        let line = lines[index];
        let invalid = if line.quantity < 0 || line.unit_cents < 0 || line.declared_cents < 0 { 1 } else { 0 };
        let computed = if invalid == 0 { { let gross = line.quantity * line.unit_cents; if line.quantity >= 10 { (gross / 10) * 9 + ((gross % 10) * 9) / 10 } else { gross } } } else { 0 };
        let declared = if invalid == 0 { line.declared_cents } else { 0 };
        let mismatch = if invalid == 0 && computed != declared { 1 } else { 0 };
        summarize(lines, index + 1, new Totals {
            count: state.count + 1,
            computed: state.computed + computed,
            declared: state.declared + declared,
            mismatched: state.mismatched + mismatch,
            first_mismatched: if state.first_mismatched == -1 && mismatch == 1 { index } else { state.first_mismatched },
            invalid: state.invalid + invalid,
            first_invalid: if state.first_invalid == -1 && invalid == 1 { index } else { state.first_invalid }
        })
    }
}

print(reconcile([InvoiceLine;
    new InvoiceLine { quantity: 2, unit_cents: 250, declared_cents: 500 },
    new InvoiceLine { quantity: 3, unit_cents: 100, declared_cents: 290 },
    new InvoiceLine { quantity: 1, unit_cents: 700, declared_cents: 700 }
], 1500));
