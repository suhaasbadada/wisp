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

`op` is `capabilities`, `run`, `call`, `edit`, `analyze`, `context`, `replay`, `archive`, `inspect-artifact`, or
`replay-artifact`; `source` is required (use `""` for inspection). Optional `focus`
selects Agent View (default first function), except `context` selects a probe as below; `budget` caps only the selected view's text
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
  for analyze/run/replay also supplies `syntax_limits`, `agent_view` and `probe_metadata` (predicate and
  run dependency keys without executing probes). Diagnostics are
`{code,kind,message,span:{start,end},path?}`; kinds Request, Input, Syntax, Type, Purity, Runtime,
Replay, Artifact, Limit. Compilation errors have empty output/probes/graph. Limit is
Unknown; other diagnostic kinds normally mean Error. Exceptions: blocked probes
remain Limit/Unknown after a top-level Runtime/Error, and bounded artifact
reproduction may be overall Unknown with an Artifact diagnostic. Do not derive
all report statuses from kind/code. Diagnostic messages are human text,
not stable programmatic identifiers. Codes and their exhaustive kind mappings
are pinned in diagnostic contract v1; new codes are additive and unknown codes
fall back to kind/status. See [Errors.md](Errors.md). Numeric JSON fields are bounded counters,
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
- Graph `records` is name-sorted: `{name,span,declaration_hash,fields}`; fields
  retain declaration order as `{name,type,span}` with language type names.
  Declaration hashes cover exact declaration slices, not offsets. Function
  signatures likewise use language names, never internal enum/index spellings.
- `syntax_limits` includes fixed `depth:64`, `tokens:8192`,
  `record_type_depth:16`, `record_value_depth:16`, `record_fields:32`.
- Agent View: `focus`, `text`, `budget_bytes`, actual `used_bytes`,
  `required_bytes` before truncation, `overflow`, `omitted`, `uncertainty`.
  Includes conservative record declaration text, focus body and transitive
  dependency boundary signatures, not their
  bodies. Truncates on UTF-8 boundaries; overflow can omit important facts. The
  JSON envelope/metadata is outside the text budget. No task relevance,
  completeness or minimality guarantee. Unknown focus returns an explicit
  no-match view, not a fabricated function. Record text shares the byte budget;
  overflow explicitly warns that record declarations may be truncated.

## Explicit probe context (contract version 1)

```json
{"op":"context","source":"probe n in 0..=0 { true }","focus":"probe:0","budget":4096}
```

This is compiler metadata, **not a passing probe result**. No Machine is created.
All source, type and purity checks apply to the whole program, including unused
functions and unreachable branches, before selector validation. Missing/null
`focus` defaults to `probe:0`. Explicit selectors are canonical zero-based
`probe:INDEX`: ASCII unsigned decimal, no sign, leading zeros (except `0`),
whitespace or integer overflow. Wrong kind, empty, missing probe and out-of-range
selection return `E_CONTEXT_SELECTOR`, Request/Error, `/focus`, source sentinel
`0..0`; no fallback. Source/check/limit diagnostics retain precedence.

Successful root fields are exactly `compiler`, `revision`, `limits`, `status`,
`new_execution`, `output`, `probes`, `diagnostics`, `probe_metadata`, `graph`,
`context`. `status` is `Ready`, `new_execution:false`, `output:""`, `probes:[]`,
`diagnostics:[]`; `usage` is absent. `probe_metadata` and `graph` have the existing
analyze meanings. Legacy function `agent_view` is unchanged and is not returned
by this operation. Context payload fields:

- `version:1`, `query_key` (SHA-256), `selector` (canonical string).
- `selected_probe:{index,variable,domain:{start,end,inclusive:true},span,predicate_key,dependency_key}`.
  Domain endpoints are i64 decimal **strings**. Span is the full selected probe's
  half-open UTF-8 source-byte span. Predicate key is the existing predicate key;
  dependency key is exactly the existing **run** key at this index, also exposed
  in analyze's `probe_metadata` (not the narrower standalone predicate dependency).
