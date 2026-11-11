// Illustrative only: not finance, tax or company advice or approval.
// Owner requirements: whole cents; reject negatives; cap 10000 inclusive;
// receipt required only above 2500. This baseline intentionally misses both boundaries.
record Expense { amount_cents: Int, receipt: Bool }
record Decision { reimbursable: Bool, reason: String }

fn decide(expense: Expense) -> Decision {
    if expense.amount_cents < 0 {
        new Decision { reimbursable: false, reason: "negative amount" }
    } else {
        if expense.amount_cents >= 10000 {
            new Decision { reimbursable: false, reason: "over cap" }
        } else {
            if expense.amount_cents >= 2500 && !expense.receipt {
                new Decision { reimbursable: false, reason: "receipt required" }
            } else {
                new Decision { reimbursable: true, reason: "allowed" }
            }
        }
    }
}
