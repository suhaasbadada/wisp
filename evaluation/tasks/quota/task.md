# Reservation admission repair

Fix `can_reserve(usage, requested)` for a capacity reservation service. Preserve public types/signatures and existing specifications/tests. All inputs are signed 64-bit integers.

Return true **if and only if** used, reserved, limit and requested are all nonnegative and the mathematical sum `used + reserved + requested` is at most limit. Equality is allowed. Invalid counters must return false, not throw. Valid extreme inputs must return the decision without arithmetic overflow.

Customer reports: a reservation exactly filling capacity is refused, outstanding reservations are ignored, and some extreme counters fault. Explain the root cause, test invalid states and exact-capacity boundaries (including signed-i64 extrema), and report limitations honestly. The final implementation must keep `can_reserve(usage, requested)` callable.