- `text`, `budget_bytes`, `used_bytes`, `required_bytes`, `overflow`.
- `ledger`, `scope_omissions`, `provenance:"compiler-derived"`, explanatory
  strings `budget_scope`, `identity_scope`, arrays `assumptions`, `unknowns`,
  and empty arrays `observations`, `proofs`.

TEXT candidate priority: exact full selected probe source slice, all record
declarations sorted by name (conservative type boundary), then full function
definitions (including signatures) in the probe's syntactic transitive call
closure, sorted by name. Closure is cycle-safe/deduplicated and includes calls
in dead branches, initializer expressions and projection receivers. Every
chunk is its exact source slice followed by **two newline bytes**, even the
last chunk. Atomic-prefix selection never truncates a chunk or UTF-8 sequence:
the first non-fitting eligible chunk stops selection; later eligible chunks
remain omitted even when smaller. If the probe cannot fit, TEXT is empty.

`budget` is u64, default 4096, clamped to 65536 before host conversion. Zero or
overflow still gives Ready metadata, not Unknown. `used_bytes == text.len()`
in UTF-8 bytes. `required_bytes` sums eligible source-slice lengths plus two
bytes per chunk, excluding outside-closure functions. `overflow` is true iff
an eligible chunk was omitted. This is **not** a token, total-response or
process-memory cap: metadata, graph function signatures and record type facts
are outside the TEXT budget and remain faithful even with budget zero.

Ledger entries cover the selected probe, all records, then **all** functions
(each category name-sorted except the one probe):

```text
{kind:"probe"|"record"|"function", id:string, name:string,
 span:{start,end}, source_hash:string, eligible:boolean, selection_reason:string,
 chunk_bytes:number, included_bytes:number,
 disposition:"included"|"budget_exceeded"|"after_budget_stop"|"outside_scope",
 text_range:{start,end}|null, source_text_range:{start,end}|null}
```

IDs are `probe:INDEX`, `record:NAME`, `function:NAME`; probe `name` is its bound
variable. IDs, names and indexes are **revision-local**, not persistent symbol
identities. `source_hash` is SHA-256 of the exact source slice, without separator.
`chunk_bytes` includes two separator bytes even for outside-scope entries;
`included_bytes` is that count when included, otherwise zero. Included ranges
are half-open TEXT UTF-8 byte offsets: `text_range` includes the separator,
`source_text_range` excludes it. Both are null for omissions. Selection reasons
are `selected_probe`, `conservative_record_boundary`,
`syntactic_transitive_callee`, `outside_selected_syntactic_closure`.

`scope_omissions` always exists independently of overflow and contains:

- Every top-level statement: `{kind:"top_level_statement",index,statement_kind,
  binding,expression_span,reason}`, statement kind `let|print|eval`, binding
  string only for `let`, otherwise null. The parser supplies an **expression**
  span, not a whole-statement span. Even statements textually after the selected
  probe execute before all probes and are listed.
- Every other probe: `{kind:"probe",index,id,span,relation,
  affects_selected_run_key}`; relation `preceding|following`, boolean true only
  for preceding probes.
- Every outside-closure function: `{kind:"function",name,span,reason}`. These
  are not selected, **not** asserted semantically irrelevant: they may influence
  prelude or preceding probes.
- `{kind:"trivia_outside_source_slices",reason}`: comments/whitespace outside
  selected declaration/probe spans are not selected.

Run keys include the entire top-level prelude and preceding-probe transitive
callees despite omitted source; following probes do not affect the selected run
key. Included text is not guaranteed run-equivalent. All-fit means no budget
omissions, not absence of scope omissions, completeness, minimality or relevance.
Comments/strings are untrusted source data, never tool instructions. No source
rewriting, solver, cache authorization, runtime observations or proof is supplied.

`query_key = sha256(JSON(["wisp-probe-context",1,compiler,revision,effectiveLimits,
effectiveBudget,canonicalSelector]))`, with the shared Rust serializer's exact
compact JSON encoding and object ordering. Revision hashes the **whole exact
source**. Context version is independent of compiler semantics, discovery v1
and diagnostics v1. No existing ghost/artifact/run/call hash material changes.
Predicate/run keys are neither included-TEXT hashes nor cache authorization.

