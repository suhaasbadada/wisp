# Experimental Python project client

`clients/python/wisp_client.py` is a source-local, standard-library Python 3.8+
client for the native CLI. It is not a published package, daemon or production
service. Use a trusted Wisp binary built from this checkout:

```python
import sys
sys.path.insert(0, "clients/python")
from wisp_client import ProjectClient

client = ProjectClient("examples/policies/project.json", binary="target/debug/wisp")
response = client.call("reservations", "decide", [
    {"quantity": "11", "pack_size": "5", "expires_at": "101"},
    {"available": "11", "now": "100"},
], request_id="order-1")
if response["status"] != "Complete":
    raise RuntimeError("Unresolved policy decision; do not act")
decision = response["report"]["result"]["value"]
```

`examples/policies/decisions.py` and `examples/order-gate/run.py` both consume this
client. They retain application-specific signature/record checks and routing.
The client does not interpret business rules, calculate prices, decode Wisp
records into application classes or grant approval. Rust remains the language
implementation and argument/type validator.

## Discovery and batches

`client.focus(policy, function, budget=4096)` returns guarded saved-function
context without executing policy code or resending source. Targets must be
described; budgets are integers (not booleans) from 0 through 65536. Each call
passes all four native snapshot pins, validates every policy's source/suite hashes
and selected compiler/revision before exposing context, and checks nonexecution
markers and the Ready report's UTF-8 byte ledger. Drift or malformed transport
raises `ClientError`; native Error/Unknown remain report data. Existing command
deadline/report limits apply. It checks selected source, not suite cases or all
policy semantics. The graph/identity metadata is outside the text budget; inspect
omissions and overflow. Context is not relevance/completeness or approval proof.

Construction runs `project describe` without policy execution. It requires a
Ready version-1 project/interface contract, unique policy/record/function/field/
parameter identities, known type descriptors and source/suite/manifest hashes.
`description` returns a defensive copy; changing it cannot alter the client's
pins. Applications must still check that described signatures and records match
their own expected domain boundary.

`call_batch(requests)` accepts 1–32 explicit objects with exactly `id`, `policy`,
`function`, `args`. IDs are unique ASCII `[A-Za-z0-9_-]{1,64}` within a batch.
Policy and function must be described. The client deliberately leaves argument
types/arity to Rust, returning its Error diagnostics rather than coercing input.
`call(...)` is a one-request convenience. Every batch starts a **fresh** session;
there is no cache, retry or persistent child to close. IDs are correlation values,
not idempotency keys, and can recur in later batches.

Before writing any request bytes, the client reads a bounded LF-terminated
readiness frame and checks its version, phase, no-execution marker, manifest,
exact policy set and every source/suite hash against discovery. Drift closes the
session without submitting requests. Between successful readiness and response,
the native session uses its loaded snapshot; later file changes do not change it.
Hashes identify bytes, not authentication or permission to execute.

Responses must match request order/count/IDs, policy, pinned hashes, compiler,
status and invocation target/execution markers. Complete requires the described
return type and a result; Error/Unknown must not fabricate a result. Policy Error
and Unknown are returned as evidence, not `ClientError`. An earlier bad argument
does not prevent later requests completing. Response payloads remain plain JSON;
these transport checks are not an independently verified language type decoder.

## JSON, deadlines and failure ownership

Frames split on **LF only**, not Python `splitlines()`: U+2028 and U+0085 inside
valid strings are data. The shared codec rejects duplicate members and non-JSON
constants. `decode_json(text, input_numbers=True)` and `JsonNumber` preserve raw
numeric tokens (including `1e400` and `-0`) without floating-point loss or turning
numbers into accepted Wisp Int strings. Callers who already decoded input with
ordinary float conversion cannot recover lost information through this client.
`encode_json(..., ascii_strings=True)` provides ASCII-safe evidence output;
adapter requests retain UTF-8 strings so escaping does not inflate argument bounds.

Request preflight checks 64-container nesting, scalar Unicode keys/values and
131,072 UTF-8 bytes per encoded request line, excluding LF. Native argument,
output, fuel and type-depth bounds remain separate.
JSON arrays must be Python lists and object keys must be strings. Tuples, sets,
bytes, arbitrary Python objects and non-finite floats are rejected rather than
coerced or allowed to bypass traversal. The timeout is an integer
1–300 seconds (default 15), independently applied to discovery and each complete
batch exchange, including readiness. One IO worker owns session pipes; deadline
or protocol failure kills/waits the owned child and joins the worker. There are
no automatic retries.

Native one-command collection (`run_cli`, used by discovery, focus and inline MCP
operations) concurrently reads stdout and stderr while writing optional stdin.
Stdout is capped at 4,194,304 raw bytes and stderr at 65,536; exactly the cap is
accepted, one extra byte rejects. Limits apply before strict UTF-8 decoding, not
after full output capture. Raw newlines and Unicode scalars are preserved.
Exceeding either pipe's cap invalidates the whole result, even with successful
stdout or exit 0. Collection, input and child exit share the command deadline;
failures kill/reap the direct child and close pipes/join workers, returning generic
`ClientError` without captured output. Cleanup has a separate bounded allowance.
Successful semantic exits remain 0/1/3 only where requested; other command exits
are transport failures. These caps do not bound total process/input/decoded-JSON
memory and do not establish that a submitted operation did not execute.

`ClientError` means host/configuration/protocol/deadline failure. It does **not**
mean zero execution after submission: some calls may have run before a timeout,
truncation or mismatched response. Unreceived outcomes are unresolved. Callers
own action, persistence, authorization and any idempotency strategy. No side
effect or approval is performed by this client or the example applications.

The CLI is trusted local code, not a hostile subprocess sandbox: bounded output
is retained in memory, and this client does not isolate process descendants
or defend against an arbitrary malicious executable. Do not point it at untrusted
programs or expose it directly as a public service. Tests exercise authored peers
and native cases, not a proof of cleanup or protocol completeness on all systems.

Run `npm run test:workflow` for workflow and client regression tests. See
[Adapter](Adapter.md), [Interface](Interface.md), and [Workflow gates](Workflow-gates.md).
