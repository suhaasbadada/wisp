# TypeScript-2 maintenance evidence

## Findings and repair

The historical `added_slots` adds an unconditional pallet. The archived input 0 therefore rejects with `(false,2,1)` instead of `(true,1,0)`. The current starter removed that unconditional addition, so the old input passes even before this repair. That input has no staged units and no credited hold, so it cannot expose either remaining defect.

The current `added_slots` rounds the request alone, ignoring available space on already staged partial pallets. I changed its body to `ceil_slots(staged + request, pack) - staged_slots(order, depot)`. This also yields zero added pallets for zero request. The current `credit_slots` uses `>=` at the expiry boundary. I changed its body to use the existing strict `hold_live` predicate. `fits` already accepts equality, and `decision` already preserves available capacity on rejection; neither needed editing. Dashboard capacity intentionally reserves one slot for display and was not used as admission authority.

Exactly these two parsed bodies changed. Signatures, types, sample functions, outer whitespace and all other starter bytes remain identical. Submitted functions remain pure BigInt arithmetic with no imports, host IO or dependencies. Public and historical files were not modified.

## Commands and actual outcomes

Commands ran from the assigned repository worktree. `T` below means `node scripts/maintenance-tools.mjs`; `S` means `evaluation/maintenance/public/starter.ts`; `C` means `evaluation/maintenance/submissions/typescript-2/candidate.ts`; `H` means `evaluation/maintenance/historical/typescript-snapshot.json`; `W` means `evaluation/work/maintenance-typescript-2`.

- `git status --short --` restricted to the starter, historical source/snapshot, this submission and this scratch directory: initially no output. No unrelated untracked work was inspected.
- `T --help`: public tool usage displayed successfully; implementation was not read.
- `T ts-context S sample_ok --budget 65536 > W/context.json`: checker-resolved call metadata, complete reachable bodies and full-source fallback obtained. No diagnostics or unresolved calls; `staged_slots`, `hold_live` and dashboard functions were outside the initial syntactic closure. Full supplied source was also read. Context is metadata, not behavioral acceptance or proof of completeness.
- `T ts-replay S H > W/baseline-replay.json`: archived failure reproduced as `(false,2,1)`; current unchanged starter returned `(true,1,0)`; `current_old_input_passed=true`.
- `T ts-public S > W/baseline-public.json`: failed (exit 1), groups 2/4 and 3/3; fresh examples 1 and 2 failed. The enclosing sequential shell command consequently exited 1. This directly shows that passing historical replay is not full acceptance.
- Copied the starter to the new candidate and patched only the two bodies. `file` reported ASCII text and `wc -c` reported 4118 bytes before patching.
- `node --version`: `v24.10.0`; `node_modules/.bin/tsc --version`: `5.9.3`.
- `T ts-check C > W/candidate-check.json`: `Ready`, strict compilation only, not execution.
- `T ts-public C > W/candidate-public.json`: passed, groups 4/4 and 3/3, comparing all Decision fields.
- `T ts-replay C H > W/candidate-replay.json`: historical failure reproduced again; candidate old-input replay passed with `(true,1,0)`.
- `node_modules/.bin/tsc --strict --target ES2022 --module commonjs --skipLibCheck --outDir W/compiled C && mv W/compiled/candidate.js W/compiled/candidate.cjs && node W/verify.mjs > W/verification.txt`: exit 0. Self-authored Node assertions passed 108856 valid-domain BigInt cases, helper results, full Decision records and seven unchanged `sample_ok` calls. The oracle computes unused staged-pallet space first, then rounds only the remaining request. Cases enumerate capacities 0..4, packs 1..5, all valid occupancy/reservation/staged combinations, requests 0..15, before/at/after expiry and varied hold credits; additional cases exercise maximum capacity, staged units, requests, pack 99/100 and expired large holds.
- The same verification script used the installed TypeScript parser to assert exactly `added_slots` and `credit_slots` bodies differ and to compare all bytes outside those bodies. It also compared historical source with the snapshot source and verified its saved SHA-256. All assertions passed.

## Limitations

These are public and self-authored finite checks, not hidden grading, a proof over all valid integers, a language-performance comparison or an exhaustive integration test. No private sources, other attempts, grading feedback, network, dependencies installation, Docker, new branches/worktrees, commits or pushes were used. Tool implementation was invoked but not inspected. Model usage/token telemetry was not measured or invented. Scratch scripts/reports live only under the assigned scratch directory; final submission consists only of candidate.ts, decision.json and evidence.md.
