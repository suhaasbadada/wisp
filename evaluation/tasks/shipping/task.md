# Shipping quote repair

Fix the shipping quote calculation in the supplied implementation. Do not change public signatures or existing specifications/tests. Inputs are a weight from 0 through 100,000 grams and a remote boolean.

- Zero weight ships for zero cents, including remote destinations.
- A positive package up to and including 1,000 grams costs 500 cents.
- Each **commenced** additional 500-gram slab costs 120 cents.
- Remote destinations add 175 cents to nonempty packages.

Customer report: a nonremote 1,001-gram package is incorrectly quoted as 500 cents; it should cost 620. Keep unrelated behavior and helpers unchanged where possible. The final implementation must be callable with the original `quote(weight, remote)` interface. Explain the root cause, test the boundary and neighboring inputs, and report limitations honestly.
