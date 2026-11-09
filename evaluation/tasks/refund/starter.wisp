record Sale { quantity: Int, unit_cents: Int, discount_bps: Int }
fn unit_net(sale: Sale) -> Int { sale.unit_cents * (10000 - sale.discount_bps) / 10000 }
fn refund(sale: Sale, returned: Int) -> Int {
    let count = if returned <= 0 { 0 } else { if returned > sale.quantity { sale.quantity } else { returned } };
    unit_net(sale) * count
}
probe n in 0..=5 {
    refund(new Sale { quantity: 5, unit_cents: 101, discount_bps: 5000 }, n) == n * 101 * 5000 / 10000
}
