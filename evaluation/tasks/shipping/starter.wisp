fn slabs(extra: Int) -> Int { extra / 500 }
fn quote(weight: Int, remote: Bool) -> Int {
    if weight == 0 { 0 } else {
        let extra = if weight > 1000 { slabs(weight - 1000) * 120 } else { 0 };
        500 + extra + if remote { 175 } else { 0 }
    }
}
probe n in 990..=1020 {
    quote(n, false) == if n <= 1000 { 500 } else { 500 + ((n - 1001) / 500 + 1) * 120 }
}
probe n in 0..=20 { quote(n, true) == if n == 0 { 0 } else { quote(n, false) + 175 } }
