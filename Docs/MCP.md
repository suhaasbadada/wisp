# Experimental local MCP bridge

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
agent-selected file/command/path arguments. Six source tools select fixed native
operations:

| Tool | Rust operation | Meaning |
| --- | --- | --- |
| `wisp_capabilities` | capabilities | Actual compiler/limits/operations/diagnostics |
| `wisp_check` | analyze | Whole-program check, no execution |
| `wisp_describe` | describe | Checked function/record interfaces, no execution |
| `wisp_invoke` | call | One typed function, not top-level code/probes |
| `wisp_review` | review | Baseline/candidate against caller-owned finite cases |
| `wisp_context` | context | Bounded probe context, not execution or completeness |

### Optional owner-configured saved project

Start with one explicit manifest to add two tools, avoiding repeated source in
invocations:

```sh
python3 -B integrations/mcp/server.py --wisp target/debug/wisp \
  --project examples/policies/project.json
```

Only the owner/startup configuration chooses this path. The agent cannot choose
another manifest, pass a path/source override or browse files. Without `--project`,
these two tools are absent and project discovery does not occur:

- `wisp_project_describe {}` returns the checked interface/pins loaded during
  initialization. Bridge execution is `initialization_metadata`: **not a live
  filesystem rescan**, case verification or new policy invocation.
- `wisp_project_invoke {id,policy,function,args}` calls a described function in
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

`npm run test:workflow` includes nineteen authored MCP/native tests covering lifecycle,
tool discovery, exact i64 transport, native Error/Unknown/continuation, review
Pass/Fail, nonexecuting context/interface operations, invalid schemas/IDs/frames,
quotas/compiler drift, malformed/oversized native reports, real stdio EOF and
SIGTERM cleanup of an owned in-flight native child. Saved-project tests cover
owner-only configuration, absent tools by default, target/schema guards before
submission, source/manifest/suite drift, compiler compatibility, native Error/
Unknown/business rejection/continuation, exact inline/project core parity and
the shared metadata/adapter report byte cap.
Optional official-client smoke:

```sh
uv run --no-project --default-index https://pypi.org/simple --with mcp==2.3.0 \
  python -B scripts/mcp_sdk_smoke.py
uv run --no-project --default-index https://pypi.org/simple --with mcp==2.3.0 \
  python -B scripts/mcp_sdk_smoke.py --project examples/policies/project.json
```

The official Python SDK needs Python 3.10+; it is a test-only optional dependency,
not a runtime requirement or package publication. One local SDK 2.3.0 smoke passed
initialize/list/call with exact i64 and native Complete/Error/Unknown, with no
top-level execution. This is measured interoperability with one client, not all
clients, external adoption, benchmark superiority or production readiness. The
optional configured-project SDK smoke also passes eight-tool discovery and a
pinned reservation decision without source in the tool arguments.
