// Warehouse admission: immutable snapshot records and pallet arithmetic.
export interface Depot { readonly capacity: bigint; readonly occupied: bigint; readonly reserved: bigint; readonly pack: bigint; readonly now: bigint }
export interface Order { readonly staged: bigint; readonly request: bigint; readonly hold_slots: bigint; readonly hold_until: bigint }
export interface Decision { readonly accepted: boolean; readonly added: bigint; readonly free_after: bigint }

// Admission calculations consume a single depot snapshot.
export function ceil_slots(units: bigint, pack: bigint): bigint { return units == 0n ? (0n) : ((units - 1n) / pack + 1n); }
export function staged_slots(order: Order, depot: Depot): bigint { return ceil_slots(order.staged, depot.pack); }
export function added_slots(order: Order, depot: Depot): bigint { return ceil_slots(order.request, depot.pack); }
export function hold_live(order: Order, depot: Depot): boolean { return order.hold_until > depot.now; }
export function credit_slots(order: Order, depot: Depot): bigint { return order.hold_until >= depot.now ? (order.hold_slots) : (0n); }
export function free_slots(order: Order, depot: Depot): bigint { return depot.capacity - depot.occupied - depot.reserved + credit_slots(order, depot); }
export function fits(needed: bigint, available: bigint): boolean { return needed < available; }
export function decision(needed: bigint, available: bigint): Decision { return fits(needed, available) ? ({ accepted: true, added: needed, free_after: available - needed }) : ({ accepted: false, added: needed, free_after: available }); }
export function reserve(order: Order, depot: Depot): Decision { return decision(added_slots(order, depot), free_slots(order, depot)); }

// Dashboard information deliberately keeps one unassigned pallet in reserve.
export function display_capacity(depot: Depot): bigint { let unassigned = depot.capacity - depot.occupied - depot.reserved; return unassigned > 0n ? unassigned - 1n : 0n; }
export function display_warning(order: Order, depot: Depot): boolean { return staged_slots(order, depot) > display_capacity(depot); }

// Public regression examples; retain these unchanged.
export function sample_depot(n: bigint): Depot { return n === 0n ? ({ capacity: 1n, occupied: 0n, reserved: 0n, pack: 4n, now: 10n }) : n === 1n ? ({ capacity: 1n, occupied: 1n, reserved: 0n, pack: 4n, now: 10n }) : n === 2n ? ({ capacity: 2n, occupied: 0n, reserved: 2n, pack: 4n, now: 10n }) : n === 3n ? ({ capacity: 2n, occupied: 0n, reserved: 2n, pack: 4n, now: 10n }) : n === 4n ? ({ capacity: 2n, occupied: 1n, reserved: 0n, pack: 4n, now: 10n }) : n === 5n ? ({ capacity: 2n, occupied: 1n, reserved: 0n, pack: 4n, now: 10n }) : { capacity: 1n, occupied: 1n, reserved: 0n, pack: 4n, now: 10n }; }
export function sample_order(n: bigint): Order { return n === 0n ? ({ staged: 0n, request: 4n, hold_slots: 0n, hold_until: 10n }) : n === 1n ? ({ staged: 1n, request: 3n, hold_slots: 0n, hold_until: 10n }) : n === 2n ? ({ staged: 0n, request: 1n, hold_slots: 1n, hold_until: 10n }) : n === 3n ? ({ staged: 0n, request: 1n, hold_slots: 1n, hold_until: 11n }) : n === 4n ? ({ staged: 3n, request: 2n, hold_slots: 0n, hold_until: 10n }) : n === 5n ? ({ staged: 4n, request: 5n, hold_slots: 0n, hold_until: 10n }) : { staged: 1n, request: 0n, hold_slots: 0n, hold_until: 10n }; }
export function sample_expected(n: bigint): Decision { return n === 0n ? ({ accepted: true, added: 1n, free_after: 0n }) : n === 1n ? ({ accepted: true, added: 0n, free_after: 0n }) : n === 2n ? ({ accepted: false, added: 1n, free_after: 0n }) : n === 3n ? ({ accepted: true, added: 1n, free_after: 0n }) : n === 4n ? ({ accepted: true, added: 1n, free_after: 0n }) : n === 5n ? ({ accepted: false, added: 2n, free_after: 1n }) : { accepted: true, added: 0n, free_after: 0n }; }
export function sample_ok(n: bigint): boolean { const actual = reserve(sample_order(n), sample_depot(n)); const expected = sample_expected(n); return actual.accepted === expected.accepted && actual.added === expected.added && actual.free_after === expected.free_after; }
