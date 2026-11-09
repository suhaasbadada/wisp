# TypeScript-3 maintenance evidence

## Scope and diagnosis

Read only the procedure, public task/README/starter/regressions and TypeScript historical source/snapshot. Did not inspect tool implementation, private fixtures, grader, other attempts or application source. Used no delegates, dependencies, network, Docker, branches or commits. The scratch test is `evaluation/work/maintenance-typescript-3/verify.mjs`.

The archived `added_slots` added an unconditional extra pallet. Historical input 0 therefore rejected a four-unit order despite one free four-unit pallet. The current starter had removed that extra pallet and already passed the old input, but still calculated pallets for the request independently of staged units. That misses reuse of an existing partial pallet. Separately, `credit_slots` used `>=` at expiry even though `hold_live` correctly used `>`.

Exactly two existing bodies changed:

- `added_slots`: `ceil_slots(staged + request, pack) - staged_slots(order, depot)`. This measures only the increase in pallets, including zero increase for zero request or filling an existing partial pallet.
- `credit_slots`: delegate liveness to the existing strict `hold_live` predicate.

The existing equality-accepting `fits`, rejection accounting and dashboard display reserve were not changed. All arithmetic in submitted code remains BigInt. No imports, host actions or dependencies were added to the candidate.

## Commands actually run and observations

Commands were run from the assigned worktree root:

1. `git status --short -- evaluation/maintenance/public/starter.ts evaluation/maintenance/historical/historical.ts evaluation/maintenance/historical/typescript-snapshot.json evaluation/maintenance/submissions/typescript-3 evaluation/work/maintenance-typescript-3`
   - Initially no output for these scoped paths. Other work was not inspected.
2. `node scripts/maintenance-tools.mjs --help`
   - Confirmed public command interface; no implementation inspection.
3. `node scripts/maintenance-tools.mjs ts-replay evaluation/maintenance/public/starter.ts evaluation/maintenance/historical/typescript-snapshot.json`
   - Historical reproduction completed: `(false,2,1)`.
   - Current starter replay completed: `(true,1,0)`; `current_old_input_passed: true`.
4. `node scripts/maintenance-tools.mjs ts-public evaluation/maintenance/public/starter.ts`
   - Failed as expected: group 0..3 passed 2/4; group 4..6 passed 3/3. Cases 1 and 2 failed. This combined initial shell invocation exited 1 because this final command failed.
5. `node scripts/maintenance-tools.mjs ts-check evaluation/maintenance/submissions/typescript-3/candidate.ts`
   - `Ready`: real strict compilation passed. This command does not initialize or execute candidate functions and is not behavioral acceptance.
6. `node scripts/maintenance-tools.mjs ts-public evaluation/maintenance/submissions/typescript-3/candidate.ts`
   - Passed 4/4 and 3/3; all seven whole Decision records matched.
7. `node scripts/maintenance-tools.mjs ts-replay evaluation/maintenance/submissions/typescript-3/candidate.ts evaluation/maintenance/historical/typescript-snapshot.json`
   - Historical failure reproduced again as `(false,2,1)`; candidate returned `(true,1,0)`; old-input pass true.
8. `node evaluation/work/maintenance-typescript-3/verify.mjs`
   - Passed 710184 self-authored Decision/helper checks. Compared complete Decision objects and `added_slots`/`credit_slots` against a BigInt oracle that counts pallets by repeatedly filling them, independently of the submitted ceiling formula.
   - Small-domain enumeration: capacity 0..5; every legal occupied/reserved combination; pack 1..5; every staged value through occupied*pack; request 0..12; now 0..2; deadline 0..4. Live hold slots range 0..reserved; expired hold slots range 0..3.
   - Additional boundary combinations: capacity 1000000; pack 1,3,99,100; occupied 0,1,500000,1000000; staged zero/full/one-below-full; request 0,1,999999,1000000; deadlines 999999 and 1000000 around now 999999. Repeated inputs are included in the check count.
   - TypeScript parser verified changed bodies exactly `added_slots` and `credit_slots`; every byte outside those bodies, including all signatures, samples and outer whitespace, matched the starter. Historical source matched snapshot source and recorded SHA-256.
   - Scratch execution used TypeScript CommonJS transpilation and Node after the separate real strict check. The final verification shell exited 0.

9. Repeated the scoped `git status --short -- ...` command from step 1 after writing the submission, then parsed `decision.json` with `node -e` and checked its historical input and replay-acceptance flag.
   - Status showed only the new `evaluation/maintenance/submissions/typescript-3/` directory for those scopes; supplied starter/history had no modifications. Scratch is ignored. Decision JSON parsed successfully; shell exited 0.

## Interpretation and limitations

The historical snapshot is evidence of an earlier defect, not fresh acceptance. Replaying the old input exercises neither partial-pallet reuse nor nonzero expired-hold credit, so it cannot establish either repair. The unrepaired starter's observed fresh failures demonstrate this distinction directly.

The public suite and self-authored checks provide finite behavioral evidence, not a proof over the full valid input domain. The larger-value checks remain within the specification and were not runtime benchmarks. No private grading or comparative language/performance claims were made. Compiler context metadata was not requested because the complete small permitted source was directly available. No usage, latency or model telemetry was inferred.
