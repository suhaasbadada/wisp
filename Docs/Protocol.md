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

`op` is `run`, `analyze`, `replay`, `archive`, `inspect-artifact`, or
`replay-artifact`; `source` is required (use `""` for inspection). Optional `focus`
selects Agent View (default first function); `budget` caps only Agent View text
UTF-8 bytes, default 4096, ceiling 65536. Optional `limits` fields: `source_bytes`,
`fuel`, `call_depth`, `evaluation_depth`, `output_bytes`, `allocation_bytes`, `cases`; omitted fields
use defaults from Language.md. Values are unsigned integers. Unknown fields are
rejected. Raw dispatch requests are capped at 1 MiB (1,048,576 UTF-8 bytes)
before JSON parsing; oversized or malformed requests return Request Error.
Transport counts accept unsigned 64-bit integers on both native and
WASM; limits and text budgets are clamped before host-sized use. Limits above
ceilings are clamped and reported. Optional `ghost` is a
receipt from a failed probe; required for replay. No persistent server state.

## Reports

Common: `compiler`, SHA-256 `revision` of exact source bytes, effective `limits`,
`status`, captured `output`, `diagnostics`, `probes`, `graph`. Successful checking
  also supplies `syntax_limits`, `agent_view` and `probe_metadata` (predicate and
  run dependency keys without executing probes). Diagnostics are
`{kind,message,span:{start,end}}`; kinds Request, Syntax, Type, Purity, Runtime,
Replay, Artifact, Limit. Compilation errors have empty output/probes/graph. Limit is
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
block text. The run dependency key additionally includes effective execution limits,
transitive function hashes, top-level statement kinds/bindings/expression text and
their transitive callees, and every preceding probe's property dependencies.
These prefixes account conservatively for shared fuel/allocation/case consumption.
An uncalled unrelated function can change without invalidating pricing evidence;
a prelude callee cannot. Replay keys include operation, property dependencies and
the exact replay input; they do not claim equivalence with full-domain run keys.
Source revision is separate. Domain or predicate
edits invalidate the specification identity, even if plausibly equivalent.

Fail creates a ghost `{revision,predicate_key,dependency_key,input,witness_id}`;
input is a decimal string. `witness_id` hashes the other fields. This is an
integrity/linkage receipt, **not authentication or proof of historical execution**.
The caller stores it unchanged. The core has no persistent archive or host IO;
explicit portable artifacts can carry historical source as described below.

```json
{"op":"replay","source":"<current complete source>","ghost":{"revision":"...","predicate_key":"...","dependency_key":"...","input":"9","witness_id":"..."}}
```

Replay checks the current whole program, validates receipt integrity, finds the
exact predicate/domain key and validates the input. Changed predicate/domain is
Replay Error, never silently substituted. Function-body edits are permitted.
Only the historical input executes, not top-level statements or the full domain.
Replay consumes one case and respects the same execution limits (zero case
budget returns Unknown without executing).
Report `replay` contains `historical` unchanged, current `revision`, current
`dependency_key`, `input`, `new_execution:true`, nullable `diagnostic`, and
`status: Pass|Fail|Error|Unknown`. Pass is **not** Clear. Historical failures never
become retroactive passes. Limits/configuration can differ: this is a new run.

## Portable single-ghost artifacts (version 1)

The exact file envelope has six required fields; unknown fields are rejected,
including inside `ghost` and `limits`:

```json
{"format":"wisp-ghost","version":1,"compiler":"wisp-0.1.0-semantics-4",
 "source":"<exact historical complete source>",
 "limits":{"source_bytes":65536,"fuel":100000,"call_depth":32,
           "evaluation_depth":128,"output_bytes":8192,
           "allocation_bytes":1048576,"cases":1000},
 "ghost":{"revision":"...","predicate_key":"...","dependency_key":"...",
          "input":"9","witness_id":"..."}}
```

`limits` must contain **all seven exact effective limits**. Missing fields,
unknown fields, negative/noninteger values and values above effective ceilings
are errors, not silently clamped archives. Normal run/analyze/replay limits
continue to default and clamp as before. Language integers remain decimal
strings, including extrema outside JavaScript's exact numeric range.

Operations (placeholders below stand for actual objects/strings, not paths):

```text
{"op":"archive","source":historicalSource,"ghost":run.probes[0].ghost,"limits":run.limits}
{"op":"inspect-artifact","source":"","artifact":artifact}
{"op":"replay-artifact","source":currentSource,"artifact":artifact,"limits":{"fuel":100000}}
```

- `archive` requires the historical receipt and full historical limits. It does
  not trust the supplied receipt; it validates exactly as inspection does.
- `inspect-artifact` validates the envelope/compiler, exact source revision and
  witness identity, then performs a fresh bounded **full historical run** with
  archived limits. A resulting failed probe must contain the exact same ghost
  (including dependency key and first failing input). A different failing input,
  a passing input, corrupted configuration, or an unreproducible claim cannot
  validate, even if the supplied witness hash has been recomputed. This checks
  the selected probe's first failure, not just whether its input can fail.
- Success is common report `status: Ready`, plus `artifact` unchanged and
  `validation: {status:"Ready",phase:"artifact",new_execution:true,note:...}`.
  The note explicitly says reproduction is not authentication or proof of
  history. Inspection/archive do not return historical output as current output.
- Failed validation returns Error (or Unknown when historical reproduction is
  resource-limited), with **no `artifact` or `replay` accepted**. Artifact
  validation diagnostics use kind Artifact; invalid JSON/schema uses Request.
  `validation.phase:"artifact"` marks validation failures after decoding.
- `replay-artifact` first validates the historical artifact using **archived**
  limits, then performs existing single-input replay against current source
  using **current** optional limits/defaults. It returns the immutable
  `artifact`, successful historical `validation`, and `new_execution:true`
  even if current checking/replay is Error or Unknown. Thus historical validation
  failure is distinguishable from a current source error. A normal replay result
  also contains existing `replay.historical` and `replay.new_execution:true`.
  Changed domain/predicate is still Replay Error; a repaired function may Pass,
  but that is not full-domain Clear. No nested operation is executed from data.

Artifacts are **unauthenticated**, not signatures, trusted execution logs or
proofs. A party can construct an artifact that reproduces; it cannot thereby
prove who ran it or when. Source may contain sensitive logic. Host clients own
explicit file IO and must not silently upload or persist artifacts. The Rust
language implementation gains no filesystem/network/host execution capability.
Compiler semantics identity remains unchanged: this adds transport/workflow,
not language semantics. Unsupported versions/compilers are errors; no migration.

Native commands, bounded file reading, output safety and exit codes are specified
in [CLI.md](CLI.md). Artifacts/files are capped at 1 MiB by native readers;
dispatch's request cap additionally applies to the full JSON envelope.

Deferred: version negotiation, persistent IDs, structured semantic edits, remote
storage, cache reuse, proof/solver results, property-specific slices, modules,
source-map line/column conveniences and independently signed execution receipts.
