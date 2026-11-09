# Browser playground

## Policy review

The workbench explicitly captures a baseline, reviews the current Code candidate
against raw case JSON and renders Rust's before/after results and expectations.
Load reservation walkthrough is labeled as replacing the editor; it does not run.
Review never replaces Run output/ghosts, applies code, approves or deploys. Every
source/suite/baseline change (including edit-and-revert, recapture, examples and
guarded Apply) invalidates prior reviews via generations. Stop/5-second deadline
discards late replies without inventing executed counts. Source/suite host caps
are 64 KiB; standalone JSON syntax is checked without rebuilding raw numeric or
duplicate fields. Actual typing/comparison is Rust only. Text rendering is inert.
See [Workbench](Workbench.md) for the end-to-end workflow and status boundaries.

## Guarded body edits

The collapsed panel offers Load, Preview, Stop and one-use Apply. Only checked functions are eligible. Load copies exact compiler body bytes; changing targets never silently rewrites replacement input. Preview uses source/body guards and independent cancellation/deadline, leaving editor/output/ghosts untouched. Review before/after bytes, candidate source and document-tagged JSON before Apply.

Every source/target/replacement edit, including edit-and-revert, invalidates Apply. Apply synchronously rechecks snapshots and preservation boundaries, consumes once and updates full source through checking without executing. UTF-8 decoding handles Unicode boundaries. Old ghosts retain original source/revision; Run/Replay remain explicit executions. Ready is not probe success or intent correctness. Outer comments/extra definitions are rejected. Rejected-candidate diagnostics never become baseline editor offsets. See ADR 0007 and Protocol for limits and schema.

## Probe context query

“Probe context” is an explicit non-executing query, separate from function Agent View, Run and Invoke. Only currently checked probe options are selectable; indexes are zero-based and revision-local. The independent worker receives source, canonical selector and clamped TEXT budget, with its own Stop query/five-second deadline. Source/selector/budget edits cancel a pending request or mark accepted metadata historical (including when input is reverted); no late response can replace current context. A new query clears the previous display before accepting a result. Execution evidence/output/ghosts are untouched.

The UI displays exact compiler-selected TEXT, included/eligible/effective-budget bytes, query/source/run-key prefixes, per-item ledger and raw scope/assumption/unknown metadata. Zero budget is Ready metadata with empty TEXT and explicit atomic omissions, never a successful probe or runtime Unknown. All-candidate fit still warns about scope omissions and lack of run equivalence. Prelude, prior probes and outside-closure functions can affect full execution. The ledger/metadata are outside the UTF-8 TEXT budget; no total-response/token/absolute-memory guarantee is implied. Text/hashes prove neither authorship nor human intent. Hostile markup and delimiter-looking comments/strings render literally, not as instructions or HTML. Agent-default and Human docs include runnable context examples and ADR 0006.

## Compiler-owned machine contract

The documentation's default Agent mode links `/wisp/agent.json` and displays `Docs/Errors.md`. Static build creates the manifest from the same WASM dispatcher used by workers; it lists only implemented operations/features, core permissions, exact logical limits, compatibility/uncertainty, code catalog and runnable examples. The JSON is discovery data, not executable agent instructions or a repair/proof policy. It retains the dispatcher's required empty source field for the documented capabilities request. Human mode explains stable code vs human message and enclosing outcome.

Source/input/probe/replay/artifact diagnostics display stable codes as plain text after existing kind/location/message formatting. Unknown future codes remain displayable: the UI falls back to the legacy kind and enclosing report status without interpreting code names or messages. No code can select intended repairs. The discovery document is compact compiler-owned metadata, not a measured token/performance superiority claim. Raw contracts and ADRs 0001–0005 remain linked under capital-D `Docs/`.

## Typed invocation form

“Invoke a typed function” is separate from whole-program **Run**. It selects a compiler-derived function signature and accepts a JSON argument array (64 KiB host cap), preserving raw bytes through the shared Rust decoder. Syntax-only standalone-value validation prevents outer request-field injection; malformed argument syntax is sent as null so Rust still checks source first. Ints are canonical decimal strings, records exact objects, Bool/String JSON primitives. No input string is evaluated as code. The invoice example preloads a record argument for `total`; explicit example changes select corresponding sample inputs. Switching only the target does not rewrite arguments.

Only the selected function executes; top-level statements/probes are checked but skipped. Captured prints go to Output; a separate typed-return panel shows the result. Invocation evidence marks target/source/input history, attempted vs not-executed state, outcome and execution key. It never produces probe Clear, modifies ghost history or replaces prior whole-program evidence. Source, args or target edits mark a prior result historical; stale input diagnostics do not apply to changed arguments. Stop/five-second deadline terminates the worker and accepts no partial result. Input diagnostic JSON Pointers are rendered as input paths, not fabricated source line/column locations. Encoded result value shares the output-byte budget with captured print; envelope metadata is outside it. Inputs remain local and are not uploaded or automatically persisted.

