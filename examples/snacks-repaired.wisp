fn bill(snacks: Int) -> Int {
    if snacks >= 10 { 900 + (snacks - 9) * 80 } else { snacks * 100 }
}
print(bill(9));
probe n in 1..=11 { bill(n + 1) >= bill(n) }
