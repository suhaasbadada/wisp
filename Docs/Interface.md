# Checked callable interfaces v2

An agent or application can discover a saved project's callable boundaries
without parsing source/signature strings or executing policy code:

```sh
cargo build --locked
target/debug/wisp describe examples/policies/reservations-after.wisp
target/debug/wisp project describe examples/policies/project.json
python3 examples/policies/decisions.py
```

Shared Rust `op:"describe"` checks the entire source, then returns structured
function parameters, return types and nominal record fields. The native commands
only load explicit bounded files and call that operation. There is no second
language parser or TypeScript/Python type inference. The Python example consumes
the project description, checks its required boundary, and checks the adapter's
startup hashes match discovery before consuming decisions.

## Core contract

Request: `{"op":"describe","source":SOURCE,"limits":{...}}` (limits optional).
Only source and limits are supported. Existing function/args/change/candidate/suite
presence policies apply first; non-null focus/budget/ghost/artifact are rejected.
Existing nullable fields still treat null as absent, except `function:null`,
which remains an envelope Error everywhere. Unknown/duplicate fields and array
encodings are rejected by the shared strict object decoder.

A successful report includes compiler, exact source revision, effective limits,
`status:"Ready"`, empty output/probes/diagnostics and:

```json
{"interface":{"contract_version":2,"phase":"described","new_execution":false,
 "functions":[{"name":"decide",
   "parameters":[{"name":"order","type":{"kind":"Record","name":"Order"}}],
   "return_type":{"kind":"Bool"}}],
 "records":[{"name":"Order","fields":[
   {"name":"quantity","type":{"kind":"Int"}}
 ]}],
 "encodings":{"Int":"canonical_signed_i64_string","Bool":"JSON_boolean",
   "String":"JSON_string","Unit":"JSON_null","Record":"exact_field_object","List":"JSON_array"},
 "scope":"all checked global functions and nominal records; not an authorization allowlist, suite verification or property-specific relevance claim"}}
```

This illustrates a smaller source, not the reservation function's complete
signature. Types are tagged `{"kind":"Int"}`, Bool, String or
`{"kind":"Record","name":NAME}` or `{"kind":"List","element":TYPE}`,
recursively describing the element type; consumers need not parse type text. Unit's
encoding documents the internal value representation; it does **not** introduce
Unit declaration syntax (the current language cannot declare a Unit parameter or
return type). Function and record lists are sorted by name; parameter and record
field lists preserve declaration order. All global declarations are included,
not only a suite target or a property-relevant dependency closure.

Int data remains canonical signed-i64 **strings**, not JSON numbers. Record data
uses exact named fields, recursively following checked nonrecursive layouts.
List data uses JSON arrays at typed positions (including inside records), capped
at 1,024 elements per list and combined Record/List depth 16. Int elements remain
strings. Public signature/result type text uses brackets, e.g. `[InvoiceLine]`.
The descriptors are a versioned Wisp interface, not JSON Schema, code generation,
a new evaluator or a proof. Unknown interface versions/tags must not be guessed.

Parse/type/source-limit failures return existing diagnostics and Error/Unknown,
with `interface.{contract_version:2,phase:"preflight",new_execution:false}` and
**no invented function/record lists**. Earlier envelope failures may omit
`interface`. Unused/unreachable bad declarations still fail whole-program checking.
Ordinary runtime faults/recursion in well-typed code do not prevent discovery,
because no invocation, top-level statement or probe executes. There is no usage
or execution key. Compilation/reporting are outside machine fuel; zero execution
budgets do not mean compilation is free or absolutely time/memory bounded.

## Saved projects and session pinning

The compiler is semantics-7 and checked interface contract is v2. Project,
adapter, request, review and edit envelopes remain v1; their versions do not imply
cross-compiler compatibility or silently migrate old artifacts.

`project describe` uses existing bounded/confined project loading, with all files
loaded before checking and the stable trusted-parent limitation unchanged.
Its root status is Ready if all policies describe, otherwise Error before Unknown.
Every policy row is retained in sorted ID order, even after source errors.
The JSON has empty output/diagnostics and:

`project.{contract_version:1,mode:"describe",phase:"described",approval:"not_granted",
new_execution:false,manifest_hash,summary:{total,attempted_invocations:0},policies}`.

Rows have `id`, full `suite_file_hash`, and the original core description in
`report`. Phase described means checking finished, not every policy succeeded.
Inspect each row's status/diagnostics. A suite is loaded as bounded standalone
JSON but **not schema/expectation validated or executed** here; describe can be
Ready even with a null suite. Use `project verify` for those caller-owned examples.
No description command writes source/suites or grants approval.

Exit codes: 0 Ready, 1 Error, 3 Unknown, 2 host IO/config/usage. `describe FILE`
also accepts one source on stdin (`-`); manifests remain physical files.
Neither command supplies filesystem/network/process permissions to the language.

For application use, describe first, enforce the function/record boundary and
authorization you expect, then start `project serve`. Require its pinned manifest
and source hashes to match your description; if files changed, fail or explicitly
restart discovery rather than silently adopting them. This is caller-owned
compatibility checking, not trust/authorship authentication, deployment approval,
full-domain correctness, safe retry, or measured adoption/performance evidence.
