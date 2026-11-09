# TypeScript refund trial

## Root cause and change

`unit_net` floors each unit before multiplication, losing fractional cents that should combine across returned units. For two 101-cent units discounted 50%, that yields 50 × 2 = 100 instead of floor(202 × 0.5) = 101. The submission preserves count clamping and divides only after multiplying the combined gross by the discount factor. BigInt division floors these nonnegative domain values. `unit_net` and all bytes outside the `refund` body remain unchanged.

Final submission: `evaluation/submissions/typescript/refund.ts`.

## Actual commands and results

- `git status --short --untracked-files=no`: no tracked changes before editing and after verification.
- `node_modules/.bin/tsc --version`: Version 5.9.3.
- `node_modules/.bin/tsc --strict --target ES2022 --module commonjs --outDir evaluation/work/typescript-refund/build evaluation/submissions/typescript/refund.ts && node evaluation/work/typescript-refund/check.cjs`: compilation passed initially, but Node failed with `ReferenceError: exports is not defined in ES module scope` because the enclosing package treats `.js` as ES modules. No behavioral checks completed in that attempt.
- Added scratch-only `evaluation/work/typescript-refund/build/package.json` with `{"type":"commonjs"}`; reran the identical compiler/test command successfully. Output: `PASS: exact single-body edit; 6 explicit assertions; 1500 finite refund cases and unit_net checks`.
- `git status --short -- evaluation/submissions/typescript/refund.ts evaluation/work/typescript-refund evaluation/trials/typescript-refund.md`: before adding this log, only the new submission and scratch directory were reported.

The self-authored test compares the entire submitted text against the starter with only the refund return expression replaced. Explicit checks cover the customer example, fractional odd returns, capped returns, nonpositive quantities and unchanged per-unit rounding. The finite grid covers zero and maximum quantities/prices, zero/full/fractional discounts, and negative/zero/in-range/excess returns; its alternative expected calculation subtracts a rounded-up discount from gross.

## Limitations

Only public requirements and self-authored checks were used. No hidden feedback or acceptance grader was accessed. Finite cases do not prove correctness for every input. Inputs outside the specified domain were not validated. No performance or comparative language claims are made. No telemetry or model settings were measured.
