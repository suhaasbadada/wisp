# Function input files and terminal reproduction

In the playground's **Invoke a typed function** panel, open **Open, check or
reproduce function inputs**. Choose a local JSON file, then explicitly **Load
inputs**. Selecting alone does not read it. Load replaces only JSON arguments,
not source or target, and never invokes or checks automatically. Source, arguments
and target remain editable. Nothing is uploaded; saving is off unless explicitly
enabled elsewhere. Existing invocation results/history remain separate.

Files and each submitted source/argument text are capped at 64 KiB. Files require
fatal UTF-8 decoding, no BOM, LF-only line endings and an exact Unicode roundtrip.
Arguments must be one standalone JSON array. Loading retains exact text, including
outer/internal whitespace, duplicate keys and numeric spelling: JSON parsing is
only a syntax/root-array check, never a rewrite. Int inputs are decimal strings.
Rust, not TypeScript, checks source, exact types, duplicate/unknown fields, list
bounds (1024 elements each) and nesting. Input diagnostics own JSON Pointer paths,
not source-editor spans.

**Check input shapes** uses a separate disposable worker and Rust `validate-call`.
**Inputs Ready** means types only: the function, top-level statements and probes
were **not executed**. It is not semantic Complete, success, approval, proof or a
claim about earlier attempts. A type-correct call can still fault or exhaust fuel.
Invoke remains explicit and independent; validation does not enable it. Native
Error/Unknown diagnostics are not new invocation results. Reads and validation
have five-second deadlines, checked against monotonic elapsed time before accepting
reads/responses/digests as well as by cancellation timers. **Stop input work** cancels this module's work only,
not a separate Invoke/Run worker.

Every source/argument/target input or change event, including edit-and-revert,
invalidates validation and package availability. Selecting/changing a file also
conservatively invalidates it. Stop, new work and loading invalidate it too.
Pending readers/worker responses/digests cannot commit after these changes.
Before accepting Ready, the browser checks compiler semantics-7, contract v1,
nonexecution fields, target/count, SHA-256 source revision and argument hash
against the immutable current snapshot and generation. The argument hash covers
the retained JSON **value fragment**: internal whitespace stays; surrounding ASCII
JSON separator whitespace does not. It is not the full file digest.

Only current native Ready enables **Download runnable inputs package**. This
explicit local download is a deterministic regular USTAR archive with four fixed
0600 files: `program.wisp` (exact source), `args.json` (full exact raw arguments,
including outer whitespace), `input-validation.json` (complete native metadata),
and `README.txt` (trusted instructions). Full sources/data are plaintext: inspect
before sharing. No compiler, executable, script, invocation result, inferred
expectation, review application or backend/storage action is included. Compiler
identity is plain data, not an installation command. The bounded shared serializer
rejects unknown/duplicate filenames and caps archives at 16 MiB before aggregate
Blob allocation; these are not absolute browser-memory guarantees.

Extract into a **new empty directory**, inspect all files, and use a **trusted
installed exact compiler** matching the metadata. For the invoice batch example,
select **Invoice batch reconciliation**, choose a dataset shaped as
`[[{"quantity":"2","unit_cents":"250","declared_cents":"500"}],"500"]`,
then Load, Check and Download. The fixed README commands for that target are:

```sh
wisp validate program.wisp reconcile --args-file args.json
wisp call program.wisp reconcile --args-file args.json
```

Only a verified ASCII function identifier is inserted into these commands, never
source/data strings or filenames supplied by the user. They make fresh attempts;
saved validation is not fresh success. Semantic exits: 0 Complete/Ready, 1 Error,
3 Unknown; 2 host/usage failure. A fresh Complete is one observation, not proof or
approval. Finite tests, list limits and this workflow do not establish that an
arbitrary dataset fits all runtime bounds or that Wisp outperforms another tool.

## Read-only JSON value navigation

After **Check input shapes**, a current native Error/Unknown Input or Limit
diagnostic with a resolvable `/args` JSON Pointer may offer **Select JSON input
value** below the native report. Clicking focuses the arguments textarea and
selects the exact raw value (including string quotes, or the whole argument array
for `/args`). It never edits, normalizes, checks, invokes, runs, changes source
selection, or writes invocation history/results/output. Fix inputs manually and
explicitly Check again; Invoke is still separate. Native status/path remain
authoritative; selection is presentation only, not another type implementation.

Navigation requires semantics-7, matching SHA-256 source revision and target,
contract-v1 preflight metadata with exactly four fields and `new_execution:false`,
empty output/probes, diagnostics, and no result/usage/invocation/execution key or
validated count/hash. Identity digestion shares the same five-second deadline
and generation/worker guards as Ready. Preflight has no argument hash: binding is
to the actual submitted immutable raw arguments and current owner generation,
not cryptographic argument proof. Accepted navigation has no subsequent TTL.
Every owner edit/change (even edit-and-revert), file change, Stop, load/read start
or new check revokes it, including retained old button callbacks. Stop remains
available when navigation exists. Error/Unknown never enables package download.

The bounded lexical locator uses UTF-16 selection offsets, at most 64 KiB UTF-8
and 17 nested JSON containers including the argument-array root. It does not
convert numeric payloads to floating point. It requires a complete well-formed
standalone array, unique decoded object keys everywhere (including escaped-key
duplicates), valid Unicode scalar strings, LF-only text and no BOM. JSON Pointer
decodes only `~0`/`~1`; array indices must be canonical nonnegative ASCII decimal
indices that actually exist. Missing fields, source diagnostics/default spans,
invalid/unresolved pointers, duplicates, unsupported metadata and inputs outside
these UI bounds have no navigation; there is never a fallback to source offset
zero. A native list-limit diagnostic may still select an existing 1025-element
list within these presentation bounds. The complete raw native report remains
available regardless of navigation; no diagnostic is reinterpreted or repaired.
