# TypeScript quota trial evidence

Final submission: `evaluation/submissions/typescript/quota.ts`.

## Root cause and change

The starter checks a strict inequality, refusing exact-capacity requests. It omits outstanding reservations and validates only the requested value, permitting invalid negative counters. In this TypeScript starter the subtraction already uses arbitrary-precision BigInt; an arithmetic-overflow fault was not reproduced. The repaired body validates all four values as nonnegative and compares their BigInt sum with the limit inclusively. Public interfaces and every byte outside the existing function body remain unchanged; the original starter was not edited.

## Actual public checks

- Read only the assigned task brief, TypeScript starter and evaluation README as task inputs; no hidden cases or grader feedback used.
- `git status --short` before and after implementation showed untracked `evaluation/submissions/`, `evaluation/trials/`, and `evaluation/work/` directories. No unrelated files were inspected or changed.
- Ran `node_modules/.bin/tsc --strict --target ES2022 --module commonjs --outDir evaluation/work/typescript-quota/compiled evaluation/submissions/typescript/quota.ts && node evaluation/work/typescript-quota/check.cjs`. Compilation succeeded, but the first Node invocation failed: CommonJS output was interpreted as ES modules under the enclosing package scope (`ReferenceError: exports is not defined in ES module scope`).
- Added scratch-only `evaluation/work/typescript-quota/package.json` declaring CommonJS and reran that exact command. Exit 0; output: `PASS: body-only structure check and 2421 self-authored behavioral checks`.
- The self-authored check compares the untouched function prefix and trailing bytes against the original starter. Behavioral checks include 20 explicit cases and 2,401 combinations of signed-i64 minimum, -1, 0, 1, 2, maximum minus one and maximum, using a subtraction-based reference decision. Cases cover invalid counters, zero capacity, exact capacity, reserved-capacity rejection and sums beyond signed-i64 maximum without throwing.

## Limitations

These finite self-authored checks are not proof of correctness or held-out acceptance. No grader, full-project checks, performance measurements or telemetry collection were run. Inputs are assumed to obey the stated bigint/signed-i64 public contract; runtime values of other types are not validated. No imports or host actions occur in the submission. Scratch artifacts and tests remain under `evaluation/work/typescript-quota/`. No branches, worktrees, commits, network or Docker actions were created/performed.
