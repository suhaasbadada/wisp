# CSV to Wisp (local host adapter)

From the repository root, using a trusted built native CLI:

```sh
cargo build --bin wisp
python3 -B examples/invoice-csv/run.py --csv examples/invoice-csv/sample.csv --payment-cents 1500
python3 -B examples/invoice-csv/run.py --csv examples/invoice-csv/sample.csv --payment-cents 1500 --execute --args-out invoice-args.json
```

The first adapter command reports **Ready without executing**. The second validates, writes
the new plaintext arguments file, then calls `reconcile` once. Its sample result
has computed cents `1500`, declared cents `1490`, one mismatch at zero-based index
`1`, and `balanced: false`. Complete is not payment approval.

`--source examples/invoice-rule-review/bulk-discount.wisp` explicitly chooses the
separate authored illustrative candidate; it does not apply or approve it.
`--binary /absolute/path/to/trusted/wisp` selects an already trusted executable,
not an installation instruction. Paths with spaces are ordinary arguments.

From any directory, use absolute paths for the script and CSV (and any explicit
source/binary/output). The default source and default `target/debug/wisp` are
resolved relative to this script, not the current directory.

Exact header: `quantity,unit_cents,declared_cents`. UTF-8, no BOM, LF only; no CR,
extra/missing cells, empty cells or blank rows. A header-only batch is valid.
Quantities and amounts are canonical Wisp Int text; amounts are **already integer
cents**, never parsed/rounded currency. Quoting only unquotes CSV syntax: spaces,
leading zeros, formulas and embedded quoted LF remain data for Rust to reject.

`--args-out` never overwrites anything, including symlinks; it creates one 0600
file only after current Ready. The JSON array can be loaded in the existing
browser function-input workflow: choose matching source and `reconcile`, Load,
Check, then Download the runnable package. Or reproduce natively:

```sh
target/debug/wisp validate examples/invoice-batch.wisp reconcile --args-file invoice-args.json
target/debug/wisp call examples/invoice-batch.wisp reconcile --args-file invoice-args.json
```

See [the transport contract](../../Docs/Invoice-CSV.md) for bounds, exit statuses,
snapshot identity and failure handling. No web UI, core permissions or language
semantics are added.
