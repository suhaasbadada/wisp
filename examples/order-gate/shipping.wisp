record ShippingInput { total_cents: Int, zone: String }
record Delivery { accepted: Bool, fee_cents: Int, grand_total_cents: Int, reason: String }

fn decide(input: ShippingInput) -> Delivery {
    if input.total_cents < 0 {
        new Delivery { accepted: false, fee_cents: 0, grand_total_cents: 0, reason: "invalid_total" }
    } else {
        if input.zone == "local" {
            let fee = if input.total_cents >= 1000 { 0 } else { 100 };
            new Delivery { accepted: true, fee_cents: fee, grand_total_cents: input.total_cents + fee, reason: "local" }
        } else {
            if input.zone == "remote" {
                new Delivery { accepted: true, fee_cents: 500, grand_total_cents: input.total_cents + 500, reason: "remote" }
            } else {
                new Delivery { accepted: false, fee_cents: 0, grand_total_cents: 0, reason: "unsupported_zone" }
            }
        }
    }
}
