fn remaining(stock: Int, sold: Int) -> Int { stock - sold }
fn available(stock: Int) -> Bool { remaining(stock, 3) >= 0 }
print("Inventory available:");
print(available(12));
probe stock in 3..=20 { available(stock) }
