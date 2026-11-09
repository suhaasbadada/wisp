# Native CLI

Build with `cargo build`; use `target/debug/wisp` or `cargo run --`.
All commands emit one structured JSON report on stdout, not evaluated source or
plain program output. Captured program output lives in the report's `output`.
`--help` (also `-h`) prints usage and exits 0.

```sh
wisp run examples/snacks.wisp                  # Fail, exit 1
wisp check examples/snacks.wisp                # Ready, exit 0; no execution
wisp focus examples/snacks.wisp bill --budget 4096
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
