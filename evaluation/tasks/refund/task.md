# Discounted return repair

Fix `refund(sale, returned)` for an invoice return. Preserve public types/signatures and existing specifications/tests. Sale fields are quantity (0–100), unit_cents (0–1,000,000) and discount_bps (0–10,000). Returned quantity is from -100 through 200.

- Refund zero for nonpositive returned quantity.
- Cap refunded quantity at the original sale quantity.
- Discount the **combined returned gross amount**, rounding down once to whole cents: `floor(count * unit_cents * (10000 - discount_bps) / 10000)`.
- Do not change `unit_net`: its separately useful contract is the rounded-down price of a single discounted unit.

Customer report: two returned units at 101 cents with a 50% discount refund 100 cents instead of 101. Explain the rounding error, exercise fractional and capped returns, and report limitations honestly. The final implementation must keep `refund(sale, returned)` callable and `unit_net` unchanged.
