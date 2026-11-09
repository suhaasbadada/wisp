record Usage { used: Int, reserved: Int, limit: Int }
fn can_reserve(usage: Usage, requested: Int) -> Bool {
    requested >= 0 && requested < usage.limit - usage.used
}
probe n in 0..=20 {
    can_reserve(new Usage { used: 5, reserved: 5, limit: 20 }, n) == (n <= 10)
}
