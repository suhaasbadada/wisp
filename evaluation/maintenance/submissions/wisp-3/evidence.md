# Wisp-3 maintenance evidence

## Root cause and repair

I inspected the allowed full Wisp starter, task, README, public regressions,
historical source/artifact and public `Docs/CLI.md`. I did not use delegates,
private acceptance tools, implementation source, or grader feedback.

The historical `added_slots` charged `ceil(request/pack) + 1`. Historical sample
0 therefore rejected a four-unit order with one available four-unit pallet. The
current starter removed the extra one, fixing that input without accounting for
staged partial pallets. For example, public sample 1 needs no added pallet when
three requested units fill the pallet containing one staged unit. Independently,
`credit_slots` used `>=` rather than strict `>`, incorrectly crediting an expired
hold at its deadline (public sample 2).

The candidate changes exactly two existing parsed bodies:

* `added_slots`: ceiling pallets for staged plus request, minus staged pallets.
  This naturally allocates zero additional pallets for zero requests and reuses
  existing partial capacity.
* `credit_slots`: use existing `hold_live`, retaining only strictly live credit.

The existing free-capacity arithmetic, inclusive fit comparison, full Decision
construction and informational dashboard remain unchanged. No signatures,
records, sample functions, probes or bytes outside those bodies changed.

## Actual commands and observed outcomes

Commands ran from the assigned worktree with the existing `target/debug/wisp`.
All report paths below are under `evaluation/work/maintenance-wisp-3/`.

1. Scoped `git status --short --` for supplied source/history and this attempt's
   submission/scratch paths was clean before editing. `file` and `wc -c` reported
   an ASCII starter of 3,870 bytes. `target/debug/wisp --help` exited 0.
2. `target/debug/wisp replay evaluation/maintenance/historical/historical.wisp
   --artifact evaluation/maintenance/historical/wisp-artifact.json` exited 1:
   artifact validation Ready, exact historical first failure reproduced, replay
   input `0` Fail. Saved as `historical-replay.json`.
3. The same replay command with `evaluation/maintenance/public/starter.wisp`
   exited 0: artifact validation Ready, current input `0` Pass.
   Saved as `current-replay.json`. This was the unrepaired current source.
4. `target/debug/wisp run evaluation/maintenance/public/starter.wisp` exited 1:
   first probe failed at input `1` after two cases; second probe Clear after three
   cases. Saved as `baseline-run.json`. Thus the old replay demonstrably missed
   remaining public failures.
5. `target/debug/wisp call --help` printed usage and exited 2; I then read the
   allowed CLI documentation for typed file-argument transport. This invocation
   was not a behavioral test.
6. `target/debug/wisp check evaluation/maintenance/submissions/wisp-3/candidate.wisp`
   exited 0, Ready with no diagnostics (`candidate-check.json`). Checking alone
   is metadata, not acceptance.
7. `target/debug/wisp run evaluation/maintenance/submissions/wisp-3/candidate.wisp`
   exited 0, Complete: both unchanged probe groups Clear, respectively four and
   three completed cases, no diagnostics (`candidate-run.json`).
8. A typed `sample_ok` call with file arguments `["1"]` exited 0 with
   `{"type":"Bool","value":true}` (`sample-call.json`).
9. `python3 evaluation/work/maintenance-wisp-3/verify.py` succeeded. This
   self-authored harness invokes actual native `wisp call ... reserve
   --args-file ...` subprocesses with ten-second per-command timeouts. All 247
   calls exited 0 with Complete and exact typed Decision equality: seven cases
   read from the unchanged public regression JSON plus 240 deterministic cases
   generated with Python Random seed 303. The authored oracle uses divmod-based
   pallet counts, strict hold expiry, inclusive fit, and checks every result
   field. Cases include packs 1,2,3,4,99,100; capacities 0,1,2,10,1,000,000;
   zero/boundary/large requests; staged partial pallets; live/deadline/expired
   holds. Generated cases and individual reports are retained in scratch.
   The harness also replayed the candidate against the historical artifact
   (Pass), asserted the historical/current replay observations, and used native
   parsed body spans/hashes to compare all byte chunks outside the two changed
   bodies. That preservation assertion passed.
10. `shasum -a 256 -c evaluation/work/maintenance-wisp-3/history-before.sha256`
    reported OK for both historical source and artifact. Final scoped Git status
    showed only this attempt's new submission directory; supplied paths unchanged.

Candidate SHA-256:
`630c35d44df79c4b6b967ce31a1fddd62e14eb169a200d3f6f52c155a81eb9df`

Executed binary SHA-256:
`f5fdb4afaef554ca99a49a687c3464d366cc1855d0699d5ab94d32e4339263c3`

Native reports identify compiler `wisp-0.1.0-semantics-5`.

## Limits

Historical reproduction is bounded fresh execution, not authentication of an
author/time. Passing that one old input does not establish fresh acceptance.
Public and authored checks are finite and not exhaustive; they do not prove
correctness over the valid domain or evaluate other language capabilities.
No final grader, full repository test suite, performance comparison, network,
dependency install, Docker, commit, push or deployment was run. No usage/token
measurements were collected. Submission assertions and this log are self-reports.
