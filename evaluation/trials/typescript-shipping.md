# TypeScript shipping trial

## Root cause and change

BigInt division in `slabs` truncates: `slabs(1n)` is zero, so a 1,001-gram package incorrectly has no additional charge. The submission adjusts the positive extra-weight argument by 499 grams before calling the unchanged helper, charging each commenced 500-gram slab. Zero-weight behavior and remote charges remain unchanged.

Final source: `evaluation/submissions/typescript/shipping.ts`. Exactly one expression inside the existing `quote` body changed; the self-authored byte comparison verifies all other bytes match the starter. No signatures, helper body, original files, core, specifications, or existing tests were edited.

## Actual commands and results

- `git status --short -- evaluation/submissions/typescript/shipping.ts evaluation/work/typescript-shipping evaluation/trials/typescript-shipping.md` initially produced no entries; target existence checks found no existing artifacts.
- `node_modules/.bin/tsc --version`: Version 5.9.3.
- `node --version`: v24.10.0.
- `node_modules/.bin/tsc --strict --target ES2022 --module commonjs --outDir evaluation/work/typescript-shipping/compiled evaluation/submissions/typescript/shipping.ts && node evaluation/work/typescript-shipping/check.cjs`: compilation succeeded, but the test invocation failed because emitted CommonJS `.js` was interpreted as ESM by the enclosing package. Error: `ReferenceError: exports is not defined in ES module scope`. No behavioral checks passed in that invocation.
- `node_modules/.bin/tsc --strict --target ES2022 --module ES2022 --outDir evaluation/work/typescript-shipping/compiled evaluation/submissions/typescript/shipping.ts && node evaluation/work/typescript-shipping/check.cjs`: succeeded. Output:

```text
Structure: only one expression inside quote body changed; all other bytes preserved.
Explicit boundaries and neighbors: 28 checks passed.
Self-authored domain sweep: 200002 quote checks passed; helper regression checks passed.
```

The explicit checks cover zero, minimum positive weight, 999/1,000/1,001/1,002, neighboring slab boundaries, and 99,999/100,000 grams, with both remote values. The finite sweep uses a separate stepwise tariff oracle over each integer weight from zero through 100,000 with both remote values. Three helper regression assertions also passed. Arithmetic for weights and tariffs uses BigInt.

## Limitations

Only the permitted task brief, starter, and evaluation README were read as project inputs. No held-out feedback, acceptance grader, sibling material, repository implementation, or original test suites were inspected or run. Checks are self-authored finite evidence, not a proof or independent acceptance result. Out-of-contract inputs were not validated. No grade, timing, language-performance, or usage claims are made. Verified runtime tooling versions are recorded above; verified runtime model/options and token telemetry are unavailable and recorded as null. No delegates, network, Docker, commits, pushes, or worktrees were used.
