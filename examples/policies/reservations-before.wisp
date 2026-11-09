record Order { quantity: Int, pack_size: Int, expires_at: Int }
record Depot { available: Int, now: Int }
record Decision { accepted: Bool, packs: Int, reason: String }

fn decide(order: Order, depot: Depot) -> Decision {
    if order.quantity <= 0 {
        new Decision { accepted: false, packs: 0, reason: "invalid_quantity" }
    } else {
        if order.pack_size <= 0 {
            new Decision { accepted: false, packs: 0, reason: "invalid_pack" }
        } else {
            if order.expires_at < depot.now {
                new Decision { accepted: false, packs: 0, reason: "expired" }
            } else {
                if order.quantity > depot.available {
                    new Decision { accepted: false, packs: 0, reason: "insufficient" }
                } else {
                    new Decision { accepted: true, packs: order.quantity / order.pack_size, reason: "reserved" }
                }
            }
        }
    }
}
