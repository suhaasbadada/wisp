# ADR 0028: Real-SDK failure and reconnect regressions

Status: accepted; shipped via PR #28 at
`06509366b21a6d9bc256a8f4962dd6d6f6c016ad`. Exact-head Linux CI, actual five-report
SDK artifacts, immutable hash-locked release checks and published contracts are
[accepted](https://github.com/suhaasbadada/wisp/pull/28#issuecomment-6764622743).

Required SDK checks covered source Error/Unknown and saved-project Pass, but
saved-suite failures and changed-behavior reconnects were tested only against the
local protocol harness. Add a required official-SDK regression script and retain
its report alongside the four existing SDK reports. No runtime or language change.

Owner-created temporary projects exercise six authored outcomes: a passing control,
unmet expectation, runtime error, recursion bound, invalid suite and case bound.
Check native status, SDK `isError`, preflight/attempt markers, empty top-level output
and no approval separately from transport completion.

All three strict saved operations must refuse missing guards and old reasoning
after reconnect. Fresh adoption can Complete an invocation yet Fail unchanged
saved requirements. Same-session file drift remains unresolved bridge failure,
not a fabricated native result or success. Fixtures are disposable, never edits
to user policy files. No model trial, whole-program proof, universal compatibility
or zero-execution-after-transport-failure claim follows from these finite checks.
