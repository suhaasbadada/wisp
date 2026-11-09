# Native / WASM JSON protocol

`wisp::dispatch(&str) -> String` and wasm-bindgen `dispatch(request_json: string)`
are the same implementation. Crate/package `wisp`, cdylib + rlib; wasm-pack can
emit `web/pkg/wisp.js`. `cargo run -- examples/snacks.wisp` prints a JSON report.
`cargo run -- --json < request.json` accepts one request on stdin. CLI exit 2
means host IO/usage failure; semantic status is in JSON (CLI exit 0).

```json
{"op":"run","source":"print(1);","focus":"bill","budget":4096,
 "limits":{"fuel":100000,"cases":1000}}
```

`op` is `run`, `analyze`, or `replay`; `source` is required. Optional `focus`
selects Agent View (default first function); `budget` caps only Agent View text
UTF-8 bytes, default 4096, ceiling 65536. Optional `limits` fields: `source_bytes`,
`fuel`, `call_depth`, `output_bytes`, `allocation_bytes`, `cases`; omitted fields
use defaults from Language.md. Values are unsigned integers. Unknown fields are
rejected. Limits above ceilings are clamped and reported. Optional `ghost` is a
receipt from a failed probe; required for replay. No persistent server state.

## Reports

Common: `compiler`, SHA-256 `revision` of exact source bytes, effective `limits`,
`status`, captured `output`, `diagnostics`, `probes`, `graph`. Successful checking
also supplies `syntax_limits` and `agent_view`. Diagnostics are
`{kind,message,span:{start,end}}`; kinds Request, Syntax, Type, Purity, Runtime,
Replay, Limit. Compilation errors have empty output/probes/graph. Limit is
Unknown; other diagnostic kinds are Error. Diagnostic messages are human text,
not stable programmatic identifiers. Numeric JSON fields are bounded counters,
offsets and limits, **never language i64 values**.

- `analyze`: `status: Ready`; performs whole-program checking, not execution.
- `run`: `Complete` if top-level execution and all probes succeed (including zero
  probes); otherwise Error, Unknown or Fail, in that precedence. A Clear probe
  does not change top-level status to Clear. `usage` reports fuel,
  `logical_allocation_bytes`, `attempted_cases`.
- Each probe: `status: Clear|Fail|Error|Unknown`, `variable`, `domain` with decimal
  string `start`, `end` and `inclusive:true`, `span`, `predicate_key`,
  `dependency_key`, numeric `completed_cases`, nullable decimal-string
  `failing_input`, nullable `diagnostic`, nullable `ghost`, finite-only `claim`.
- Graph: `functions` with name, signature, definition/body byte spans, body and
  transitive hashes, dependency names (including self), conservative `pure`;
  `edges` are `{from,to,kind:"call"}`. `omissions` and `uncertainty` explain scope.
- Agent View: `focus`, `text`, `budget_bytes`, actual `used_bytes`,
  `required_bytes` before truncation, `overflow`, `omitted`, `uncertainty`.
  Includes focus body and transitive dependency boundary signatures, not their
  bodies. Truncates on UTF-8 boundaries; overflow can omit important facts. The
  JSON envelope/metadata is outside the text budget. No task relevance,
  completeness or minimality guarantee. Unknown focus returns an explicit
  no-match view, not a fabricated function.

## Identity and historical replay

Hashes are SHA-256 over versioned Rust JSON material. Function transitive hashes
include compiler identity, effective configuration and name-sorted exact source
slices for the function and every reachable callee. Unreachable branch calls
count. Whitespace edits inside dependencies may invalidate keys. Unrelated
function edits and source-offset shifts preserve a probe key. There is no cache
or incremental compilation; these are conservative invalidation identities.
Change `COMPILER` when changing semantics.

Predicate key includes compiler, input name, decimal endpoints, exact predicate
block text. Dependency key additionally includes effective execution limits and
the transitive function hashes. Source revision is separate. Domain or predicate
edits invalidate the specification identity, even if plausibly equivalent.

Fail creates a ghost `{revision,predicate_key,dependency_key,input,witness_id}`;
input is a decimal string. `witness_id` hashes the other fields. This is an
integrity/linkage receipt, **not authentication or proof of historical execution**.
The caller stores it unchanged. There is no source archive inside the core.

```json
{"op":"replay","source":"<current complete source>","ghost":{"revision":"...","predicate_key":"...","dependency_key":"...","input":"9","witness_id":"..."}}
```

Replay checks the current whole program, validates receipt integrity, finds the
exact predicate/domain key and validates the input. Changed predicate/domain is
Replay Error, never silently substituted. Function-body edits are permitted.
Only the historical input executes, not top-level statements or the full domain.
Report `replay` contains `historical` unchanged, current `revision`, current
`dependency_key`, `input`, `new_execution:true`, nullable `diagnostic`, and
`status: Pass|Fail|Error|Unknown`. Pass is **not** Clear. Historical failures never
become retroactive passes. Limits/configuration can differ: this is a new run.

Deferred: version negotiation, persistent IDs, structured semantic edits, remote
storage, cache reuse, proof/solver results, property-specific slices, modules,
source-map line/column conveniences and independently signed execution receipts.