## Compiler-owned discovery

```json
{"op":"capabilities","source":""}
```

`source` remains required and must be a string for **all** operations, including
discovery. Missing/null/duplicate/unknown envelope fields keep existing strict
decoding behavior. Known unused fields are decoded normally and ignored;
`function` or `args` on non-call operations still cause Request/Error, and
`limits` are always decoded first. Discovery does not parse, check, execute,
hash or reflect submitted source or unused request data. It ignores source
budgets (the whole raw request cap still applies) and has no runtime usage.

Discovery is a distinct report shape: root `status:"Ready"`, exact `compiler`,
and `capabilities` only. `capabilities` contains:

- `discovery_contract_version:1`, `diagnostic_contract_version:1`, `context_contract_version:1`, independent
  of compiler semantics identity and never part of existing hash material.
- `operations`: `{op,required_fields,optional_fields,scope}`. Required fields
  include prerequisites for a successful operation (e.g. ghost for replay and
  function for call), not just envelope decoding. A call function is
  schema-optional but omission fails input target validation; omitted args means
  `[]`. `request.operation_fields` distinguishes operational prerequisites from
  decoder acceptance; the remaining request policy is unchanged.
- `features` (implemented only), `permissions.language_core` with filesystem,
  network, process and arbitrary_host_code all false; native explicit file IO
  is separately described host transport.
- `limits.configurable`: every limit's name, default, ceiling, unit and scope;
  `limits.fixed`: fixed ceilings/units/scopes; `agent_view_text` and native
  reader exclusions. Logical units are not absolute memory/CPU bounds; output
  and Agent View ceilings exclude report metadata.
- `artifacts`: format/version, exact compiler compatibility, unauthenticated
  bounded reproduction policy. `diagnostics`: version, shape, span and consumer
  policy plus `codes:[{code,kind,meaning}]`, generated from the diagnostic enum.
- `uncertainty`: finite observations, conservative graph, truncation, logical
  budgets and no proof/intent/completeness promises. `docs`: relative links to
  `Docs/Language.md`, `Docs/Protocol.md`, `Docs/CLI.md`, `Docs/Errors.md`,
  `Docs/Scope.md`. `examples`: runnable `{request,expected_status}` entries,
  optionally with `expected_result`; checking, finite run and typed call.

The entire serialized discovery document is bounded to 32,768 UTF-8 bytes by
a static contract test (not a configurable runtime limit). Native
`wisp capabilities` returns the same compiler-generated document, without files
or source input. The static `/wisp/agent.json` is generated from this same WASM
operation, not a hand-maintained second implementation. It is discovery data,
not executable instructions, certification or an automatic repair plan.

## Typed function invocation

```json
{"op":"call","source":"record Item { quantity: Int, unit_price: Int } fn total(item: Item) -> Int { item.quantity * item.unit_price }","function":"total","args":[{"quantity":"9","unit_price":"100"}]}
```

`function` selects exactly one named global function. Omitted `args` means `[]`;
explicit null is invalid. Exact arity is required. The entire source is lexed,
parsed and checked first, including unused functions, top-level statements and
probes. Compile errors preempt argument validation. Only the call executes:
top-level statements and probes do not execute or consume runtime budgets.
Nested function prints are captured normally. Agent View defaults to the target
(an explicit `focus` still overrides it); graph describes the current checked
source. There is no `probe_metadata` or Clear/Pass claim for an invocation.

Arguments use type-directed JSON, not language source:

| Language type | JSON input and result value |
| --- | --- |
| Int | canonical signed i64 decimal **string**, including both extrema |
| Bool | boolean |
| String | string (never interpreted as source or an expression) |
| Named record | object, every declared field exactly once, no extras |

