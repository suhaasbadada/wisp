# Composed order policy workflow

This is a runnable **read-only reference application**, not a checkout service.
It joins three saved Wisp policies: reservation eligibility, member-bulk pricing,
and shipping. Python handles bounded transport and stage routing; Wisp handles
the typed rules, money arithmetic and policy decisions. No stock is reserved,
payment charged, order persisted or network request made.

Requirements: the native Wisp CLI and Python 3.8+ (standard library only).

Discovery, lossless JSON and pinned-session transport are shared through the
experimental [Python client](Python-client.md). Domain routing and expectation
ownership remain in this host; readiness is validated before request submission.

To enforce explicit composed outcomes in CI, add [`--expect FILE`](Workflow-gates.md).
The matching recorded snapshot passes; the separately named proposed free-shipping
requirements deliberately fail, without changing policies or recorded history.

```sh
cargo build --locked
target/debug/wisp project describe examples/order-gate/project.json
target/debug/wisp project verify examples/order-gate/project.json
python3 -B examples/order-gate/run.py
python3 -B examples/order-gate/run.py --baseline examples/order-gate/project-before.json
```

The eight example orders produce four Accepted and four Rejected decisions,
with 19 fresh invocations. Rejection is a completed business answer, not a runtime
Error. Expiry/stock rejection stops after eligibility; invalid price stops after
pricing; unsupported zone stops at shipping. This runs real native adapter calls,
not a Python reimplementation of the rules.

## Maintain a change, not just a single function

The candidate increases the member discount for quantity ≥10 from 5% to 10%,
rounding the discount amount down in integer cents. Only the pricing body changes;
both manifests retain identical component suite bytes and policy IDs.

```sh
target/debug/wisp project review examples/order-gate/project-before.json examples/order-gate/project.json
```

The 18 component cases produce **3 Changed / 15 Unchanged**, Pass against the
explicit candidate expectations, and 36 fresh invocations. Baseline verify fails
three candidate expectations. These are finite examples, not a proof or approval.

Then run the application with `--baseline`: it first requires a passing component
review, describes/checks both exact reviewed interfaces/revisions, and observes
the same eight inputs through both complete workflows. The example reports
**2 Changed / 6 Unchanged** orders with 38 application invocations, separately
from the 36 component-review invocations. Each side retains every stage's core
typed report, revision, captured output, diagnostics and invocation evidence.

### A deliberately visible adverse interaction

For member-eleven, the pricing quote drops from 1,045 to 990 cents, but that loses
the shipping policy's 1,000-cent free-shipping threshold. The final customer total
**rises from 1,045 to 1,090 cents**. Component expectations still pass; the composed
before/after report makes the effect visible. Member-ten's final total falls from
1,050 to 1,000 cents. Neither Changed nor Accepted grants approval.

This counterexample is retained, not "repaired" by rewriting requirements or
silently changing shipping. A real owner must choose the intended discount/free
shipping interaction and review that specification change explicitly. The tool
does not decide whether this tradeoff is acceptable. `expected.json` records
both authored example traces for regression checks, **not a claim that higher
customer prices are desirable**, independent business requirements, a technical
holdout, or evidence that Wisp beats existing-language tooling.

## Inputs and outcomes

Use `--orders FILE`, `--project MANIFEST` and `--wisp BINARY` to select explicit
local files/CLI. Defaults point at this example and `target/debug/wisp`.
Order files are bounded to 65,536 UTF-8 bytes and 1–32 exact objects with unique
ASCII `[A-Za-z0-9_-]{1,64}` IDs. Required fields:

```json
{"id":"order-1","quantity":"11","unit_cents":"100","member":true,
 "pack_size":"5","expires_at":"101","available":"11","now":"100","zone":"local"}
```

Unknown/duplicate JSON fields (including escaped equivalents), malformed roots,
invalid IDs, non-UTF-8 and out-of-bound files fail at the host boundary. Typed
business fields remain Rust's responsibility. Int JSON numbers are not silently
converted to canonical Int strings. A later stage may reject bad typed input after
earlier stages completed; there is no global typed-input preflight claim.

