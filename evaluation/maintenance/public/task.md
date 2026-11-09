# Admission specification

Maintain warehouse pallet admission from immutable snapshots. All values are
integers (Wisp signed i64, TypeScript BigInt); all specified arithmetic fits i64.

* `Depot { capacity, occupied, reserved, pack, now }`: capacity is in 0..1,000,000;
  occupied is in 0..capacity; reserved is in 0..capacity-occupied; pack is in
  1..100; now is in 0..1,000,000. Capacity/occupied/reserved count pallets;
  pack is the number of units per pallet.
* `Order { staged, request, hold_slots, hold_until }`: staged units are in
  0..occupied*pack; request, hold_slots and hold_until are in 0..1,000,000.
  A hold is live **strictly when hold_until > now**. If live, hold_slots is no
  greater than reserved. At the deadline itself the hold is expired.
* `Decision { accepted: Bool, added: Int, free_after: Int }` is the entire
  observable admission result, not merely its accepted flag.

The order's already staged units occupy the minimum number of full-or-partial
pallets capable of holding those units (zero if empty). After the requested units
join those units, **added** is the extra number of pallets needed beyond those
already occupied by staged units. Existing partial pallets can be filled first.
A zero-unit request allocates no extra pallets.

Free capacity before admission excludes occupied pallets and all reservations,
but credits this order's hold_slots back when its hold is live. Accept exactly
when added is at most that free capacity: exact equality is accepted. On
acceptance free_after is free capacity minus added. On rejection free_after is
unchanged free capacity, and added still describes the requested extra pallets.
Dashboard display functions are informational, not admission authority. Their
intentional one-slot display reserve is not part of this admission rule.

## Public examples

Tuple order: Depot `(capacity,occupied,reserved,pack,now)`, Order
`(staged,request,hold_slots,hold_until)`, Decision `(accepted,added,free_after)`.

| n | Depot | Order | Decision |
|---|---|---|---|
| 0 | (1,0,0,4,10) | (0,4,0,10) | (true,1,0) |
| 1 | (1,1,0,4,10) | (1,3,0,10) | (true,0,0) |
| 2 | (2,0,2,4,10) | (0,1,1,10) | (false,1,0) |
| 3 | (2,0,2,4,10) | (0,1,1,11) | (true,1,0) |
| 4 | (2,1,0,4,10) | (3,2,0,10) | (true,1,0) |
| 5 | (2,1,0,4,10) | (4,5,0,10) | (false,2,1) |
| 6 | (1,1,0,4,10) | (1,0,0,10) | (true,0,0) |

The Wisp probes group examples 0..3 and 4..6. TypeScript's separate public
regression JSON uses the same groups and full Decision expectations. Preserve
all sample functions and public data unchanged. The examples are not exhaustive.

## Repair and explanation requirements

Repair the current starter, **not the historical source**. Modify the parsed
brace-to-brace bodies of at most two existing non-sample functions (at least one
body must change). Keep every other byte, signature, record/interface type,
sample function, comment outside those bodies, and probe unchanged. Do not add
imports, dependencies or host IO. Do not overwrite the historical evidence.
Any one/two-function solution satisfying these constraints and the specification
is eligible; there is no mandated target-function list or tool sequence.

Explain your historical reproduction, replay against current code, why checking
only the old input is insufficient, the fresh checks you actually performed,
and remaining limitations. Distinguish metadata/checking, historical
reproduction, current single-input replay and fresh finite acceptance. Your
explanation is self-reported reasoning, not proof of tool execution, correctness
over all valid inputs, or comparative language usefulness.
