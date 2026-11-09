// Warehouse admission: immutable snapshot records and pallet arithmetic.
record Depot { capacity: Int, occupied: Int, reserved: Int, pack: Int, now: Int }
record Order { staged: Int, request: Int, hold_slots: Int, hold_until: Int }
record Decision { accepted: Bool, added: Int, free_after: Int }

// Admission calculations consume a single depot snapshot.
fn ceil_slots(units: Int, pack: Int) -> Int { if units == 0 { 0 } else { (units - 1) / pack + 1 } }
fn staged_slots(order: Order, depot: Depot) -> Int { ceil_slots(order.staged, depot.pack) }
fn added_slots(order: Order, depot: Depot) -> Int { ceil_slots(order.request, depot.pack) }
fn hold_live(order: Order, depot: Depot) -> Bool { order.hold_until > depot.now }
fn credit_slots(order: Order, depot: Depot) -> Int { if order.hold_until >= depot.now { order.hold_slots } else { 0 } }
fn free_slots(order: Order, depot: Depot) -> Int { depot.capacity - depot.occupied - depot.reserved + credit_slots(order, depot) }
fn fits(needed: Int, available: Int) -> Bool { needed <= available }
fn decision(needed: Int, available: Int) -> Decision { if fits(needed, available) { new Decision { accepted: true, added: needed, free_after: available - needed } } else { new Decision { accepted: false, added: needed, free_after: available } } }
fn reserve(order: Order, depot: Depot) -> Decision { decision(added_slots(order, depot), free_slots(order, depot)) }

// Dashboard information deliberately keeps one unassigned pallet in reserve.
fn display_capacity(depot: Depot) -> Int { let unassigned = depot.capacity - depot.occupied - depot.reserved; if unassigned > 0 { unassigned - 1 } else { 0 } }
fn display_warning(order: Order, depot: Depot) -> Bool { staged_slots(order, depot) > display_capacity(depot) }

// Public regression examples; retain these unchanged.
fn sample_depot(n: Int) -> Depot { if n == 0 { new Depot { capacity: 1, occupied: 0, reserved: 0, pack: 4, now: 10 } } else { if n == 1 { new Depot { capacity: 1, occupied: 1, reserved: 0, pack: 4, now: 10 } } else { if n == 2 { new Depot { capacity: 2, occupied: 0, reserved: 2, pack: 4, now: 10 } } else { if n == 3 { new Depot { capacity: 2, occupied: 0, reserved: 2, pack: 4, now: 10 } } else { if n == 4 { new Depot { capacity: 2, occupied: 1, reserved: 0, pack: 4, now: 10 } } else { if n == 5 { new Depot { capacity: 2, occupied: 1, reserved: 0, pack: 4, now: 10 } } else { new Depot { capacity: 1, occupied: 1, reserved: 0, pack: 4, now: 10 } } } } } } } }
fn sample_order(n: Int) -> Order { if n == 0 { new Order { staged: 0, request: 4, hold_slots: 0, hold_until: 10 } } else { if n == 1 { new Order { staged: 1, request: 3, hold_slots: 0, hold_until: 10 } } else { if n == 2 { new Order { staged: 0, request: 1, hold_slots: 1, hold_until: 10 } } else { if n == 3 { new Order { staged: 0, request: 1, hold_slots: 1, hold_until: 11 } } else { if n == 4 { new Order { staged: 3, request: 2, hold_slots: 0, hold_until: 10 } } else { if n == 5 { new Order { staged: 4, request: 5, hold_slots: 0, hold_until: 10 } } else { new Order { staged: 1, request: 0, hold_slots: 0, hold_until: 10 } } } } } } } }
fn sample_expected(n: Int) -> Decision { if n == 0 { new Decision { accepted: true, added: 1, free_after: 0 } } else { if n == 1 { new Decision { accepted: true, added: 0, free_after: 0 } } else { if n == 2 { new Decision { accepted: false, added: 1, free_after: 0 } } else { if n == 3 { new Decision { accepted: true, added: 1, free_after: 0 } } else { if n == 4 { new Decision { accepted: true, added: 1, free_after: 0 } } else { if n == 5 { new Decision { accepted: false, added: 2, free_after: 1 } } else { new Decision { accepted: true, added: 0, free_after: 0 } } } } } } } }
fn sample_ok(n: Int) -> Bool { reserve(sample_order(n), sample_depot(n)) == sample_expected(n) }
probe n in 0..=3 { sample_ok(n) }
probe n in 4..=6 { sample_ok(n) }
