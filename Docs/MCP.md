# Experimental local MCP bridge

GitHub's existing read-only `verify` job now requires the official Python SDK
interoperability checks: source tools, configured project, strict caller guards
and internal historical CI triage, plus saved-policy failure/reconnect regressions.
A Python 3.12 test-only virtual environment
installs the fully pinned `requirements-test.txt` with required distribution
hashes and wheels only, then checks dependency consistency. SDK reports and the
installed package list are retained with `policy-project-evidence`; a five-minute
step limit applies. This adds no deployment privileges or server runtime
dependency. It is one pinned client/runner configuration, not universal MCP
compatibility or authenticated model-reasoning evidence.

`scripts/mcp_sdk_failures.py` uses owner-created disposable projects, not edits to
user policies. It checks finite Pass/Fail, runtime Error/Unknown and preflight
Error/Unknown through the real SDK, preserving `isError`, execution phase and
no-approval markers. All four strict saved operations reject missing/old guards;
a reconnect after changed behavior refuses the old guard. Explicit fresh adoption
can produce invocation Complete while unchanged saved expectations Fail. Matching
initialization guards still cannot bypass same-session suite drift; transport
failures stay unresolved. CI retains this fifth report as `mcp-sdk-failures.json`.
These authored regressions do not measure agent reasoning or prove universal
compatibility, safety or absence of execution on unreceived outcomes.

Regenerate the test lock intentionally (review dependency/hash changes):

```sh
uv pip compile integrations/mcp/requirements-test.in --default-index https://pypi.org/simple \
  --python-version 3.12 --universal --generate-hashes --only-binary :all: \
  --output-file integrations/mcp/requirements-test.txt
```

The `uv run --with mcp==2.3.0` examples below remain convenient optional manual
smokes; they do not lock every transitive dependency. To reproduce CI's dependency
set, install the committed lock in a disposable Python 3.12 venv using
`python -m pip --isolated install --index-url https://pypi.org/simple
--only-binary=:all: --require-hashes -r integrations/mcp/requirements-test.txt`,
then use that venv's Python for the same scripts.

Native one-command transport now enforces raw stdout 4 MiB/stderr 64 KiB caps
while collecting, before report decoding. Either overflow rejects the entire
result; post-submission transport failures remain unresolved, not evidence of zero
execution. The trusted direct child is killed/reaped on failure; this is not
descendant isolation or a hostile-executable sandbox. See [Python client](Python-client.md).

Agents with an MCP client can discover and call Wisp without copying native CLI
transport. `integrations/mcp/server.py` is a standard-library Python 3.8+ stdio
host; **all language checking/execution remains in the trusted Rust binary**.
It is not an HTTP/network service or a production sandbox.

```sh
cargo build --locked
python3 -B integrations/mcp/server.py --wisp target/debug/wisp
```

Configure your local MCP client to launch that command with absolute script/binary
paths (or a repository working directory). Client configuration formats differ;
no global agent configuration is modified by this repository. Authorize the local
server/tool access in your client. Do not supply credentials: the server has no
GitHub/network integration, shell tool or model/API-key requirement. Use `-B` to
avoid Python bytecode cache files.

## Tool surface

The tool list is fixed for a session and advertises exact object schemas with no
agent-selected file/command/path arguments. Seven source tools select fixed native
operations:

| Tool | Rust operation | Meaning |
| --- | --- | --- |
| `wisp_capabilities` | capabilities | Actual compiler/limits/operations/diagnostics |
| `wisp_check` | analyze | Whole-program check, no execution |
| `wisp_describe` | describe | Checked function/record interfaces, no execution |
| `wisp_invoke` | call | One typed function, not top-level code/probes |
| `wisp_review` | review | Baseline/candidate against caller-owned finite cases |
| `wisp_context` | context | Bounded probe context, not execution or completeness |
| `wisp_prepare_edit` | edit | Guarded single-body candidate preparation, no execution or file writes |

### Prepare an edit, then verify it separately

`wisp_prepare_edit` requires exactly `source`, `function`, `expected_revision`,
`expected_body_hash` and `replacement`, all strings. From `wisp_check`, copy the
root `revision` and the selected `graph.functions` entry's `body_hash`; do not
guess hashes or derive body boundaries from prose. Both guards are lowercase
64-character SHA-256 identities. Replacement is a body block, including braces;
Rust enforces its 65,536 UTF-8 byte cap and the resulting source cap.

