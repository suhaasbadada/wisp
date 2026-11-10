# Caller-owned composed expectations v1

Component cases can pass while interacting policies produce an unacceptable final
result. The read-only order host can now gate the **complete observed workflow**
against explicit caller-owned expectations, without changing a policy or case:

```sh
cargo build --locked
python3 -B examples/order-gate/run.py \
  --baseline examples/order-gate/project-before.json \
  --expect examples/order-gate/observed.expect.json
```

This returns Pass/exit 0 for all eight recorded outcomes, **including** the known
1,090-cent shipping-cliff outcome. It is a regression snapshot, not a recommended
business specification or approval of higher prices. A gate checks the requirements
you give it; it cannot establish whether those requirements are right.

An explicitly different, illustrative proposal expects free local shipping for
the two bulk orders, with final totals of 900 and 990 cents:

```sh
python3 -B examples/order-gate/run.py \
  --baseline examples/order-gate/project-before.json \
  --orders examples/order-gate/bulk-orders.json \
  --expect examples/order-gate/proposed-free-shipping.expect.json
```

This deliberately returns **Fail/exit 1**, despite component Pass and completed
runtime decisions. Each case points to shipping `fee_cents` and
`grand_total_cents` mismatches. Policy sources, input files and expectations are
untouched. This proposal demonstrates blocking unmet requirements; it is not an
owner-approved rule change, and the host does not silently implement it.

## Strict saved contract

Use `--expect FILE` with or without a baseline. Both files are read once before
any Wisp command: orders as usual, and a maximum 65,536-byte UTF-8 expectation file:

```json
{"version":1,"orders":[
  {"id":"expired","expect":{
    "status":"Rejected","stage":"eligibility",
    "decisions":{"eligibility":{"accepted":false,"packs":"0","reason":"expired"}},
    "outputs":[{"policy":"eligibility","output":""}]
  }}
]}
```

Top-level members are exactly `version` and `orders`; each case exactly `id` and
`expect`; each expectation exactly `status`, `stage`, `decisions`, `outputs`.
Version is the JSON integer token 1. There are 1–32 unique ASCII IDs, matching
**every input order ID exactly** (no missing, duplicate or foreign case). Order
within the expectation file is irrelevant; results follow input order.

Expected status is only Accepted or Rejected. Accepted must finish at shipping.
Stages are eligibility, pricing, shipping. Require a decision object and explicit
captured-output string for every completed stage in that prefix, in order.
Output entries have exactly `policy` and `output`, with at most 8,192 UTF-8 bytes
per string. No optional expectations, wildcards, predicates, code, includes or
automatic expectation generation/update.

Both order and expectation inputs have a host bound of **64 nested JSON
containers**, counting the root, and require valid Unicode scalars throughout
string values and object keys. Escaped lone surrogates are rejected in preflight,
not after execution while emitting evidence. This host resource/encoding boundary
is separate from Rust's existing argument/type-depth limits. Stdout JSON uses
ASCII string escapes so valid Unicode remains lossless even with an ASCII stdout
encoding. Adapter input transport retains UTF-8 Unicode strings, avoiding an
unnecessary expansion of its raw argument-byte budget.

Expected decision values are **opaque exact JSON snapshots**, not a new Wisp type
decoder. Actual values still come from shared Rust's checked types and the host's
verified interface. The host compares all keys/values, completed status/stage and
captured output; it ignores usages, source hashes and other runtime metadata in
the value verdict. Object key order is irrelevant, array order and strings are
exact, with no newline/Unicode normalization. Int data must match actual canonical
Int strings: expected numeric JSON `1000` is never converted into string `"1000"`
and cannot match it. Well-formed but impossible expected values mismatch; only
the surrounding workflow envelope is schema-validated here.

Unknown/duplicate members (including escaped equivalents), invalid version or
coverage, missing stages/outputs, byte/UTF-8 failures, and non-completed expected
statuses are host errors, stderr/exit 2, **before policy execution**. The normal
per-stage Rust typing of runtime business inputs is unchanged. Captured JSON
number tokens remain lossless; no host money arithmetic or language interpreter
is introduced.

## Evidence and verdicts

Without `--expect`, existing Complete/Error/Unknown observation output is unchanged
apart from an additive `orders_hash`. With it, stdout is one JSON object:

`{status,approval:"not_granted",side_effects:"none",expectation,workflow}`.

`workflow` retains the ordinary plan or full composed before/after evidence.
Expectations apply to the plan, or to the **candidate** (`after`) when a baseline
is supplied. The baseline is not quietly regraded against candidate intent.

`expectation` has contract version 1, document plan/candidate, phase
checked/not_evaluated, full-file `expected_hash` and `orders_hash`, scope,
`new_execution:false`, cases and (when checked) a summary. This marker means the
comparison itself invokes no Wisp machine, **not** that the embedded workflow
performed no execution. Every checked case retains ID, Pass/Fail/Error/Unknown,
expected and observed snapshots, and up to 32 case-relative JSON-Pointer
`mismatch_paths` (escaped segments; diagnostic cap, not a matching shortcut).

All data must match for Pass. Error or Unknown from an order stays that outcome,
never a fabricated Fail/Pass or a missing case. Root priority is existing workflow
Error, then Unknown, then expectation Fail, otherwise Pass. An incomplete baseline
in composed mode therefore prevents Pass even if every candidate expectation
matches. Business Rejected can correctly match a Rejected expectation.

A failed component gate remains Fail/Error/Unknown with expectation phase
not_evaluated, no observed cases and no invented summary. Component execution,
application execution and expectation comparison remain separate evidence gates.
In particular, `application_invocations:0` on a component failure does not erase
the component review's separately reported invocations.

Exit 0 Pass, 1 Fail/Error, 3 Unknown, 2 host/config/protocol/deadline error. The
application still performs **no side effects**. No report, hash, Pass or captured
business Accepted authorizes deployment, payment, stock mutation or intent repair.

## Scope and limitations

The full-file SHA-256 values describe retained input/requirement bytes, including
whitespace. Editing a file after loading does not alter the running snapshot;
consumers must compare hashes to the revision they intend to accept. Hashes are
not authentication, requirements locks or cache hits. Review input and expectation
diffs explicitly: changing both files can change or reduce coverage while still
satisfying exact ID matching. `--baseline` protects component suite equality as
before; it does not automatically make the composed expectation file immutable
across Git revisions.

This is a bounded acceptance gate on explicit examples and caller-chosen intent,
not full-domain correctness, production readiness, an independent policy oracle,
an export/authorization system or comparative language evidence. The original
adverse trace and policy files remain unchanged. See [Order workflow](Order-workflow.md)
for child/session/input bounds, stage routing, conservative incomplete outcomes,
stable-filesystem assumptions and the distinction from a real checkout service.
