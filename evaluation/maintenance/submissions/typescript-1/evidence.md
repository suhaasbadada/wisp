# TypeScript-1 maintenance evidence

## Finding and change

Read only the permitted procedure, public TypeScript inputs and historical TypeScript source/snapshot, plus generated own scratch reports. No private implementation, grader, other attempt, source tree or parent conversation was inspected. No delegates, network, dependencies, Docker, branches, commits or pushes were used.

The historical `added_slots` added an unconditional extra pallet; reproducing its old input yielded `{accepted:false,added:2,free_after:1}`. The current starter removed that extra pallet and passed the same old input, but still rounded the request alone instead of accounting for staged pallet occupancy. Also, `credit_slots` used `>=` even though the hold expires at equality. The correct strict predicate already existed in `hold_live` but was not on the admission path.

Only two existing bodies changed in candidate.ts:

- `added_slots`: ceiling of staged plus requested units, minus existing staged slots.
- `credit_slots`: use `hold_live` to credit only strictly live holds.

All signatures, types, samples, dashboard behavior, outer whitespace and other bytes remain unchanged. Historical inputs were not modified.

## Actual commands and outcomes

Commands ran from the assigned worktree. Reports and self-authored tests are under `evaluation/work/maintenance-typescript-1/` (abbreviated SCRATCH below); the submission directory is `evaluation/maintenance/submissions/typescript-1/` (SUBMISSION below).

1. `node scripts/maintenance-tools.mjs --help`: exit 0, read public usage.
2. `git status --short -- evaluation/maintenance/public/starter.ts evaluation/maintenance/historical/historical.ts evaluation/maintenance/historical/typescript-snapshot.json evaluation/maintenance/submissions/typescript-1`: initially empty output.
3. `node scripts/maintenance-tools.mjs ts-context evaluation/maintenance/public/starter.ts sample_ok --budget 65536 > evaluation/work/maintenance-typescript-1/context.json`: exit 0. Inspected the generated context, including the reachable admission helpers. Metadata is not behavioral acceptance; full public source was also read.
4. `node scripts/maintenance-tools.mjs ts-replay evaluation/maintenance/public/starter.ts evaluation/maintenance/historical/typescript-snapshot.json > evaluation/work/maintenance-typescript-1/baseline-replay.json`: exit 0. Actual historical reproduction matched the saved failure, current old input passed with `(true,1,0)`.
5. `node scripts/maintenance-tools.mjs ts-public evaluation/maintenance/public/starter.ts > evaluation/work/maintenance-typescript-1/baseline-public.json`: exit 1 as expected; groups passed 2/4 and 3/3. Public cases 1 and 2 failed, despite the passing old replay.
6. Copied the starter into the new candidate and applied the two-body patch.
7. `node scripts/maintenance-tools.mjs ts-check evaluation/maintenance/submissions/typescript-1/candidate.ts`: exit 0, Ready from real strict compilation only. Saved as SCRATCH/candidate-check.json.
8. `node scripts/maintenance-tools.mjs ts-public evaluation/maintenance/submissions/typescript-1/candidate.ts`: exit 0, groups 4/4 and 3/3; all seven entire Decision records matched. Saved as SCRATCH/candidate-public.json.
9. `node scripts/maintenance-tools.mjs ts-replay evaluation/maintenance/submissions/typescript-1/candidate.ts evaluation/maintenance/historical/typescript-snapshot.json`: exit 0, archived failure reproduced again and candidate old input passed. Saved as SCRATCH/candidate-replay.json.
10. `node_modules/.bin/tsc --strict --target ES2022 --module commonjs --skipLibCheck --outDir evaluation/work/maintenance-typescript-1/compiled evaluation/maintenance/submissions/typescript-1/candidate.ts`: exit 0.
11. `cp evaluation/work/maintenance-typescript-1/compiled/candidate.js evaluation/work/maintenance-typescript-1/compiled/candidate.cjs` then `node evaluation/work/maintenance-typescript-1/self-test.cjs > evaluation/work/maintenance-typescript-1/self-test-result.json`: exit 0. TypeScript AST spans verified exactly the two intended body changes and byte-identical remaining source. 46,446 cases passed. Independent expected pallet occupancy was constructed by incrementing a BigInt pallet count until it held the unit total, rather than reusing ceiling division. Tests compare full Decision and the changed helpers across small valid depots, staged/request counts, all small reservations/hold credits, hold-before/equal/after deadlines, and selected maximum-size values. Node v24.10.0, TypeScript 5.9.3 were actually reported by this script.

12. Repeated the same scoped `git status --short` command: only the new typescript-1 submission directory was reported; the supplied starter and historical sources/snapshot were not reported changed. A Node JSON parse of decision.json succeeded and directory listing confirmed exactly candidate.ts, decision.json and evidence.md.

## Interpretation and limitations

Historical reproduction verifies that the archived failure can still be executed; replay verifies one current input. Neither is fresh acceptance. The old case has no staged units or nonzero hold credit and thus cannot expose either remaining starter defect. Compilation verifies typing, not those business rules. The seven fresh public cases and additional finite tests provide behavioral evidence, not proof over the full valid domain. No private grader was invoked or inspected, and no grade or comparative performance conclusion is asserted. No authenticated token/usage telemetry or runtime model-option verification was available; those measurements are null.