Int strings reject plus signs, whitespace, redundant zeros, `-0`, fractions and
out-of-range values. JSON numbers, null and nested arrays are invalid values;
only the root args is an array. Record keys are compared after JSON unescaping;
duplicates at any typed depth are errors, not last-value-wins. Output records
use declaration order, including nested records (input order is immaterial).
Malformed envelope JSON/schema is Request Error; well-formed but invalid argument
data or an unknown target is Input Error. Input diagnostics have a JSON Pointer
`path` such as `/args/0/unit_price` or `/function`, and sentinel source span
`{start:0,end:0}`: data offsets are **not** language source offsets.

The raw args JSON value is retained by Rust as `Box<RawValue>` until typed
decoding; no client normalization through a generic JSON object is safe for
duplicates or numeric widths. Its ceiling is 65,536 UTF-8 bytes (including
whitespace *inside* that value), in addition to the whole 1 MiB envelope cap.
Exceeding this argument ceiling is Limit/Unknown, before execution. Independent
JSON nesting ceiling is 17 containers (root array plus up to 16 record objects).
Declared record and runtime value depth ceilings remain 16. Host clients should
bound their raw files/text before constructing a request too.

Reports after a decodable call request include
`invocation:{target,new_execution:false}` on checking/input failure, or
`invocation:{target,new_execution:true,execution_key}` once shared evaluation
begins, even if argument construction or execution immediately reaches a limit.
Schema/limits decoding errors can precede this marker. Success is `status:Complete`
plus top-level `result:{type:"Int",value:"900"}` in this example. On Error or
Unknown there is **no** result, even if encoding had partially progressed.
Previously completed captured prints remain in `output` on execution/encoding
failure. `usage` reports fuel, logical allocation bytes and `attempted_cases:0`.
This is observed execution of one input, not a finite domain check or proof.

Input decoding constructs literal ASTs only, independently bounded by raw bytes
and nesting. Evaluation, string/record construction, parameter binding, scope
copies and value traversal use the existing shared machine's fuel, allocation
and depth accounting unchanged. Result encoding visits every value (one fuel
per node) and charges one fuel and one logical allocation byte per emitted JSON
byte, including record keys, punctuation and escapes. The encoded **value** and
captured print share `output_bytes`; result type/envelope/metadata are outside
that ceiling. Every emitted chunk is checked before append; no oversized
serialized intermediate or partial result is accepted. Faults are Error;
fuel/allocation/depth/output exhaustion is Unknown. No host IO is available.

The execution key hashes `[COMPILER,"call",effective_limits,target,raw_args,
target_transitive_hash]` using Rust JSON material and SHA-256. Exact raw input
material (including internal whitespace/field order) contributes, conservatively;
missing args and explicit `[]` have the same material. Target transitive hashes
already include compiler/config, reachable function source slices and **all**
record declarations. Changed input, callee, record or effective config invalidates
the key; an unrelated uncalled function or incidental offset shift need not.
Source revision is separate. No cache or cross-key reuse is implemented. This
additive host operation retains compiler **semantics-5** and existing run,
replay and artifact hash material/acceptance unchanged.

## Identity and historical replay

Hashes are SHA-256 over versioned Rust JSON material. Function transitive hashes
include compiler identity, effective configuration and name-sorted exact source
slices for the function and every reachable callee, and all name-sorted exact
record declaration slices (including unused records). Unreachable branch calls
count. Whitespace edits inside dependencies may invalidate keys. Unrelated
function edits and source-offset shifts preserve a probe key. There is no cache
or incremental compilation; these are conservative invalidation identities.
Change `COMPILER` when changing semantics.

Predicate key includes compiler, input name, decimal endpoints, exact predicate
block text. The run dependency key additionally includes effective execution limits,
transitive function hashes, top-level statement kinds/bindings/expression text and
their transitive callees, and every preceding probe's property dependencies.
All record declarations contribute directly to every property dependency and
the run prefix, even for a probe with no function calls. A record-only edit
invalidates dependencies without changing predicate identity. Offsets outside
declarations are not hashed. This is conservative invalidation, not a claim of
minimal type relevance or persistent/stable symbol IDs.
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

Native and browser clients preserve raw artifact JSON through shared Rust schema
decoding; duplicate fields are errors, not last-value-wins normalization. File
input must be valid UTF-8; a BOM is not silently stripped before JSON decoding.

