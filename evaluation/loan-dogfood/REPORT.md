# Wisp language dogfood: loan repayment calculator

## Follow-up: runtime repair (historical local checkpoint)

This checkpoint predates the semantics-6 deployment in PR #54. The subsequent
semantics-7 list implementation is tracked separately; claims below about absent
collections describe the original experiment and runtime-repair checkpoint.

The original experiment below is retained as historical evidence of semantics-5.
A semantics-6 runtime repair now lets the **unchanged ordinary Wisp algorithm**
complete all 360 months: balance 144, total paid 64751400, total interest 34751544
(all cents), matching the Python Decimal reference. It used 41,600 fuel and
878,706 cumulative logical allocation units under the unchanged 100,000 / 1,048,576
ceilings. Proper tail-call frame reuse, noncopying block entry and selected-only
projection copies address the measured causes rather than increasing limits.

The alternate balanced algorithm still exceeds the allocation ceiling; collections
and decimal types remain absent. This repair establishes completion of the
motivating task, not superiority to Python or general-purpose readiness.
See ADR 0034 and `tests/loan_dogfood.rs`. Full verification/release status is
reported separately; the original no-product-change statement below applies
only to the initial trial, not this follow-up runtime work.

Bob implemented the runtime changes and focused tests. Joffrey independently
reviewed the runtime and those tests read-only with no substantive findings;
that review did not execute checks or verify release/compatibility updates.

Final local verification passed 190 Rust tests, strict Clippy/fmt, install,
WASM/TypeScript/static builds, evaluation/maintenance/workflow tests, 330
native/WASM comparisons (including the 360-month result), and 177 isolated
Chromium tests. `npm test` itself stopped at an occupied default browser port;
the isolated full-browser replacement passed without using/stopping the existing
process. A stale runnable example compiler pin was refreshed from fresh metadata;
historical fixtures were not rewritten. Final independent-reference evidence is
in `wisp-loan-nf6njjbr` under the external harness artifact directory. Nothing is
committed or deployed; see `Docs/Testing.md` for the exact verification scope.

## Original experiment verdict (semantics-5, before repair)

**Wisp executes a real composed numerical program, but I would choose Python for
this calculator today.** Its safe, inspectable maintenance tools worked; its
current bounded execution model prevented both attempted Wisp implementations
from completing an ordinary 360-month calculation. This is a language-use
experiment, not a product feature, adoption study or financial recommendation.

## Task and implementation

The 60-line `loan.wisp` models monthly interest, scheduled and extra payments,
early payoff without overpayment, remaining balance, cumulative interest and
cumulative payments. It uses two immutable nominal records, five functions,
integer-cent arithmetic, branching and recursive state transitions. No
calculation is delegated to Python by the Wisp program.

This is an illustrative newly written program, not an actual lender's policy or
a real user's loan. We used 1,000.00 principal, 12% nominal annual interest and
90.00 monthly payments for the short example. The long example uses 300,000.00,
6% and 1,798.65 for 360 months. Currencies are unspecified; all amounts are cents.
Dates, fees, changing rates, taxes and contractual rounding rules are excluded.
`valid` only reflects this program's simple input checks, not financial validity,
affordability or approval. Very large accepted integers can still overflow i64.

## What actually ran

Built the native Rust binary with `cargo build --quiet`; compiler reports
`wisp-0.1.0-semantics-5`. No language implementation, budgets or dependencies
were changed. Ran:

```sh
python3 -B evaluation/loan-dogfood/experiment.py
```

The experiment saves exact sources, requests, responses, errors and a summary to
a fresh external `wisp-loan-*` directory and prints its location. The recorded
run for this report is `wisp-loan-uyx9ia97` under the harness's approved temporary
artifact directory. Re-running creates new evidence rather than overwriting it.

1. Focused the `interest` function using the real CLI.
2. Used revision/body-hash-guarded `wisp edit` to change flooring to half-up
   monthly rounding. Independently checked exact outside-body byte preservation.
3. Attempted a stale-revision edit: rejected with Error; no candidate file created.
4. Reviewed baseline/candidate on 12 explicitly constructed cases: **Pass; five
   Changed, seven Unchanged**. Pass means the candidate met these finite expected
   results, not that its semantics are universally correct.
