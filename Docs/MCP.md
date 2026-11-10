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

The fixed tool list advertises exact object schemas and no file/command/path
arguments. Source is inline data; tool names select fixed native operations:

| Tool | Rust operation | Meaning |
| --- | --- | --- |
| `wisp_capabilities` | capabilities | Actual compiler/limits/operations/diagnostics |
| `wisp_check` | analyze | Whole-program check, no execution |
| `wisp_describe` | describe | Checked function/record interfaces, no execution |
| `wisp_invoke` | call | One typed function, not top-level code/probes |
| `wisp_review` | review | Baseline/candidate against caller-owned finite cases |
| `wisp_context` | context | Bounded probe context, not execution or completeness |

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
There is a fresh native process per request, not a cache.

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

`npm run test:workflow` includes eleven authored MCP/native tests covering lifecycle,
tool discovery, exact i64 transport, native Error/Unknown/continuation, review
Pass/Fail, nonexecuting context/interface operations, invalid schemas/IDs/frames,
quotas/compiler drift, malformed/oversized native reports, real stdio EOF and
SIGTERM cleanup of an owned in-flight native child. Optional official-client smoke:

```sh
uv run --no-project --default-index https://pypi.org/simple --with mcp==2.3.0 \
  python -B scripts/mcp_sdk_smoke.py
```

The official Python SDK needs Python 3.10+; it is a test-only optional dependency,
not a runtime requirement or package publication. One local SDK 2.3.0 smoke passed
initialize/list/call with exact i64 and native Complete/Error/Unknown, with no
top-level execution. This is measured interoperability with one client, not all
clients, external adoption, benchmark superiority or production readiness.
