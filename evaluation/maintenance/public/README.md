# Warehouse pallet admission maintenance

Repair the **current** `starter.wisp` or `starter.ts`, in your assigned arm,
against the public specification in `task.md`. The historical directory is
read-only evidence, not the repair target. Preserve it and the public examples.
This is a small single-file maintenance exercise designed to fit Wisp's current
records, integer arithmetic, pure functions and finite probes. It is not a
production repository, an import/module simulation, or a test of missing native
imports, collections, IO, package ecosystems or deployment capabilities.

## Available tools

There is no mandatory tool sequence. You may read the entire source, use any
available editor, and write your own unrestricted tests in new scratch files.
Compiler context is optional metadata, not proof or a relevance guarantee.
Do not read `../private/`, author preflight reports, or private acceptance tools
and fixtures during a trial. This instruction is a holdout, not technical isolation.

From the repository root:

```sh
node scripts/maintenance-tools.mjs --help
node scripts/maintenance-tools.mjs ts-context FILE sample_ok --budget 65536
node scripts/maintenance-tools.mjs ts-check FILE
node scripts/maintenance-tools.mjs ts-public FILE
node scripts/maintenance-tools.mjs ts-replay FILE evaluation/maintenance/historical/typescript-snapshot.json

target/debug/wisp check FILE
target/debug/wisp focus FILE reserve --budget 65536
target/debug/wisp context FILE --probe 0 --budget 65536
target/debug/wisp inspect evaluation/maintenance/historical/wisp-artifact.json
target/debug/wisp replay FILE --artifact evaluation/maintenance/historical/wisp-artifact.json
target/debug/wisp run FILE
```

`ts-context` uses the actual TypeScript compiler/checker to resolve direct call
targets, then traverses their cycle-safe syntactic closure. It provides signatures,
UTF-16 and UTF-8 spans, complete reachable bodies and all record/interface types,
hashes, unresolved calls, scope omissions and atomic budget omissions. Dead-branch
calls remain included. A full-source fallback is always included, outside the
selected text budget. The maximum source/text budget is 65,536 UTF-8 bytes, not
tokens or response bytes. No semantic/context-completeness claim follows.

### TypeScript setup (avoid ambient ESM confusion)

The repository already pins TypeScript in `package-lock.json`. If dependencies
are missing, use `npm ci`. Helpers use **real strict tsc**, target ES2022, explicit
CommonJS emission in a fresh temporary directory, and `.cjs` loading in Node.
The repository's `"type":"module"` and your candidate filename therefore do not
change execution semantics. BigInt arithmetic uses `n` literals; inputs and
expected integer fields are canonical decimal strings over JSON, converted to
BigInt only at the worker boundary. No JavaScript Wisp interpreter is involved.

`ts-check` compiles without module initialization or test execution. `ts-public`
checks whole Decision records on seven public cases in groups 0..3 and 4..6.
`ts-replay` verifies the archived source hash, actually recompiles/executes it on
the historical input, compares that reproduction with the saved report, then
recompiles/executes the current file on that same input. It is not a fresh suite.
Wisp's native commands use the existing Rust core and their documented exit
codes (Fail/Error 1, Unknown 3, IO/usage 2); legacy `--json` returns semantic
reports with exit 0. Inspect/replay Ready/Pass is not fresh-domain Clear.

Candidates are pure authored functions: no host IO, imports or dependencies.
TS helper checks restrict calls to authored named functions and member access to
authored record fields; dynamic property access and host construction are not
supported. These guards and bounded processes are **not a security sandbox**;
execute only trusted study-authored sources. Commands have 10-second subprocess
deadlines and 1-MiB stdout/stderr bounds. Errors, limits, missing/wrong fields and
Unknown never count as acceptance. Tools emit JSON on stdout; redirect to a new
scratch report if desired. They do not modify source or archived evidence.

Submit a new candidate file and your explanation. Do not change fixtures, probes,
public regression data, tooling or historical files. The evaluator compares
candidate bytes with the current starter and permits changes to one or two
existing parsed function bodies only; full-source inspection is unrestricted.
