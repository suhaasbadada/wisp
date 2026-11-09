# Reservation policy change

The independent order/depot records and explicit typed Decision expectations
exercise exact packing, partial-pack rounding, expiry equality, already expired,
insufficient stock, zero quantity and zero pack size. The candidate fixes ceiling
packing and expiry equality; two cases change, five remain unchanged.

Run the commands in `Docs/CLI.md`. To see a deliberate mismatch, change
`partial-pack`'s expected packs from `"3"` to `"2"` in a copy of the suite;
review returns Fail while still showing the observed Changed result. Tests also
exercise a baseline divide-by-zero repaired by a candidate and output-only changes.
These seven examples do not establish policy correctness or authorize deployment.
