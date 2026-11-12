// Alternative algorithm: logarithmic recursive depth rather than a month-deep stack.
// This does NOT relax the runtime's budgets or delegate the calculation to Python.
fn advance_months(loan: Loan, state: Summary, count: Int) -> Summary {
    if count <= 0 || state.balance == 0 {
        state
    } else {
        if count == 1 {
            step(loan, state)
        } else {
            let first = advance_months(loan, state, count / 2);
            advance_months(loan, first, count - count / 2)
        }
    }
}
