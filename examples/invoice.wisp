record Item { quantity: Int, unit_price: Int }
record Invoice { item: Item, customer: String }

fn total(item: Item) -> Int { item.quantity * item.unit_price }
fn invoice(quantity: Int) -> Invoice {
    new Invoice {
        customer: "Ada",
        item: new Item { quantity: quantity, unit_price: 100 }
    }
}

print(invoice(9));
print(total(invoice(9).item));
probe quantity in 0..=20 {
    total(invoice(quantity + 1).item) >= total(invoice(quantity).item)
}
