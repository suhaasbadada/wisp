# Native decision adapter v1

An application or agent can keep a native Wisp process open and submit typed
policy calls over JSON lines. It avoids constructing core requests and launching
a process for each decision. **It does not avoid compilation per call** or claim
throughput improvements: each call still uses the shared Rust checker/evaluator.

```sh
cargo build --locked
python3 examples/policies/decisions.py
```

The dependency-free Python host submits two reservation orders to the saved
project. It returns an accepted partial pack with `packs:"3"`, then a rejection
at expiry equality. It checks readiness, response count/correlation and Complete
before using a decision. It performs no reservation, persistence or other side
effect. A policy decision is data, not authorization to perform a host action.

## Start and pin a session

Before startup, [`project describe MANIFEST`](Interface.md) provides checked
function/record boundaries. The Python host verifies its expected interface and
requires startup manifest/source hashes to match discovery. If files changed
between commands, it fails rather than silently switching revisions.

```sh
target/debug/wisp project serve examples/policies/project.json
```

`serve` is local stdin/stdout transport, **not an HTTP server**, daemon, network
listener or browser filesystem permission. It loads the same bounded manifest,
sources and suites described in [Projects](Projects.md), then emits and flushes one
readiness JSON line before reading requests. File/config failure exits 2 on
stderr with no readiness frame. All policy files are retained snapshots. Editing
or deleting source, suite or manifest after readiness does not change this
session; restart explicitly to adopt a new revision. There is no hot reload.

Readiness is `status:"Ready"` with empty `diagnostics` and:

```json
{"adapter":{"contract_version":1,"phase":"ready",
 "manifest_hash":"FULL_FILE_SHA256","approval":"not_granted",
 "new_execution":false,"line_bytes":131072,"requests":1024,
 "policies":[{"id":"reservations","source_revision":"SOURCE_SHA256",
              "suite_file_hash":"FULL_FILE_SHA256"}]}}
```

Ready means **files loaded**, not sources checked, suites validated, policies
verified, intent approved or deployment accepted. Run `project verify` separately
on the intended revision when that is your gate. Suites are loaded only as saved
project data/identities; they do not constrain runtime inputs or select a target.
Readiness lists all policy IDs in sorted order. Hashes identify bytes, not trust.

## Request and response

After readiness, write one UTF-8 JSON object per line:

```json
{"id":"order-1","policy":"reservations","function":"decide","args":[{"quantity":"11","pack_size":"5","expires_at":"101"},{"available":"11","now":"100"}]}
```

All four fields are required. The envelope must be an object: unknown/duplicate
members (including escaped equivalents) are rejected. `id`, `policy` and
`function` must be non-null strings. `args` retains any JSON value for core typed
validation; null or non-array args produce a core input error, not an adapter
schema error. `id` and
`policy` use ASCII `[A-Za-z0-9_-]{1,64}`; `function` is an explicit global function
name. IDs are correlation labels, not authenticated identities, unique-operation
keys or replay prevention: repeated IDs execute again. Any checked global function
in the selected source can be called, not only the suite's target. The trusted
host must enforce any application authorization/target allowlist.

`args` is retained **raw**, including inner whitespace, duplicate keys and integer
widths. Shared Rust owns argument typing and canonical i64 strings, whole-program
checking, function lookup, invocation identity, fresh limits and execution. Only
the explicit function executes; no top-level statements or probes run. There is
no JavaScript/Python evaluator or user-supplied host code, IO or shell escape.

Each bounded request gets one flushed response line, in order:

```json
{"status":"Complete","diagnostics":[],
 "adapter":{"contract_version":1,"phase":"response","request_id":"order-1",
 "policy_id":"reservations","manifest_hash":"FULL_FILE_SHA256",
 "source_revision":"SOURCE_SHA256","suite_file_hash":"FULL_FILE_SHA256",
 "approval":"not_granted","new_execution":true},
 "report":{"status":"Complete","result":{"type":"Decision","value":{}},
           "output":"","diagnostics":[],"invocation":{}}}
```

This illustration omits ordinary core metadata and decision fields. `report` is
the **exact original serialized core call report**, retaining result declaration
order and raw-argument execution keys. `status` mirrors it (Complete/Error/Unknown).
Core diagnostics and captured print stay inside `report`; language print never
becomes a protocol line. `new_execution` mirrors the core invocation marker;
input/compile rejection never fabricates an invocation.

Malformed/invalid adapter envelopes get Error and
`ADAPTER_REQUEST_INVALID`; unknown policy IDs get `ADAPTER_POLICY_UNKNOWN`.
These host diagnostics use kind Adapter, not new language-core diagnostic codes.
They have no `report`, no execution and no source diagnostic spans. Request and
policy IDs are echoed only after strict decoding and valid ID checks; malformed
envelopes cannot supply trustworthy correlation. Core typed-data failures retain
their exact core diagnostics in `report`. All request failures, runtime faults and
Unknowns leave the session available for later requests.

## Transport limits and application safety

- Maximum **131,072 bytes per line excluding LF**; CR, if present, counts as
  whitespace within the cap. CRLF and a final line without LF are accepted.
- Core raw args remain capped at **65,536 bytes**, with existing depth/size/fuel
  limits. Project v1 uses fixed core defaults and no budget overrides.
- Maximum **1,024 request lines per session**, including malformed/blank lines.
  A blank line is an invalid request, not a heartbeat. EOF after the final response
  exits 0; an empty session emits only readiness and exits 0.
- An oversized line or 1,025th line terminates with stderr/exit 2 and **no response
  for that line**. Input allocation is bounded even without a newline. There is
  no silent truncation, drain-and-retry or guessing execution counts.
- IO/output failures exit 2. Protocol stdout contains only JSON lines. Exit 0
  means the session ended normally, **not that decisions completed or passed**;
  callers must check every response, correlation, revision and expected result
  type. Error and Unknown must not become permission to act.
- Calls run serially, fresh each time. No parallelism, compile/result cache,
  authentication, deduplication, transaction, side effects or suite approval.
  The process waits for input/pipe consumers; host deadlines/backpressure and
  cancellation remain the caller's responsibility. Session caps are not an
  aggregate memory/time guarantee. A caller terminating the process must treat
  any unreceived response as unresolved, not fabricate a result.

Use only a trusted manifest parent stable during initial loading; the existing
path checks are not a sandbox against concurrent hostile filesystem replacement.
Do not expose this local trusted-host interface as a public endpoint without a
separate authorization and operational design. Finite tests and this two-order
example do not establish production readiness, adoption or superiority.