Displayed invocation diagnostics retain their source/argument/target provenance. Editing arguments or target after a response clears input-dependent messages and explicitly says the current input is unchecked; applicable Syntax/Type/Purity source diagnostics remain. Reverting to the exact prior input/target may show that prior diagnostic again, not a new execution. This post-response edit case is separate from discarding a late reply for already changed input.

The examples dropdown includes “Typed invoice records” after the original snack and inventory examples. It runs `examples/invoice.wisp` through the same worker/core as the native CLI: nested record output, primitive projection total, 21 declared finite comparisons. Agent View includes compiler-derived record declarations and raw graph metadata. Limits/labels use metered fuel units, not expression counts: aggregate traversal and string/output bytes consume fuel. The import warning explicitly identifies semantics-5 and rejects older-compiler artifacts without migration. Changing the selected example updates the displayed filename; manual edits are labeled scratch.

Probe badges match declaration occurrences, not just predicate hashes (duplicate predicates can have distinct budget prefixes). Agent View reconciles removed/changed focus functions by requesting the newly selected function from Rust; the selector never labels another function's view.

Static site base `/wisp/`. Local WebAssembly from the Rust dispatcher runs in a disposable Web Worker per request. TypeScript never evaluates Wisp. Examples are imported from the CLI's `examples/` files; no API key or backend. Live analysis uses a separate disposable worker, a 250ms debounce, exact submitted-source checks and worker identity checks to discard outdated responses. Run/replay have a five-second host deadline. Stop terminates the execution worker and reports Unknown; it cannot turn interrupted work into passing evidence. Host transport failures are errors.

Output/diagnostics/source/JSON are rendered as text, not HTML. UTF-8 diagnostic offsets are converted to displayed line and Unicode-codepoint column positions. Current-source diagnostics never use old-source spans. Execution revision and historical state are visible separately from checking. Agent View has explicit text-byte budget/overflow and omissions; metadata/UI are outside that budget.

Ghost receipts and their exact source snapshots are retained in memory for the page session, not across reloads. Editing or changing examples does not delete a historical ghost. Replay is a new single-input execution and never claims full-domain Clear. No result cache exists; dependency keys are inspection/invalidation metadata, not evidence of a new run. Receipts are integrity/linkage material, not authenticated execution certificates. Page-session history can grow; reload clears it. No persistent archive is promised.

## Portable ghost files

Each ghost has **Export ghost + source**. The download includes the entire historical source, exact compiler identity, all effective limits and the immutable receipt. A visible privacy warning precedes sharing; nothing is uploaded, auto-saved or added to localStorage. Rust first reproduces the exact historical failure under the archived configuration. A successful export prepares a version-1 `.json` file for native inspection/replay or later explicit re-import.

**Import ghost file** reads a user-selected local file capped at 1 MiB before reading; the Rust full-request cap also applies to the import envelope. A syntax-only JSON.parse checks that the file is one standalone JSON value; its result is discarded. Original raw JSON reaches Rust without normalization, so duplicate-field/schema/integer checks remain shared with native. This standalone-value check prevents file text from injecting outer request fields. Only a Ready response with an accepted artifact adds a receipt. The current editor is never replaced by import. Unsupported compiler/version, corrupt source/configuration or unreproducible failures are rejected. Imports are untrusted: reproduction is a new bounded local execution, not authentication of claimed history. Stop and a single five-second deadline cover file reading plus worker validation; late reader/worker callbacks cannot accept an artifact after cancellation.

Imported/exported artifact replay validates historical reproduction again, then executes the single input against current source with current default limits. Archived limits remain separate and unchanged. Historical-validation failure does not claim that current replay ran; a successful validation followed by current source/replay Error is distinguished from that failure. In-memory ghosts remain available through edits; after reload, explicitly import the downloaded file to restore one. See [CLI.md](CLI.md) and [ADR 0002](Decisions/0002-portable-failure-artifacts.md).

Documentation at `/wisp/documentation/` defaults to Agent on fresh visits. Explicit Agent/Human choice persists in localStorage when available; unavailable storage is reported when a choice is attempted. Agent mode includes the exact raw language and protocol contracts; Human mode explains the runnable failure/repair/replay workflow. Engineering docs are published at `/wisp/Docs/` as raw Markdown. The route deliberately avoids a case-only collision with `Docs/` on macOS filesystems.

Logical allocation counters are not an absolute browser/WASM/JS/process memory guarantee. Worker isolation does not imply production security hardening. No benchmarks or production readiness claims.
