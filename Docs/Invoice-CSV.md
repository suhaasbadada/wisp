# Invoice CSV host transport

`examples/invoice-csv/run.py` is a standard-library Python adapter to the existing
Rust `validate-call` and `call` operations. It is not another language evaluator,
spreadsheet/ERP integration or production accounting tool. See the
[sample commands](../examples/invoice-csv/README.md). No dependencies or Docker
are needed; run with `python3 -B` and an already trusted native CLI.

## Input contract

Required options: `--csv FILE --payment-cents TEXT`. Optional: `--source FILE`,
`--binary TRUSTED_WISP`, `--execute`, `--args-out NEWFILE`. Default source is
`examples/invoice-batch.wisp`; default binary is `target/debug/wisp`, both resolved
from the script's repository, independent of cwd. Explicit relative paths are
relative to cwd. There is no stdin-file convention, URL fetch or implicit network
access. Inputs must be regular files, checked before opening and again by fstat;
nonblocking open avoids waiting on a substituted FIFO. Source is captured once.

CSV and source are each bounded reads of at most 64 KiB plus one overflow byte,
fatal UTF-8, no initial BOM and no CR anywhere. Use LF line breaks, including in
quoted fields. The CSV header must decode to exactly these three fields in order:
`quantity,unit_cents,declared_cents`. Duplicate, missing, extra or reordered headers,
wrong row width, empty cells, blank rows and malformed CSV are host failures before
any native dispatch. Header-only means an empty batch. Standard-library
`csv.reader(strict=True)` handles CSV quoting, not comma splitting. Quoted LF is
retained in cell text (and rejected as Int text by Rust), not treated as another
invoice row. Diagnostics and invoice mismatch/invalid indices count decoded data
records from zero, not physical CSV line numbers.

The generated standalone JSON array is
`[[{"quantity":"2","unit_cents":"250","declared_cents":"500"}],"500"]`.
Cells and payment remain exact strings after CSV unquoting: no trimming, integer
or floating conversion, currency parsing, rounding or formula execution. Even
`=...` is data. Owners supply correct units; quantities are Int and amounts are
already cents. Rust alone owns canonical Int validation, exact record types,
arithmetic, pricing, mismatches, indices and language limits/statuses. A native
input diagnostic such as `/args/0/1/declared_cents` refers to the second decoded
CSV data record; `/args/1` refers to payment.

Generated UTF-8 JSON arguments are capped at 64 KiB, cumulatively checked on each
row before aggregation; even many tiny CSV rows cannot expand without this bound.
The raw CSV bound also bounds parser input, not absolute process memory. Encoded
requests are capped at 1 MiB before dispatch. Existing native list (1024 each),
source, fuel, allocation and other limits are unchanged: a small-enough CSV is not
a promise of Ready or Complete.

## Validation, execution and files

Each native attempt reuses `clients/python/wisp_client.py` strict JSON helpers and
bounded transport (30-second deadline, 4 MiB stdout, 64 KiB stderr). Invocation is
ordinary argv `[trusted_binary, "--json"]`, never a shell. Source and argument
data go through stdin, not argv. No automatic installation or retry occurs.

Default behavior is **nonexecuting validation only**. Ready is accepted only for
exact `wisp-0.1.0-semantics-7`, source SHA-256 revision, target `reconcile`, count
2, argument SHA-256 over the exact generated raw value fragment, validated v1,
`new_execution: false`, empty output/probes/diagnostics and no result, invocation
or runtime usage markers. Incompatible/future compilers fail closed. A malformed
or stale peer report never authorizes a file write or call.

Only accepted Ready permits `--args-out` and/or `--execute`. Output is written
first, then explicit execute submits exactly one call with the **same captured
source and argument bytes**. Later changes to the input paths do not change that
attempt. Neither validation nor invocation evaluates top-level sample prints or
probes. Type-correct functions may fault or exhaust fuel. No host recomputation
or inferred business expectations are used.

No files are written by default. An explicit arguments output contains exact
generated UTF-8 JSON, no added newline. Exclusive creation with mode 0600 never
overwrites existing files/symlinks or creates directories. Source/CSV aliases
therefore fail without overwriting data. Treat saved args as plaintext sensitive
data. Write failure is a host error and prevents execution; cleanup truncates
only the owned open inode, never unlinks a possibly replaced path. An empty
reserved output file may remain after an I/O failure (or partial data if the
filesystem also refuses truncation); inspect it before a manual retry. An args
file already saved after Ready can remain when execution later fails.

Stdout is the structured native validation report, or the actual call report
after explicit execution; no raw arguments are inserted into Ready. Host/usage,
malformed-peer and transport errors emit only a bounded generic stderr message,
not raw cells, source, peer output or private paths. The legacy native `--json`
semantic exit 0 is mapped by this adapter: Ready/Complete **0**, Error **1**,
Unknown **3**, host/usage/protocol failure **2**. Transport failure after a call
was submitted does not establish zero execution; do not retry automatically.

Saved args can be used with native `validate`/`call --args-file`, or the existing
browser Load / Check / Download function-input workflow with matching source and
target (see [Function inputs](Function-inputs.md)). Validation is metadata, not
business approval, proof, a successful runtime result or a claim of adoption.

## Finite verification

`cargo test --test invoice_csv` supplies the actual Cargo-built CLI to
`python3 -B scripts/invoice_csv_test.py`. Tests cover native reconciliation,
alternate source pricing, input rejection and transport/preservation guards.
They do not prove arbitrary datasets fit runtime limits or all I/O races safe.

A browser integration test loads the adapter's exact saved args, obtains the same
Rust/WASM nonexecution metadata, then explicitly invokes the sample. Static
downloads contain the sample, adapter source and README. Run the adapter from a
trusted full checkout with its Python transport module and Wisp sources; the raw
script download is not a self-contained installation or browser executable.
