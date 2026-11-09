# wisp-2 participant evidence

## Scope and reasoning

Read only the authorized procedure, Wisp starter, public task/README/regressions,
historical Wisp source/artifact, and public `Docs/CLI.md`. No delegates, private
fixtures, implementation inspection, other attempts, network, dependencies,
Docker, branches, commits or pushes. Used full-source inspection, native Rust CLI
execution, and a self-authored Python subprocess/JSON harness. No graph/context
selection was needed. Scratch is `evaluation/work/maintenance-wisp-2/`.

The historical `added_slots` adds an erroneous extra pallet. Removing that extra
pallet in the current starter makes example 0 pass, but does not fix accounting
for already staged partial pallets. Correct incremental allocation is
`ceil((staged + request)/pack) - ceil(staged/pack)`. This also yields zero for a
zero-unit request. The second fault credits holds at equality even though the
deadline is expired. `credit_slots` now delegates to the existing strict
`hold_live`. Only `added_slots` and `credit_slots` brace-to-brace bodies changed;
signatures, records, sample bodies, probes, dashboard behavior and every byte
outside those bodies are unchanged. Existing `fits` and `decision` already
implement equality acceptance and rejection/free-after accounting correctly.

## Actual commands and observed outcomes

All paths/commands below are relative to the assigned repository worktree.
Reports were redirected into the scratch directory; semantic status was checked,
not inferred from process success alone.

1. `git status --short --untracked-files=no` before editing: no tracked changes.
2. `target/debug/wisp inspect evaluation/maintenance/historical/wisp-artifact.json`
   -> exit 0, Ready, validation `new_execution: true`, exact historical first
   failure reproduced. Archived input is `0`. Report: `inspect.json`.
3. `target/debug/wisp replay evaluation/maintenance/public/starter.wisp --artifact evaluation/maintenance/historical/wisp-artifact.json`
   -> exit 0, Pass, new execution on input `0`; historical validation Ready.
   Report: `starter-replay.json`.
4. `target/debug/wisp run evaluation/maintenance/public/starter.wisp`
   -> exit 1, Fail; first probe failed at input `1` after two cases; second probe
   cleared its three cases. Report: `starter-run.json`.
5. Copied starter to scratch `candidate.wisp`, then applied targeted patches to
   the two bodies described above. No supplied file was edited.
6. `target/debug/wisp check evaluation/work/maintenance-wisp-2/candidate.wisp`
   -> exit 0, Ready (metadata/checking only). Report: `candidate-check.json`.
7. `target/debug/wisp run evaluation/work/maintenance-wisp-2/candidate.wisp`
   -> exit 0, Complete; unchanged public probes Clear, completed 4 and 3 cases.
   Report: `candidate-run.json`.
8. `target/debug/wisp replay evaluation/work/maintenance-wisp-2/candidate.wisp --artifact evaluation/maintenance/historical/wisp-artifact.json`
   -> exit 0, Pass. Report: `candidate-replay.json`.
9. Used `printf` to write record arguments to scratch `args.json`, then
   `target/debug/wisp call evaluation/work/maintenance-wisp-2/candidate.wisp reserve --args-file evaluation/work/maintenance-wisp-2/args.json`
   -> Complete, Decision `(true,0,0)` for public example 1. Report:
   `call-example.json`.
10. `python3 evaluation/work/maintenance-wisp-2/check_cases.py`
    -> exit 0. This self-authored harness invokes the same native `call` command
    once per case, using a JSON argument file and a 10-second subprocess timeout.
    It requires exit 0, Complete and exact typed Decision equality. All 7 public
    JSON cases and 808 authored cases passed (815 total). Every field was checked.
    Authored cases cover pack sizes 1/2/4/100, staged offsets including empty,
    partial and full pallets, requests around pallet boundaries and zero,
    before/equal/after hold deadlines, spare/all-reserved capacity, 150 seeded
    valid-domain random snapshots (seed 20261109), and four maximum-scale cases.
    Expected values use independent additive integer ceiling arithmetic.
    Full case inputs/expected/actual outcomes: `typed-cases.json`;
    summary: `typed-summary.txt`.
11. The same harness compares compiler-provided body spans and hashes between
    starter and candidate, masks exactly the two allowed bodies, and asserts
    equality of all remaining bytes. Passed; changed bodies exactly
    `added_slots` and `credit_slots`.
12. Copied tested bytes using exclusive file creation into final
    `evaluation/maintenance/submissions/wisp-2/candidate.wisp`.
    Candidate SHA-256:
    `630c35d44df79c4b6b967ce31a1fddd62e14eb169a200d3f6f52c155a81eb9df`.
13. Python compared historical file bytes with the artifact's embedded source:
    exact equality. Historical source SHA-256:
    `ef743d12307b40ef4833852eca09c5ee1e7dedb89bd7d6bce00296081ca6a945`;
    historical artifact SHA-256:
    `b4d1f0697d745e528863c40ed6b3355c0c86c2bf16fd808e5eab779b77067a47`.
    `git diff --quiet --` the six allowed supplied public/history files returned
    0. Final `git status --short --untracked-files=no` showed no tracked changes.

## Interpretation and limitations

Inspect Ready here includes bounded reproduction, not just static checking and
not authentication of who created the artifact or when. Replay Pass is a new
execution of one old input, not historical retroactive success or full-domain
acceptance. The still-faulty starter itself demonstrates why that replay is
insufficient. Fresh probes and typed-call comparisons add finite evidence only;
they do not prove correctness on every valid input. No hidden grading was run,
and no grade or comparative performance conclusion is claimed. Repository-wide
build/test/lint and browser checks were not run because this isolated submission
changes only the permitted language fixture, not the implementation or docs.
No runtime benchmarking, token accounting, peak-context measurement, or verified
effective model/options telemetry was available: those measurements are null.
The exposed identity label is GPT-6.1 Sol, but effective serving settings were
not independently verified. Historical evidence and supplied contracts remain
unchanged; no contract edit was permitted by this trial.