Numeric tokens, including huge exponents, underflow, negative zero and integers
beyond Python's conversion limit, are retained losslessly as JSON numbers through
transport, never converted to binary floats or accepted Int strings. Rust can
therefore reject an invalid numeric business field for that order while other
orders finish. NaN/Infinity tokens are not JSON and are rejected while loading.
Host parser/encoding/resource failures remain host errors, not partial acceptance.
The host also bounds JSON nesting to 64 containers and rejects non-scalar Unicode
in keys/values before policy commands; Rust argument/type depth remains separate.

Ordinary plan output has `status`, `approval:"not_granted"`, `side_effects:"none"`,
manifest hash, every policy's source/suite hashes, summary and ordered `orders`.
Each order has its last `stage`, `status`, completed `decisions`, and `evidence`.
Do not treat an earlier eligibility reason `reserved` as an actual stock mutation.
Inputs carry their own availability values; the host does not allocate shared
inventory across orders or prevent concurrent overselling. A later Error/Unknown
clears the row's earlier business reason while retaining prior completed evidence.

- Accepted: all three business decisions completed and accepted this input.
- Rejected: a completed policy returned `accepted:false`; later stages did not run.
- Error: a typed-input/runtime fault; no fabricated later decision. Checked i64
  overflow in pricing **or shipping** remains Error, not a price or rejection.
- Unknown: limits/incomplete execution; no fallback acceptance or fabricated result.

Other orders continue after one Error/Unknown. Root precedence is Error, Unknown,
then Complete. Complete may include Rejected orders. Invocation and submitted
request counts are distinct: core input rejection does not invent an invocation.

## Composed review and failure gates

With `--baseline`, root `component_review` is the shared native project review.
Its Fail/Error/Unknown stops application observation, with phase `component_gate`
and `application_invocations:0`. **Component review may already have executed**
its own cells, reported separately. A specification-drift preflight has zero core
execution as documented in [Projects](Projects.md). No expectations are rewritten.

After that gate, root phase `observed` includes `before`, `after`, `changes`,
their summaries and application counts. Comparisons use completed typed decisions,
stage/status and captured output; they ignore revision/usage/metadata differences.
Any order with Error/Unknown on either side is **Unavailable**, never Unchanged.
Root is Error if either plan is Error, otherwise Unknown if either is Unknown,
otherwise Complete. This conservative reference-host outcome is separate from
the core review's cell-status rules, and never acts as deployment approval.

Exit codes: 0 Complete, 1 Error or a failed component gate, 3 Unknown, 2 host
IO/config/protocol/deadline failure (stderr, no success JSON). Incomplete or
mismatched correlation/version/result types/revisions cannot become Accepted.
No exit code or passing component cases authorize a transaction.

## Pinning, bounds and limits

Each stage batches pending inputs into a fresh adapter session, with fresh core
limits per invocation. Both sources/interfaces must match the component review
before composed calls start. Every adapter startup must match discovery's full
manifest/source/suite identities, including policies not used in that stage.
File drift causes a host failure, not hot reload or an accepted partial report.
Source changes later in one already-pinned adapter do not affect that session;
subsequent session starts detect mismatch. The trusted manifest-parent stability
assumption from Projects still applies; there is no atomic multi-file filesystem
snapshot or hostile concurrent-filesystem sandbox.

At most 96 application invocations per 32-order plan, or 192 for two observed
plans plus bounded component review. Each child command has a 15-second deadline;
tests/CI also have outer deadlines. The host captures bounded-workload reports
in memory; these are not absolute memory/CPU guarantees, service throughput
measurements, durable queues or concurrent transaction isolation. It launches a
session per stage/batch, not a daemon or compiled/result cache. Run a trusted CLI
and use normal host process/filesystem protections; this is not an authenticated
public endpoint or a general SDK.

No Rust language behavior/permissions or browser filesystem access change in this
increment. Component and application tests are now part of `npm test`; CI retains
verify/plan/composed-review JSON. This demonstrates an inspectable integration
slice and a concrete cross-policy hazard, not external adoption, production
readiness, universal correctness or superiority.
