# wisp-1 maintenance evidence

## Finding and repair

The historical `added_slots` unconditionally added one pallet. Current starter removes that extra one, so empty staged units plus a four-unit request in a four-unit pack now needs exactly one pallet (historical input `0`). This is only one case: it exercises neither partial-pallet reuse nor a nonzero hold credit at the deadline.

Current `added_slots` still rounds the request independently, ignoring spare units in an already occupied partial pallet. Replaced its body with `ceil_slots(order.staged + order.request, depot.pack) - staged_slots(order, depot)`. This also gives zero added pallets for a zero request. Current `credit_slots` uses `>=`, crediting expired holds at equality; replaced its condition with the existing strict `hold_live(order, depot)`. Exact-fit acceptance, rejection accounting, and informational dashboard behavior were already consistent with the contract and remain unchanged.

Only these two existing bodies changed. A byte comparison constructed the expected source using exactly these two replacements and asserted exact equality with the candidate, including all signatures, samples, probes, whitespace outside bodies, and final newline. No supplied source or artifact was edited.

## Commands and observed outcomes

All commands were run from the assigned worktree. Output reports below live under `evaluation/work/maintenance-wisp-1/`.

- `target/debug/wisp --help`: displayed actual native CLI syntax.
- `target/debug/wisp inspect evaluation/maintenance/historical/wisp-artifact.json > evaluation/work/maintenance-wisp-1/inspect.json`: exit 0, Ready; validation explicitly reports new bounded execution reproducing the exact historical first failure. Ready here concerns artifact validation, not admission acceptance or authentication.
- `target/debug/wisp replay evaluation/maintenance/historical/historical.wisp --artifact evaluation/maintenance/historical/wisp-artifact.json > evaluation/work/maintenance-wisp-1/historical-replay.json`: exit 1, Fail, input `0`; artifact validation Ready.
- `target/debug/wisp replay evaluation/maintenance/public/starter.wisp --artifact evaluation/maintenance/historical/wisp-artifact.json > evaluation/work/maintenance-wisp-1/starter-replay.json`: exit 0, Pass, input `0`, new execution. This is the unrepaired current code, not the candidate.
- `target/debug/wisp run evaluation/maintenance/public/starter.wisp > evaluation/work/maintenance-wisp-1/starter-run.json`: exit 1, Fail. First probe failed at `1` after two completed cases; second probe Clear for its three cases. Thus replay of the old witness did not establish fresh acceptance.
- `target/debug/wisp check evaluation/maintenance/submissions/wisp-1/candidate.wisp > evaluation/work/maintenance-wisp-1/candidate-check.json`: exit 0, Ready, no diagnostics. Checking alone is not behavioral verification.
- `target/debug/wisp run evaluation/maintenance/submissions/wisp-1/candidate.wisp > evaluation/work/maintenance-wisp-1/candidate-run.json`: exit 0, Complete; both probes Clear, completed cases 4 and 3.
- `target/debug/wisp replay evaluation/maintenance/submissions/wisp-1/candidate.wisp --artifact evaluation/maintenance/historical/wisp-artifact.json > evaluation/work/maintenance-wisp-1/candidate-replay.json`: exit 0, Pass.
- Initial exploratory `wisp call ... sample_ok --args-file -` with `[0]` returned exit 1, `E_INPUT_TYPE`, expected Int: transport requires decimal strings, not JSON numbers. Read the relevant public `Docs/CLI.md` invocation section and retried with `["0"]`: exit 0, Complete, typed Bool true (`typed-smoke.json`). This was a transport mistake, not a candidate behavior failure.
- `python3 evaluation/work/maintenance-wisp-1/selfcheck.py`: passed 107 full typed Decision comparisons, comprising seven unchanged public JSON cases and 100 self-authored valid cases. The script invokes the actual `target/debug/wisp call ... reserve --args-file -` subprocess, requires exit 0 and Complete, and compares every result field. Own cases use deterministic seed 701, packs 1/2/4/99/100, capacities including 0 and 1,000,000, random valid occupancy/reservations/staging, zero and maximum requests, and deadlines before/equal/after now. Independent Python ceiling arithmetic computes expected added pallets and free capacity. Inputs/results are saved in `self-cases.json` and `self-results.json`.
- Python exact-byte replacement assertion passed. Historical source was also asserted equal to the source embedded in the supplied artifact. Scoped `git status --short -- evaluation/maintenance/submissions/wisp-1 evaluation/work/maintenance-wisp-1` showed only the new submission directory; scratch is ignored. No unrelated status or source was inspected.

## Identifiers and limitations

Actual reports identify compiler `wisp-0.1.0-semantics-5`.

- Historical source SHA-256: `ef743d12307b40ef4833852eca09c5ee1e7dedb89bd7d6bce00296081ca6a945`.
- Historical artifact SHA-256: `b4d1f0697d745e528863c40ed6b3355c0c86c2bf16fd808e5eab779b77067a47`.
- Candidate SHA-256: `630c35d44df79c4b6b967ce31a1fddd62e14eb169a200d3f6f52c155a81eb9df`.

Finite checks do not prove the specification for every valid input. No private grader, private fixtures, other attempts, implementation source, or TypeScript starter was consulted. No grading result, runtime comparison, token measurement, or language superiority is claimed. No repository-wide build/tests were run: source implementation was unchanged and verification used the existing actual native binary. Model usage/settings were not independently measured. This evidence is a participant report, not authenticated telemetry.
