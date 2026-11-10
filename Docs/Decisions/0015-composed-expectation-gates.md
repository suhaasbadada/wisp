# ADR 0015: Explicit end-to-end workflow expectations

Status: accepted; shipped via PR #15 at
`f75f34209f1aa3ac57e66591992d7cdedf883023`. Exact-head CI, merged release,
actual CI artifacts and published contract acceptance are recorded on that PR.

## Need

The composed example exposed a discount/free-shipping interaction despite passing
component expectations. Observation-only comparison is useful evidence, but CI
also needs to block a caller-declared unacceptable end-to-end outcome.

## Decision

Add opt-in `--expect FILE` to the reference order host. Load a strict bounded
version-1 file before any Wisp command, with exactly one explicit expected complete
snapshot per input order. Compare status/stage, every completed typed decision and
captured output as opaque JSON; do not implement business arithmetic, decode new
Wisp types, infer intent or rewrite expectations.

Retain original workflow reports, candidate-only expectation ownership in composed
mode, Error/Unknown precedence, explicit not-evaluated component-gate failures,
bounded mismatch pointers and full retained file hashes. A passing snapshot is
finite evidence, never authorization or endorsement of the requirements.

Keep the existing adverse shipping trace and sources unchanged. Provide a matching
observed-outcome fixture and a separately named **proposed** free-shipping fixture
that deliberately fails two orders. CI checks both positive and negative controls
and retains the reports. Neither fixture is an independent oracle or an approved
change to an actual business's requirements.

## Boundaries

Strict IDs prevent missing cases within the selected batch, not historical coverage
tampering: owners must review changes to input/expectation files. Hashes identify
snapshots, not trust. 64KiB/32 cases, existing host/core/session deadlines and bounds,
no filesystem/network permissions in the language, no new syntax/core semantics,
no side effects, cache or automatic approval. Expected decision data is exact JSON,
not another typed evaluator or a general property/predicate language.

Independent review found valid deeply nested opaque data and escaped lone
surrogates could destroy evidence during final serialization. Input preflight now
bounds host JSON nesting to 64 containers and checks Unicode scalars throughout
keys/values; stdout uses ASCII-safe JSON string escapes, while adapter arguments
keep UTF-8 spelling. Rendering/writing is inside host error handling. Excessive
or invalid input fails before any policy command, rather than losing a late report.