```json
{"format":"wisp-ghost","version":1,"compiler":"wisp-0.1.0-semantics-6",
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
Compiler identity is now `wisp-0.1.0-semantics-6`: tail-call frame reuse and
copy-eliding scope/projection accounting change bounded execution outcomes.
Envelope schema version remains 1. Earlier compiler artifacts (including semantics-5) are
explicitly rejected **before historical execution** (`validation.new_execution:
false`); there is no migration or silent reinterpretation. Unsupported envelope
versions are also errors.

Semantics-6 keeps the same source grammar, type rules, value meanings, permission
boundary and configurable ceilings. Proper direct/mutual tail calls apply only
to function return positions through final block expressions and selected `if`
branches. Argument evaluation stays left-to-right/non-tail; non-tail calls stay
depth-bounded. Fuel/allocation remain cumulative. See [Language](Language.md) for
copy-elision costs and scope cleanup. Existing archived semantics-5 artifacts and
context fixtures remain historical data; fresh semantics-6 fixtures are separate.
Source revision hashes still identify exact bytes; compiler-dependent evidence,
invocation and context identities change rather than authorizing cross-version reuse.

Native commands, bounded file reading, output safety and exit codes are specified
in [CLI.md](CLI.md). Artifacts/files are capped at 1 MiB by native readers;
dispatch's request cap additionally applies to the full JSON envelope.

Deferred: version negotiation, persistent IDs, general structured semantic edits, remote
storage, cache reuse, proof/solver results, property-specific slices, modules,
source-map line/column conveniences and independently signed execution receipts.

## Guarded function-body preparation (edit contract v1)

```json
{"op":"edit","source":"fn twice(n: Int) -> Int { n * 2 }","focus":"twice",
 "change":{"expected_revision":"f59809bffc2adfed70f4dbc000d5bb7223b50359189a05c1fa312a0f017f86c7",
 "expected_body_hash":"64cd3cbb8f071e01a74d17007ab3df19b7d47332bf133633a0f8171e92b50928",
 "replacement":"{ n + n }"}}
```

Core **prepares data only**. It does not apply edits, execute a Machine, observe
probes, charge runtime usage, repair invalid baselines, or prove behavior/intent.
`focus` is a required nonempty global function name, never the first function by
default. Names are revision-local, not persistent symbol IDs. `change` preserves
presence: on every other operation, even `change:null` is `E_REQUEST_INVALID`,
before early call dispatch. For edit it is a strict object of the three required
strings shown above: missing, duplicate (including escaped names), null, wrong-type
and unknown members are rejected. Hashes must be exactly 64 lowercase hex digits.
`function`/`args` remain call-only; edit rejects non-null budget/ghost/artifact.
Legacy null handling of these preexisting optional fields remains unchanged.

Precedence is transport/envelope schema → limits decoding → operation fields,
change schema, explicit focus and hash form → baseline effective source-byte cap,
parse and **whole-program** checking → exact revision guard → unique global
target → exact body hash guard → replacement cap/standalone block syntax →
combined candidate cap/parse/check → preservation audit. Thus invalid baseline
code (including an unused function or impure probe) preempts stale guards and
cannot be repaired here. Limits are clamped as before.

Replacement is at most 65,536 UTF-8 bytes, including outer whitespace. The real
Rust `Parser::block`, EOF check and shared iterative AST-depth validator are used.
Every raw character outside the parsed brace span must satisfy the lexer's
`char::is_whitespace`; leading/trailing comments are rejected even when terminated.
Comments and brace-looking strings inside the block are allowed. No additional
expression, block or definition is accepted. Candidate size is checked against
effective `source_bytes` **before allocation**. Construction is exactly original
prefix + submitted replacement + original suffix: no trimming, formatting,
newline insertion or line-ending normalization.

Success has only root `compiler`, baseline `revision`, effective `limits`,
`status:"Ready"`, `new_execution:false`, `output:""`, `probes:[]`,
`diagnostics:[]`, and `edit`:

```text
{version:1, state:"prepared", target,
 base_revision, candidate_revision, base_body_hash, candidate_body_hash,
 base_body_span:{start,end}, candidate_body_span:{start,end},
 insertion_range:{start,end}, source: exactCandidateSource,
 preservation:{checked:true,prefix:true,suffix:true,signature:true,records:true,
   other_functions:true,top_level_statements:true,
   probes:[{index,predicate_key,text_preserved:true,domain_preserved:true}, ...]}}