The bridge translates to the existing pure Rust `edit` request, not a new editor
or interpreter. Rust checks the baseline, exact source/body guards, replacement
shape and candidate types, then audits preservation of every byte outside the
selected parsed body, signatures, declarations and probes. Ready returns proposed
source at `report.edit.source`, with `report.new_execution:false`, empty output
and no probes/usage. It does not apply the proposal, write a file, execute cases,
approve it or establish intended behavior. Check stale-guard and rejected-candidate
diagnostics in the native report; replacement/candidate diagnostic ownership is
preserved. Error/Unknown remain `isError:true`, never an approved candidate.

Next submit baseline and prepared source to `wisp_review` with caller-owned cases.
Ready preparation and finite review Pass are separate evidence. The SDK example
prepares `identity(n)` to return `n+1`, then independently observes old result 1,
new result 2 and a passing expectation at input 1; neither step grants approval.
No `path`, `out`, automatic apply, expectation override or custom limit is accepted.
This inline tool always requires its own source/body guards; the owner-configured
project guard flag only governs saved-project tools. See
[edit contract](Protocol.md#guarded-function-body-preparation-edit-contract-v1).

### Optional owner-configured saved project

Start with one explicit manifest to add five tools, avoiding repeated source in
invocations:

```sh
python3 -B integrations/mcp/server.py --wisp target/debug/wisp \
  --project examples/policies/project.json
```

Only the owner/startup configuration chooses this path. The agent cannot choose
another manifest, pass a path/source override or browse files. Without `--project`,
these five tools are absent and project discovery does not occur:

- `wisp_project_describe {}` returns the checked interface/pins loaded during
  initialization. Bridge execution is `initialization_metadata`: **not a live
  filesystem rescan**, case verification or new policy invocation.
- `wisp_project_invoke {id,policy,function,args,expected?}` calls a described function in
  that pinned project. Request/policy IDs are ASCII `[A-Za-z0-9_-]{1,64}`. Example:

```json
{"id":"reservation-1","policy":"reservations","function":"decide","args":[
  {"quantity":"11","pack_size":"5","expires_at":"101"},
  {"available":"11","now":"100"}
]}
```

Project discovery checks all source interfaces and compiler compatibility, not
suite expectations. Manifest/source/suite-file pins are validated before each
fresh native session's requests. Changed files fail closed; there is no automatic
adoption of edits. Restart explicitly to discover a deliberately changed project.
Metadata remains the initialization snapshot even after files change.

The project tools reuse `ProjectClient`, not another type/rule implementation.
Invocation returns the full native adapter response in `structuredContent.report`:
inspect its `status` and `adapter` identities, then `report.result` for a Complete
core value. Inline-source tools return the core report directly. Native Error and
Unknown remain data with `isError:true`; a business rejection can correctly be a
Complete core value and is not automatically turned into a tool execution error.
Unknown targets/extra fields are rejected before submission. Failed readiness is
reported conservatively as unresolved transport, not approval or fabricated data.

Saved-project calls reduce the required per-call request payload for the shipped
reservation example and return identical underlying core evidence to inline calls.
That is **not** a measured latency/token/total-protocol efficiency claim: project
discovery and adapter provenance add their own output and startup costs.

### Bind the caller's reasoning across reconnects

`wisp_project_prepare_edit {policy,function,expected_body_hash,replacement,expected?}`
uses the owner-selected saved source, without a source/path override. Copy the
body hash from guarded `wisp_project_focus` graph metadata and the policy's
discovery guard into `expected`. Strict owner mode requires `expected`; the body
hash is mandatory in every mode. Project/source/full-suite/compiler pins precede
native preparation; body conflicts are retained native Error evidence. Replacement
is a Unicode body block of at most 65,536 UTF-8 bytes, transported over stdin.

Ready wraps the existing pure Rust proposal, with full candidate source under
`report.report.edit.source` and both native/project no-execution markers. It does
not Apply, write saved files, execute suites or grant approval. Client checks all
policy pins and candidate identities/audit markers before exposing the response.
Only selected source is checked. Full candidate output means this is not a total
token-saving or source-confidentiality mechanism. See [Projects](Projects.md).

`wisp_project_focus {policy,function,budget?,expected?}` reads compiler-derived
Agent View context from the saved snapshot without source input or execution.
It uses the same caller guard as invocation; strict owner mode requires `expected`
for focus, invocation, verification and saved preparation. Default budget is 4096 UTF-8 text bytes, range 0–65536. Its
native report wraps the unchanged core report under `report.report`; inspect
`report.project.new_execution:false`, inner status, omissions and overflow. Graph
and identity JSON are outside the text budget, so this is not a total-output cap.
The client validates every policy pin before exposing context, but only selected
source is semantically checked. No suite cases execute. Stale guard refusal is
`not_submitted`; later transport/drift failures remain conservatively unresolved.
See [Projects](Projects.md) and [Python client](Python-client.md).

`wisp_project_verify {policy,expected?}` executes that policy's saved finite case
suite without source, path or expectation overrides. Copy the same discovery
guard; strict owner mode requires it. The native wrapper's `report.report.review`
retains exact shared Rust self-review, case expectations, attempts and explicit
Pass/Fail/Error/Unknown. `isError` is true for Fail/Error/Unknown, while transport
completion and matched guards are not passing evidence. The root bridge still
grants no approval. This is selected-policy verification, not whole-project or
composed-application acceptance. Other-policy pins are validated after the native
operation; a later client/transport failure may follow execution and remains
unresolved. Discovery or focus never substitutes for verification.

Server/session pins protect against disk changes **within** a session. They do
not by themselves bind an agent's earlier reasoning after a restart that discovers
a new revision. For that boundary, copy the selected policy's exact guard from
`wisp_project_describe` result `structuredContent.bridge.call_guards[policy]` into
the invocation's `expected` argument. Each guard has exactly:

```text
{policy_id, manifest_hash, source_revision, suite_file_hash, compiler}
```

Policy IDs are bounded ASCII; the three hashes are lowercase 64-character SHA-256
strings; compiler is the discovered identifier. Do not infer or recompute fields
from prose. Guards are defensive copies of initialization metadata. A missing
field, extra field, invalid type/hash or mismatch rejects before creating a native
call session: `isError:true`, `report:null`, execution `not_submitted`. Evaluated
guard rejection is exposed as `bridge.guard_status:"rejected"`. Successful comparison
is `"matched"`; legacy calls without `expected` use `"not_requested"` and bind only
the server/session snapshot, **not** earlier caller reasoning. Boundary/schema
errors can reject before guard evaluation.

For persistent agent workflows, the owner can require caller guards:

```sh
python3 -B integrations/mcp/server.py --wisp target/debug/wisp \
  --project examples/policies/project.json --require-project-guard
```

The flag requires a project at startup, advertises `expected` as required in this
session's tool schema, and refuses unguarded saved-project focus, invocation,
verification and preparation. Project
metadata exposes `bridge.caller_guard_required`. It does not alter other server
instances or the seven independent inline-source tools. Default mode stays backward
compatible; omission is not silently claimed to be caller-pinned.

Both protections apply: first compare caller guard with initialization pins, then
the existing client checks live readiness before writing requests. A matched caller
guard cannot bypass later filesystem drift or native Error/Unknown. Inspect both
bridge/native status and execution markers; a matched hash is not an executed or
approved decision. Native transport failure remains conservatively unresolved.
Guards are not signatures, requirements locks, proof that the agent read the code,
authorization or user-intent verification. Choosing a fresh guard explicitly
adopts that new snapshot for the call; it does not endorse its business rules.

A regression test changes a valid function's behavior, starts a new server on the
same manifest and shows the distinction: an old caller guard is refused before
submission, an unguarded negative control uses the new session's behavior, and an
explicit new guard accepts the new snapshot. This tests a concrete stale-reasoning
boundary, not universal correctness or a language-superiority claim.

Use discovery/checking before a typed call. Int arguments are canonical decimal
**strings**, including i64 extremes. Raw numeric tokens remain numbers—even huge
exponents—and Rust rejects them as Int input instead of host string coercion.
Context focus defaults to `probe:0`; budget defaults to 4096 and accepts an integer
0–65536. Inspect omitted/overflow metadata. Limits otherwise use the core's bounded
defaults; this bridge does not expose arbitrary CLI options or configuration.

No tool writes source/specification/files, invokes an arbitrary host command,
fetches a URL, merges or deploys. Captured prints, source comments and diagnostics
are untrusted data, not protocol messages or instructions. Read-only/idempotence
annotations are client hints, not security guarantees or proof.

## Protocol and outcome boundaries

The bridge implements the MCP **2025-11-25** stdio tools subset: initialize/version
negotiation, initialized notification, ping, tools/list and tools/call. If another
version is requested it responds with its supported version; an incompatible
client should disconnect. There are no prompts, resources, subscriptions, sampling,
elicitation, tasks, progress or dynamic tool-list changes. JSON-RPC batches are not
supported. EOF closes the session; no protocol shutdown message is defined.

Messages are LF-terminated JSON, one per line. Stdout contains protocol JSON only;
host errors go to stderr. Unicode U+2028/U+0085 within strings is data, not framing.
Duplicate members, invalid Unicode/JSON or excessive nesting fail closed.

A successful tool transport returns both `structuredContent` and an identical
serialized text block for compatible clients:

```text
{bridge:{contract_version:1,status:"Complete",approval:"not_granted",
         execution:"see_native_report"},report:<unaltered native report>}
```

Bridge Complete is **not native success**. Inspect `report.status` and its
execution/scope markers. Native Error, Unknown and Fail set MCP `isError:true` and
remain intact; Ready/Complete/Pass are finite evidence, never approval. Compiler
identity is discovered during initialization and pinned for subsequent reports.
There is no execution cache. Project description reuses initialization metadata;
other tools submit fresh native requests.

Invalid tool arguments return `isError:true`, bridge Error, `report:null` and
execution `not_submitted`. Native transport/deadline/oversized/malformed-result
failures instead use execution `unresolved`: policy code may already have run.
No fabricated native report/status is invented. Unknown tools or invalid protocol
requests use JSON-RPC errors. Notifications never execute tools or receive replies.
No native stderr, environment or credentials are returned to the client.

## Resource and trust limits

- At most 1 MiB per LF-terminated input frame and encoded native request.
- At most 64 JSON containers in parsed input/native results; core language limits
  remain separate. At most 4 MiB per native report, before text/structured wrapping.
- A native subprocess has a 15-second deadline. Input/output is buffered by a
  trusted local process before some byte checks; this is not a hostile-process
  memory or descendant sandbox.
- The server is sequential: one native request at a time, at most 1024 tool calls
  and 4096 total messages per session. Quotas do not silently reset/retry.
- Cancellation notifications do not interrupt an in-flight synchronous call;
  it remains bounded by the native deadline. Closing/terminating the host is a
  client-controlled shutdown. SIGTERM raises through Python's subprocess cleanup
  to kill/wait the owned direct child. No async/task support is advertised.

Use only a trusted local Wisp executable and authorized client. Source/report
contents can be sensitive: the MCP client decides where they are retained or sent
to a model. The language core gains no filesystem, network or arbitrary host
execution capability from this transport.

## Verification

`npm run test:workflow` includes forty authored MCP/native tests covering lifecycle,
tool discovery, exact i64 transport, native Error/Unknown/continuation, review
Pass/Fail, nonexecuting context/interface operations, invalid schemas/IDs/frames,
quotas/compiler drift, malformed/oversized native reports, real stdio EOF and
SIGTERM cleanup of an owned in-flight native child. Saved-project tests cover
owner-only configuration, absent tools by default, target/schema guards before
submission, source/manifest/suite drift, compiler compatibility, native Error/
Unknown/business rejection/continuation, exact inline/project core parity and
the shared metadata/adapter report byte cap.
Caller-guard tests cover defensive metadata, native evidence parity, malformed and
mismatched fields, changed source across reconnects, same-session readiness drift,
native-error preservation and owner-required schema/configuration isolation.
Optional official-client smoke:

```sh
uv run --no-project --default-index https://pypi.org/simple --with mcp==2.3.0 \
  python -B scripts/mcp_sdk_smoke.py
uv run --no-project --default-index https://pypi.org/simple --with mcp==2.3.0 \
  python -B scripts/mcp_sdk_smoke.py --project examples/policies/project.json
uv run --no-project --default-index https://pypi.org/simple --with mcp==2.3.0 \
  python -B scripts/mcp_sdk_smoke.py --project examples/policies/project.json --require-project-guard
```

The official Python SDK needs Python 3.10+; it is a test-only optional dependency,
not a runtime requirement or package publication. One local SDK 2.3.0 smoke passed
initialize/list/call with exact i64 and native Complete/Error/Unknown, with no
top-level execution. This is measured interoperability with one client, not all
clients, external adoption, benchmark superiority or production readiness. The
optional configured-project SDK smoke also passes twelve-tool discovery and a
pinned reservation decision without source in the tool arguments.
Guarded/strict modes also exercise rejected stale guards and required-guard
enforcement without fabricating native outcomes.

Current configured modes discover twelve tools and exercise guarded bounded focus,
nonexecution and stale-context refusal. Default discovery has seven tools; the six
existing source tools retain their request behavior, with edit preparation added.
All three SDK modes check real guarded preparation, a separate finite review and
stale-body refusal. Five new local tests cover exact native parity, Unicode/trivia
preservation, guard conflicts, diagnostic ownership, schema boundaries and caps.
An optional internal driver uses the official SDK to fetch bounded `decide`
context, verify its saved finite cases, then invoke the same pinned policy against saved historical repository CI
evidence:

```sh
uv run --no-project --default-index https://pypi.org/simple --with mcp==2.3.0 \
  python -B scripts/mcp_internal_triage.py --budget 2048
```

This is read-only internal integration, not live CI/deployment authority, a model
reasoning experiment or a measured language comparison. Overflow/omissions are
retained and context retrieval is separate from policy invocation and approval.
