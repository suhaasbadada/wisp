// Illustrative fixed-rate repayment model, not financial advice.
// Integer cents; nominal annual basis points; monthly interest rounds half up.
// No dates, taxes, fees or variable rates. No host code is called by Wisp.
record Loan {
    principal: Int,
    annual_bps: Int,
    payment: Int,
    extra: Int,
    months: Int
}

record Summary {
    months_elapsed: Int,
    balance: Int,
    total_paid: Int,
    total_interest: Int,
    valid: Bool
}

fn interest(balance: Int, annual_bps: Int) -> Int {
    (balance * annual_bps + 60000) / 120000
}

fn minimum(a: Int, b: Int) -> Int {
    if a < b { a } else { b }
}

fn step(loan: Loan, state: Summary) -> Summary {
    let charge = interest(state.balance, loan.annual_bps);
    let paid = minimum(loan.payment + loan.extra, state.balance + charge);
    new Summary {
        months_elapsed: state.months_elapsed + 1,
        balance: state.balance + charge - paid,
        total_paid: state.total_paid + paid,
        total_interest: state.total_interest + charge,
        valid: true
    }
}

fn amortize(loan: Loan, state: Summary) -> Summary {
    if state.months_elapsed >= loan.months || state.balance == 0 {
        state
    } else {
        amortize(loan, step(loan, state))
    }
}

fn simulate(loan: Loan) -> Summary {
    if loan.principal < 0 || loan.annual_bps < 0 || loan.annual_bps > 10000 || loan.payment < 0 || loan.extra < 0 || loan.months < 0 {
        new Summary { months_elapsed: 0, balance: 0, total_paid: 0, total_interest: 0, valid: false }
    } else {
        amortize(loan, new Summary {
            months_elapsed: 0,
            balance: loan.principal,
            total_paid: 0,
            total_interest: 0,
            valid: true
        })
    }
}

print(simulate(new Loan { principal: 30000000, annual_bps: 600, payment: 179865, extra: 0, months: 360 }));