```

All ranges are half-open UTF-8 byte offsets. Base body span belongs to baseline;
candidate body span and insertion range belong to candidate. The insertion range
includes all submitted whitespace; candidate body hash covers only parsed braces,
exactly matching analyze metadata. Immutable original header bytes and canonical
signature are preserved; leading whitespace may extend the parsed candidate
header range, so identical raw parsed header slices are **not** claimed. The
audit checks exact prefix/suffix, record declarations, other functions, top-level
expressions, and every indexed probe's text/domain/predicate key (including
duplicates). Dependency keys and offsets may change legitimately. There is no
root candidate graph or fabricated base span. A type-correct runtime fault or a
body that breaks a probe can be Ready, even with fuel zero. Probe text preservation
does not preserve every human requirement; comments inside the body are explicitly
under the replacement author's control. Review the diff and run acceptance tests.

Failures never contain `edit.source` or a prepared state. Root revision always
identifies the baseline. Baseline diagnostics retain baseline spans. Replacement
syntax errors use root Input `E_EDIT_REPLACEMENT`, `/change/replacement`, sentinel
`0..0`, plus `edit:{version:1,cause:{document:"replacement",revision,
diagnostics}}` with replacement-relative diagnostics and replacement hash.
Candidate parse/type/purity/audit errors use root Input `E_EDIT_CANDIDATE` at the
same sentinel/path, plus `edit.rejected_candidate:{document:"candidate",source,
revision,diagnostics}`. This source is **rejected**, never accepted editor content;
its diagnostics own candidate byte offsets, potentially in an unchanged downstream
probe whose offset shifted. Clients must not underline those offsets in baseline.
Resource exhaustion remains **Unknown with its original E_LIMIT_* code, kind and
reason**, using the same tagged document detail, not a generic edit Error.
Candidate-size preflight has no allocated candidate: it uses
`edit.cause:{document:"candidate",phase:"size_preflight",diagnostics}` without
candidate source/revision. Root nonbaseline diagnostics use the data path/sentinel.
Schema and guard failures use Request codes; see [Errors.md](Errors.md).

Edit version1, diagnostic/discovery/context versions and compiler semantics-5
are independent. Discovery advertises this checked-baseline/body-only scope and
a runnable fifth example. No existing artifact, invocation or dependency hash
material includes discovery features. Hosts independently guard application;
native create-new behavior is in [CLI.md](CLI.md). Treat responses as untrusted
transport data and review candidate content before explicitly applying it.
## Policy review contract v1

`{"op":"review","source":BEFORE,"candidate":AFTER,"suite":SUITE,"limits":{...}}`
compares explicit caller-owned cases using the shared Rust invocation engine.
Both sources are required strings. Candidate and suite presence (including null)
is rejected on every other operation before early call/discovery dispatch.
Review rejects args/change presence and non-null function/focus/budget/ghost/artifact.
Legacy nullable focus/budget/ghost/artifact treat null as absent. Explicit
`function:null` remains an envelope Error on every operation, as before review.

Suite objects are strict (no unknown, missing, null or duplicate members):
`{"version":1,"target":"twice","cases":[{"id":"positive","args":["2"],"expect":{"result":{"type":"Int","value":"4"},"output":""}}]}`.
Args and expected values retain raw JSON through typed validation, including
duplicate keys. IDs are unique ASCII `[A-Za-z0-9_-]{1,64}`. There must be 1–16
cases (zero: Request/Error; 17: Limit/Unknown). Retained suite JSON is at most
65,536 UTF-8 bytes, excluding outer whitespace; expected output is an exact
mandatory string of at most 8,192 UTF-8 bytes. No newline normalization.

Precedence: transport/envelope, limits, operation fields and suite cap/schema,
version/count/IDs, both independent source caps, whole baseline parse/check,
whole candidate parse/check, target boundary, all args on both programs and all
typed expectations, then execution. Every preflight failure creates zero
Machines and returns no partial cases. Target signatures include parameter
names. Recursively reachable nominal records must have identical ordered
fields/types; unrelated records, trivia and declaration placement are ignored.
Expected type is the checked candidate return type; no evaluation decodes it.

Each case executes baseline then candidate, each with fresh effective runtime
limits (at most 32 invocations). No top-level statements/probes run. `limits.cases`
remains the probe budget. Existing raw-args call execution identities are unchanged.
Complete results compare typed values plus exact output, ignoring JSON object
order/escape spelling. Complete/Complete is Changed or Unchanged; baseline
Error/candidate Complete is Changed with `baseline_fault_repaired`; candidate
Error is Faulted, except any-side Unknown makes comparison Unknown.
Candidate expectation independently reports Pass/Fail/Error/Unknown.
Root precedence: candidate Error, either-side Unknown, expectation Fail, Pass.
All cases continue after runtime faults. Baseline faults remain visible; baseline
Unknown cannot Pass. Finite matching examples are not equivalence or intent proof.

Root fields include compiler, baseline revision, effective limits, status,
`output:""`, `probes:[]`, diagnostics, and `review`:
- `contract_version:1`, `phase:"preflight"|"executed"`,
  `approval:"not_granted"`, `new_execution`;
- `baseline_revision`, `candidate_revision`, retained `suite_hash`, and
  domain-separated `query_key` hashing version/compiler/both revisions/suite/limits;
- `target` after execution and `cases` (empty on preflight failure);
- executed `summary`: total, changed, unchanged, faulted, unknown,
  expectation_pass/fail/error/unknown, attempted_invocations.

Each case is `{id,index,comparison,comparison_reason,expectation,expected,before,after}`.
Expected holds typed result and output. Before/after slim observations carry
document (`baseline`/`candidate`), status, revision, new_execution, invocation
(target, execution_key, new_execution), output, diagnostics, and optional result
and attempted usage. No source echo, repeated graphs/Agent Views, root usage or
fictional probes. Nested result object keys may serialize sorted.
Preflight `review.diagnostic_document` owns source failures. Candidate roots use
`/candidate` sentinel diagnostics; `review.cause` retains document and original
diagnostic spans. Suite pointers own input failures. Non-limit invalid expectations
use E_REVIEW_EXPECTATION plus tagged suite cause; resource reasons stay original
Limit/Unknown. Executed diagnostics remain source-owned inside observations.

Suite argument/expectation failures set `diagnostic_document:"suite"`; argument
schema origin may be retained separately as `argument_schema_document`. Expected
depth limits retain their tagged suite cause and original Limit reason. Comparison
reasons are `incomplete_execution`, `candidate_fault`, `baseline_fault_repaired`
or `observed_result_and_output`; they describe observations, never approval.
# Object-only wire schemas

Request, limits, ghost, artifact, edit change, review suite, case, expectation and
expected-result schemas require JSON objects. Positional arrays are not alternate
struct encodings. Map-only decoding preserves duplicate/unknown-field rejection,
raw args and legacy nullable fields. An implementation gap previously admitted
Serde's positional form; it is now rejected before execution at the owning schema
boundary, with existing Request/Artifact/Edit/Review diagnostics. Valid object
reports and semantics-5 identities are unchanged; this is a wire validation fix,
not new language behavior.
# Checked callable interfaces

`{"op":"describe","source":SOURCE,"limits":{...}}` returns interface contract
v1: structured function parameters/return types and nominal record field types,
all compiler-owned after whole-program checking, with no execution. See
[Interface](Interface.md) for exact tags, ordering, preflight failures, envelope
restrictions and native saved-project orchestration. This additive operation
does not alter existing graph/context reports or semantics-5 identity material.
