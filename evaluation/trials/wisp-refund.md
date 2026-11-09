# Wisp refund trial

## Finding and change

The original refund multiplies `count` by an already rounded single-unit price.
For 101 cents at 50%, `unit_net` correctly returns 50, but multiplying by two
loses the two half-cent fractions: 100 rather than 101 cents. The submitted
`refund` keeps the existing quantity clamp and multiplies count, unit cents and
discount factor before dividing by 10000 once. `unit_net` remains unchanged.
The stated nonnegative domain makes truncation toward zero equal floor; its
largest intermediate product is 1,000,000,000,000, within signed i64.

Final source: `evaluation/submissions/wisp/refund.wisp`.
Only the existing `refund` body is replaced. The guarded CLI edit reports
preservation, and a byte equality assertion checks exact original prefix and
suffix against the replacement. Original starter, signatures and probe were not
edited. No core, documentation, grader or existing tests were edited.

## Actual commands and results

- `git status --short`: before work, existing untracked evaluation submissions,
  trials and work directories were present; no sibling contents were inspected.
- `mkdir -p evaluation/work/wisp-refund`
- `target/debug/wisp check evaluation/tasks/refund/starter.wisp > evaluation/work/wisp-refund/baseline-check.json`
  — exit 0, Ready (checking only).
- `target/debug/wisp run evaluation/tasks/refund/starter.wisp > evaluation/work/wisp-refund/baseline-run.json`
  — exit 1, Fail at existing probe input 2.
- `python3 evaluation/work/wisp-refund/public_checks.py > evaluation/work/wisp-refund/public-checks.log 2>&1`
  — exit 0. This self-authored script invokes the documented CLI:
  - `edit` on the original starter, targeting `refund`, with
    `--replacement-file evaluation/work/wisp-refund/body.wisp`,
    `--expected-revision` from the baseline check, `--expected-body` from its
    refund metadata, and `--out evaluation/submissions/wisp/refund.wisp`:
    Ready, exit 0; no original-file mutation.
  - `check` on the final source: Ready, exit 0.
  - `run` on the final source: Complete, exit 0; unchanged probe Clear for
    all six declared inputs 0 through 5.
  - 16 `call` operations on final `refund` using integer-string JSON files
    under the scratch directory: all Complete, exit 0, matching a Python
    integer formula using combined gross before flooring. Cases include the
    customer example (101), odd fractional returns (151), capped 200-unit
    request against a five-unit sale (252), negative/zero returns, zero sale
    quantity, zero unit price, zero/full discounts, maximal sale price and
    quantity, and near-boundary discount factors. Exact inputs and results
    are in `public-checks.log` and the script.
  - One `call` to protected `unit_net`: Complete, exit 0, value 50.
- `target/debug/wisp call evaluation/tasks/refund/starter.wisp refund --args-file evaluation/work/wisp-refund/args-0.json > evaluation/work/wisp-refund/baseline-customer.json`
  — exit 0, Complete with value 100, reproducing the customer report.

Raw JSON reports, self-authored test script, argument files and output log are
in `evaluation/work/wisp-refund/`. Checks inspect semantic statuses and results,
not merely process exit codes.

## Limitations

These public, finite checks do not prove correctness over every valid input.
No held-out acceptance, grader, hidden feedback, full repository checks or
performance measurements were run. Inputs outside the task's declared ranges
are not covered by the repair contract. Only permitted task/public documents
were read; no delegates, network, Docker, commits or pushes were used.
Configured model/options were not changed. Verified usage telemetry and actual
harness model/settings metadata are unavailable (null); no timing, token or
comparative performance claims are made.
