record Usage { used: Int, reserved: Int, limit: Int }
fn can_reserve(usage: Usage, requested: Int) -> Bool {
    usage.used >= 0 && usage.reserved >= 0 && usage.limit >= 0 && requested >= 0
        && usage.used <= usage.limit
        && usage.reserved <= usage.limit - usage.used
        && requested <= usage.limit - usage.used - usage.reserved
}
probe n in 0..=20 {
    can_reserve(new Usage { used: 5, reserved: 5, limit: 20 }, n) == (n <= 10)
}
