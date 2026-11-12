"""Independent iterative Decimal reference; illustrative, not financial advice."""
from decimal import Decimal, ROUND_DOWN, ROUND_HALF_UP


def simulate(loan, rounded=True):
    principal, rate, payment, extra, months = (
        int(loan[key]) for key in ("principal", "annual_bps", "payment", "extra", "months")
    )
    if min(principal, rate, payment, extra, months) < 0 or rate > 10000:
        return dict(months_elapsed=0, balance=0, total_paid=0, total_interest=0, valid=False)
    balance, paid_total, interest_total, elapsed = principal, 0, 0, 0
    for _ in range(months):
        if balance == 0:
            break
        interest = int((Decimal(balance) * rate / 120000).quantize(
            Decimal(1), rounding=ROUND_HALF_UP if rounded else ROUND_DOWN
        ))
        paid = min(payment + extra, balance + interest)
        balance += interest - paid
        paid_total += paid
        interest_total += interest
        elapsed += 1
    return dict(months_elapsed=elapsed, balance=balance, total_paid=paid_total,
                total_interest=interest_total, valid=True)
