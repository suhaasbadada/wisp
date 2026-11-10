record PriceInput { quantity: Int, unit_cents: Int, member: Bool }
record Quote { accepted: Bool, subtotal_cents: Int, total_cents: Int, reason: String }

fn decide(input: PriceInput) -> Quote {
    if input.quantity <= 0 {
        new Quote { accepted: false, subtotal_cents: 0, total_cents: 0, reason: "invalid_quantity" }
    } else {
        if input.unit_cents <= 0 {
            new Quote { accepted: false, subtotal_cents: 0, total_cents: 0, reason: "invalid_price" }
        } else {
            let subtotal = input.quantity * input.unit_cents;
            let discount = if input.member && input.quantity >= 10 { subtotal / 20 } else { 0 };
            new Quote { accepted: true, subtotal_cents: subtotal, total_cents: subtotal - discount, reason: "quoted" }
        }
    }
}