5. Called the candidate separately on all 12 cases; every call completed and
   matched an independent iterative Python `Decimal` reference. Also compared
   the baseline's outputs with the reference's floor-rounding mode and checked
   accounting identities on the reference.
6. Tried a 360-month schedule and a second, balanced-recursion Wisp algorithm.

Cases covered one-year repayment, extra principal, early payoff, zero interest,
zero principal, zero term, negative amortization, below/exactly/above half-cent
rounding, negative principal and an out-of-range interest rate. These are authored
test data, not production traffic or an exhaustive input domain.

## Results

| Task | Wisp | Python reference |
|---|---|---|
| Twelve short cases, new rounding | All Complete, exact agreement | Completed |
| Straightforward month-by-month recursion | 28 months completed; 29 yielded Unknown | Iterative algorithm has no month-deep call stack |
| 360 months, straightforward Wisp algorithm | Unknown: `E_LIMIT_EVALUATION_DEPTH` | Completed |
| 360 months, balanced recursion | Unknown: `E_LIMIT_ALLOCATION` | Completed |

The 28/29 threshold is specific to this program and its default budgets, not a
universal maximum for Wisp. Balanced recursion is a genuine alternative Wisp
algorithm, not host-side iteration; it preserved all 12 short-case results. Its
360-month call consumed 30,021 logical fuel units and reported 1,048,676 cumulative
logical allocation units at interruption against a 1,048,576 ceiling. Those units
are **not measured heap bytes, elapsed time or process memory**. No partial
calculation was represented as success. Other implementations could behave
differently; we have not proved this task impossible in Wisp.

The Python 360-month result was 647,514.00 paid, 347,515.44 interest and 1.44
remaining. A rounded fixed payment need not clear every cent at the final term.
No timing benchmark or performance advantage is claimed.

### A concrete maintenance consequence

| Case | Old interest (floor) | New interest (half-up) |
|---|---:|---:|
| One-year loan | 65.34 | 65.41 |
| Extra 20.00/month; payoff in month 10 | 53.73 | 53.78 |
| Underpayment / growing balance | 123.37 | 123.41 |

The rounding change was deliberate, not a newly discovered production defect.
Wisp made its downstream effects explicit and reproducible; ordinary Python
assertions can detect those same differences, but require their own comparison
reporting and source-edit guard tooling.

## Friction observed

- No loops or tail-call elimination: a natural stateful numerical algorithm
  becomes recursion, and linear recursion hits evaluation depth quickly here.
- Balanced recursion avoids that stack shape but adds code and still reaches the
  fixed cumulative logical-allocation budget for the long calculation.
- No collections: the language cannot directly return a variable-length monthly
  schedule; this program returns aggregate totals instead. We did not fake a
  schedule using fixed record slots or move its algorithm into the host.
- Full immutable record reconstruction makes each state update verbose.
- No decimal type: cents and an explicit rounding function are necessary. This
  is workable for the simplified model, but not a complete finance numeric model.
- No language file/network IO: a host wrapper is needed to feed real data and
  publish results. That is an intentional sandbox boundary, not something to
  remove merely for convenience.
- Explicit Unknown and stable limit diagnostics are useful: Wisp failed clearly
  rather than returning misleading totals. They do not make an unfinished job useful.

## What this tells us

The strongest observed asset is the **change workflow**: typed inputs/results,
native function metadata, guarded function-body edits, exact source preservation
and structured before/after evidence. The experiment does **not** establish that
these benefits require a new language, beat tools for existing languages or
justify asking users to switch.

For a small bounded embedded calculation Wisp may be useful. For this broader
calculator Python required less algorithmic scaffolding and completed the task
that both attempted Wisp versions could not. Do not add more workbench polish as
a substitute for resolving that mismatch. Before broadening the language, choose
whether Wisp is intentionally a small embedded language or wants to serve larger
programs; iteration/collections and the resource model would need design work,
not merely larger magic budget constants. No such changes are made in this trial.

## Scope and verification

Only the new `evaluation/loan-dogfood/` experiment files were added to the assigned
worktree. Existing paused changes were preserved. No commits, pushes, merges,
deployment, UI changes, real financial actions or adoption claims. Native build,
the reproducible experiment and `git diff --check` passed. Full repository CI,
browser checks and independent review were not run for this isolated experiment.
