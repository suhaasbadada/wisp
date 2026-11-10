# Native CLI

Selected saved cases: `wisp project verify-policy MANIFEST POLICY` accepts the
same all-or-none `--expected-*` snapshot pins as focus, executes finite saved
cases through shared Rust review, and returns Pass/Fail/Error/Unknown. See
[Projects](Projects.md); finite Pass is not approval or whole-project acceptance.

Saved-function context: `wisp project focus MANIFEST POLICY FUNCTION [--budget N]`
with optional all-or-none `--expected-manifest HASH --expected-revision HASH
--expected-suite HASH --expected-compiler ID`. See [Projects](Projects.md) for
snapshot guards, reports, exits and nonexecution/text-budget limits.

Build with `cargo build`; use `target/debug/wisp` or `cargo run --`.
All commands emit one structured JSON report on stdout, not evaluated source or
plain program output. Captured program output lives in the report's `output`.
`--help` (also `-h`) prints usage and exits 0.

```sh
wisp capabilities                             # Ready, exit 0; no files/execution
wisp run examples/snacks.wisp                  # Fail, exit 1
wisp check examples/snacks.wisp                # Ready, exit 0; no execution
wisp focus examples/snacks.wisp bill --budget 4096
wisp context examples/snacks.wisp --probe 0 --budget 4096
wisp call examples/invoice.wisp total --args-file item.json
wisp edit input.wisp twice --replacement-file body.wisp --expected-revision SHA --expected-body SHA --out candidate.wisp
wisp archive examples/snacks.wisp --out failure.json --probe 0
wisp inspect failure.json
wisp replay examples/snacks-repaired.wisp --artifact failure.json
```

`run FILE` executes the checked program/probes. `check FILE` only checks and
returns metadata. `focus FILE FUNCTION [--budget N]` only checks and selects an
explicit Agent View; it never executes top-level print, probes or language
expressions on the host. Missing functions return Error. The report's
`agent_view.focus` names the actual selection; `overflow`, `required_bytes` and
`used_bytes` truthfully describe UTF-8 text truncation. Budget is an unsigned
integer (default 4096, effective ceiling 65536), not a completeness guarantee.

