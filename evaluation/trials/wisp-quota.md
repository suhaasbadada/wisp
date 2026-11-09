# Wisp quota trial evidence

## Submission and root cause

Final source: `evaluation/submissions/wisp/quota.wisp`.
Only the existing `can_reserve` body changed. The self-authored driver asserts
exact byte preservation of the original prefix and suffix, retaining the record,
signature, probe, and all whitespace outside the body. Original starter untouched.

The original uses strict `<`, refusing equality when no reservations are present;
it omits `reserved`, admitting excess usage; and it validates only `requested`,
allowing invalid counters and evaluating an overflowing `limit - used`.
Observed public-CLI examples (tuple order: used, reserved, limit, requested):

- `(5, 0, 20, 15)` returned false despite exact capacity.
- `(5, 5, 20, 11)` returned true despite exceeding capacity.
- `(0, -1, 10, 0)` returned true despite an invalid counter.
- `(i64::MIN, 0, i64::MAX, 0)` returned Error/exit 1 with
  `E_INT_OVERFLOW` rather than false.

The replacement first rejects all negative fields and requests. Short-circuit
guards check `used <= limit` and `reserved <= limit - used` before comparing
`requested <= limit - used - reserved`. Each executed subtraction therefore has
nonnegative operands ordered to yield a nonnegative result within i64. It never
forms the potentially overflowing mathematical sum, and permits equality.

## Actual commands and observations

1. `git status --short -- evaluation/tasks/quota/starter.wisp evaluation/submissions/wisp/quota.wisp evaluation/work/wisp-quota evaluation/trials/wisp-quota.md`
   emitted no entries before changes.
2. `mkdir -p evaluation/work/wisp-quota`
3. `target/debug/wisp check evaluation/tasks/quota/starter.wisp > evaluation/work/wisp-quota/baseline-check.json`
   exited 0, Ready.
4. `target/debug/wisp run evaluation/tasks/quota/starter.wisp > evaluation/work/wisp-quota/baseline-run.json`
   exited 1, Fail; original probe first failed at 11 after 12 completed cases.
5. `python3 evaluation/work/wisp-quota/public_checks.py` exited 0. This driver:
   - Calls the original function for six diagnostic examples using
     `target/debug/wisp call FILE can_reserve --args-file -` with stdin JSON.
   - Exclusively creates the final source with only its function body replaced.
   - Runs `target/debug/wisp check evaluation/submissions/wisp/quota.wisp`:
     exit 0, Ready.
   - Runs `target/debug/wisp run evaluation/submissions/wisp/quota.wisp`:
     exit 0, Complete; original probe Clear over 21 cases.
   - Executes 3,685 distinct self-authored typed calls with canonical decimal
     integer strings. All returned Complete/exit 0 and the expected Bool; no
     failures. Expected results use Python arbitrary-precision mathematical sums.
     Cases combine a full small grid `{-2,-1,0,1,2,3}^4`, an extrema grid
     `{MIN,MIN+1,-1,0,1,MAX-1,MAX}^4`, and exact-capacity neighbors at limits
     0, 1, 2, 20, MAX-1, MAX. This includes negative values in every position,
     used/reserved exceeding limit, exact fits, zero requests, one-over limits,
     and mathematical sums exceeding i64::MAX.
6. A Python JSON-summary command inspected only the scratch baseline call/run
   and final run reports, confirming the observations above.

Driver and raw reports are under `evaluation/work/wisp-quota/`, including
`baseline-calls.json`, `final-check.json`, `final-run.json`,
`public-calls.json`, and `summary.json`.

## Limitations

These are finite public checks, not a proof or held-out acceptance result.
No hidden feedback, grader, repository implementation/tests, other task,
network, Docker, delegate, or core build was used. The existing debug CLI was
used as supplied. No performance comparison or grade is claimed. Model/options
were not overridden; verified runtime model/settings and token-usage telemetry
are not exposed to this trial (null), and none were inferred.