`wisp capabilities` reads no source/files and returns the compiler-generated
bounded discovery document, including operation/limit/permission metadata,
diagnostic codes and runnable examples. It is the same response as
`{"op":"capabilities","source":""}` via `--json` or WASM; see
[Protocol.md](Protocol.md#compiler-owned-discovery). Diagnostic contract v1 adds
stable `code` alongside unchanged human message, legacy kind, source span and
optional path. See [Errors.md](Errors.md) for taxonomy and unknown-code fallback.
Native focus/archive-selection diagnostics also carry explicit codes. Host
usage/IO failures still use stderr/exit 2 without guaranteed JSON, and legacy
`--json` semantic statuses still exit 0.

## Guarded function-body preparation

`wisp edit FILE FUNCTION --replacement-file BODY --expected-revision SHA
--expected-body SHA --out NEWFILE` uses shared Rust edit contract v1. All four
flags are required, once each, in any order. Unknown/duplicate/missing flags or
values are usage errors (stderr/exit 2). Hash validation is shared semantic
validation (Error/exit 1), not a host shortcut. There is no inline replacement
flag: body contents need not appear in command arguments. Source and replacement
are bounded UTF-8 file inputs (65,536 bytes, reading at most cap+1); either may
be `-`, never both. Oversize, invalid UTF-8 and reader failures are exit 2.

The core checks an already-valid whole baseline, guards exact source revision
and exact function body hash, parses one replacement block, checks the combined
candidate and audits preservation. **Ready/exit 0 means checked preparation,
not execution or passing probes.** No runtime/probe observations are made, even
when fuel is zero. Review differences and run acceptance tests separately. See
[Protocol.md](Protocol.md#guarded-function-body-preparation-edit-contract-v1)
for exact precedence, whitespace, hashes, spans and rejected-document provenance.

Only after Ready does the native host exclusively create `NEWFILE` using
`create_new`; existing files, source paths, directories and symlinks are never
overwritten or followed for output. It writes exactly prepared UTF-8 candidate
bytes, with **no extra newline**, then flushes. The source is never mutated.
Semantic rejection creates no output file: Error exits 1; Unknown exits 3.
Open/write/flush failures exit 2 on stderr without a success JSON report; a
partially written new file may remain after write/flush failure. Success emits
the prepared JSON report only after writing succeeds. This is explicit host IO,
not a language-core filesystem capability or automatic application to the source.
Legacy `--json` prepares only and retains semantic exit 0; it never writes files.

**Strict parsed-body clients:** outer replacement whitespace is permitted and
belongs to `insertion_range`, not `candidate_body_span`. A valid edit can add a
newline outside the parsed braces. If your consumer requires every byte outside
the parsed body unchanged, submit only the brace-to-brace block and independently
check exact recomposition. The core audit does not impose that stricter rule.
See the observed workflow failure in [Evaluation.md](Evaluation.md).

## Probe context

`wisp context FILE --probe INDEX [--budget N]` emits structured compiler metadata
on stdout, never writes files and never executes language code. `FILE` may be
`-` for stdin; existing bounded UTF-8 source readers apply. `--probe` is required;
flags may be in either order, once each. Missing/duplicate/unknown options and
invalid u64 budgets are usage errors (exit 2). Index text is passed unchanged to
the shared `probe:INDEX` validator: canonical unsigned decimal, zero-based,
no signs/redundant zeros/overflow. Invalid or nonexistent selectors are
`E_CONTEXT_SELECTOR` Request/Error (exit 1), never silently substituted. Whole
program checking takes precedence over selector errors.

Success is **Ready metadata, not a passing result** (exit 0), `new_execution:false`,
empty output/probe observations and no runtime usage. Context contract v1 is
separate from compiler semantics-5 and diagnostics/discovery v1. Existing
function `focus`/Agent View behavior is unchanged.

`context.text` contains exact full probe, all name-sorted record declarations,
then name-sorted syntactically reachable full functions, each with two charged
newline bytes. Budget defaults to 4096 UTF-8 bytes, clamps at 65536 (u64 input).
Only a whole-chunk prefix is included; no partial UTF-8 or skipping large chunks
to fit smaller later chunks. Budget zero/overflow is still Ready. The byte ledger
lists included and omitted candidates; separate scope omissions always include
top-level statements (even textually later), other probes, outside-closure
functions and trivia. All-fit is not complete context; included source is not
guaranteed run-equivalent. Metadata/signatures/types remain outside the TEXT
budget, which is not a token/total-response cap. Source comments/strings are
untrusted data, not tool instructions. See [Protocol.md](Protocol.md#explicit-probe-context-contract-version-1)
for exact schema, ranges and query/predicate/run key distinctions.

## Typed calls

`wisp call FILE FUNCTION [--args-file INPUT]` checks the entire source, then
executes only the selected global function: no top-level statements or probes.
Function-internal print remains captured and bounded. No arguments file means
`[]` (exact arity still required). For the existing `examples/invoice.wisp`
function `total`, an `item.json` containing
`[{"quantity":"9","unit_price":"100"}]` yields a typed Int result value
`"900"`; this is the same program and language syntax, not generated source.
See [Protocol.md](Protocol.md#typed-function-invocation) for strict primitive and
nested record encoding, input error paths, result shape and execution identities.

`INPUT` is a UTF-8 local file or `-` stdin. `FILE` may likewise be `-`, but both
cannot consume stdin in one call (usage error, exit 2). There is deliberately no
inline `--args` option: do not place potentially sensitive JSON in process
arguments. The CLI does not upload, persist, modify or echo the input file.
Language prints/results may of course disclose data explicitly used by source.

The reader consumes at most 65,537 bytes; files exceeding 65,536 bytes, invalid
UTF-8 and missing/unreadable files are host errors (exit 2). Valid standalone
JSON is preserved raw when embedded in the request so duplicate fields and
numeric widths reach the shared decoder unchanged. Invalid standalone JSON is
never interpolated into the request: it is represented as null args for a shared
Input Error (exit 1). Thus malformed text cannot inject envelope fields. Source
checking errors can preempt that input error. Core dispatch independently caps
the raw argument value at 65,536 bytes (Limit/Unknown; explicit command exit 3),
and the full escaped request at 1 MiB (Request Error). These differ from the
CLI's host file limit, which includes leading/trailing whitespace too.

Success is Complete (exit 0), not Clear. Error exits 1, Unknown exits 3; usage/IO
exits 2, as for other explicit commands. No partial result is emitted on an
interrupted call; previously completed prints remain captured. `--json` can
express custom limits and retains its legacy exit-code behavior.

`archive FILE --out ARTIFACT [--probe INDEX]` runs the source, selects the
zero-based probe (default 0), and passes its ghost and the run's **effective**
limits to the Rust archive operation for bounded reproduction. Missing or
non-failed selected probes return Error; resource-limited execution without a
ghost returns Unknown. It exports exactly one artifact, not the report wrapper.
The historical source is included: review it for sensitive business logic before
sharing. `--out` and `--probe` may appear in either order, once each.

Output uses exclusive `create_new`: existing files (including the source file
and symlinks) are **never overwritten**. File creation/write failures exit 2,
with stderr and no success report on stdout. A partial file may remain after a
write failure; choose another path or inspect/remove that file explicitly.
Archive and replay never modify source files. `--out -` names a literal file,
not stdout, because stdout is reserved for the structured report.

`inspect ARTIFACT` validates and re-executes historical source with its exact
archived limits. `replay FILE --artifact ARTIFACT` first validates that archive,
then executes its single input against current source with default current
limits. Pass is a new execution, not retroactive history or full-domain Clear.
Use `--json` for custom current limits. See [Protocol.md](Protocol.md) for the
strict envelope and distinction between archive validation/current-source errors.
Reproduction is **not authentication**, proof, or evidence of author/time.

## Limits, IO and exits

The current compiler is `wisp-0.1.0-semantics-5`. Immutable nominal records use
the same commands: `wisp run examples/invoice.wisp` or
`wisp focus examples/invoice.wisp total`. `check`/`focus` include record metadata
without execution. Earlier compiler artifacts (including semantics-4) are
rejected before historical execution; envelope v1 is not a cross-compiler
compatibility promise. Keep the original compiler available for old artifacts;
there is no automatic migration or evidence rehashing.

Input paths may be `-` for stdin (one stream; do not use it for both current
source and artifact). Readers consume at most cap + 1 bytes before rejecting:
source 64 KiB (65,536 bytes), artifact/request 1 MiB (1,048,576 bytes). Input
must be UTF-8. The core also caps the entire dispatch JSON request at 1 MiB,
including envelope/escaping. CLI bounds are host/transport errors; smaller
custom language budgets remain semantic Unknown. Malformed artifact JSON or
schema produces semantic Error via Rust validation, not accepted evidence.

| New explicit commands | Exit |
| --- | --- |
| Complete / Ready / Pass | 0 |
| Fail / Error | 1 |
| Unknown | 3 |
| Host IO, invalid UTF-8, oversized input, usage, invalid CLI integer | 2 |

**Compatibility:** `wisp FILE` and `wisp --json < request.json` preserve exit 0
for every semantic status, including Fail/Error/Unknown; they retain exit 2 for
host IO/usage/bounded-reader failures. `--json` accepts one complete request,
not newline-delimited messages. Consumers must inspect JSON `status`.

No host expression evaluation, automatic upload, persistence, filesystem or
network access is added to the language core. File IO is native CLI transport
only. Inspecting untrusted artifacts does bounded fresh work; it does not trust
the claimed receipt or execute arbitrary host commands.
# Policy case review

```
wisp review BEFORE AFTER --suite CASES
wisp verify SOURCE --suite CASES
```

Both emit structured shared review JSON to stdout and write no files. Verify
reads SOURCE once and logically uses it for both documents, including stdin.
Exactly one `--suite` is required; unknown/missing/duplicate flags are usage
errors. There is no output-file, apply or approval option. At most one physical
input can be `-`. Sources and suite use bounded UTF-8 cap+1 readers (65,536 bytes).
Suite file JSON is validated as a standalone RawValue before embedding; valid
raw duplicate members and number spelling reach the shared decoder unchanged.
Invalid JSON becomes a shared review Request/Error, never envelope injection.
Host IO/usage errors: stderr and exit 2. Semantic exits: Pass 0, Fail/Error 1,
Unknown 3. Legacy FILE/`--json` semantic exit 0 is unchanged.

```
wisp review examples/policies/reservations-before.wisp examples/policies/reservations-after.wisp --suite examples/policies/cases.json
wisp verify examples/policies/reservations-after.wisp --suite examples/policies/cases.json
```

The seven explicit reservation cases show two Changed, five Unchanged and
candidate Pass. Verifying the baseline returns Fail, not a parse error.
Pass is not authorization to apply, merge or deploy.
# Repository projects

`wisp describe FILE` and `wisp project describe MANIFEST` return checked,
structured function/record boundaries without executing policies or suites.
Use [Interface](Interface.md) for type tags, project status and session hash guards.

`wisp project serve MANIFEST` pins project files and accepts serial typed decision
requests on stdin after a readiness line. JSON-lines stdout contains per-request
core evidence, not an aggregate verification verdict. See [Adapter](Adapter.md)
for limits, lifecycle and the runnable Python integration.

`wisp project verify MANIFEST` checks saved policy suites; `wisp project review
BASE_MANIFEST CANDIDATE_MANIFEST` compares matching policy sets with unchanged
suite bytes. Read-only native host commands with JSON evidence and semantic exit
codes; malformed config/IO uses stderr/exit 2. See [Projects](Projects.md) for the
strict v1 manifest, path confinement, drift gate, budgets and per-policy preflight.
