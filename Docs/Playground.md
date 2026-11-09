# Browser playground

Probe badges match declaration occurrences, not just predicate hashes (duplicate predicates can have distinct budget prefixes). Agent View reconciles removed/changed focus functions by requesting the newly selected function from Rust; the selector never labels another function's view.

Static site base `/wisp/`. Local WebAssembly from the Rust dispatcher runs in a disposable Web Worker per request. TypeScript never evaluates Wisp. Examples are imported from the CLI's `examples/` files; no API key or backend. Live analysis uses a separate disposable worker, a 250ms debounce, exact submitted-source checks and worker identity checks to discard outdated responses. Run/replay have a five-second host deadline. Stop terminates the execution worker and reports Unknown; it cannot turn interrupted work into passing evidence. Host transport failures are errors.

Output/diagnostics/source/JSON are rendered as text, not HTML. UTF-8 diagnostic offsets are converted to displayed line and Unicode-codepoint column positions. Current-source diagnostics never use old-source spans. Execution revision and historical state are visible separately from checking. Agent View has explicit text-byte budget/overflow and omissions; metadata/UI are outside that budget.

Ghost receipts and their exact source snapshots are retained in memory for the page session, not across reloads. Editing or changing examples does not delete a historical ghost. Replay is a new single-input execution and never claims full-domain Clear. No result cache exists; dependency keys are inspection/invalidation metadata, not evidence of a new run. Receipts are integrity/linkage material, not authenticated execution certificates. Page-session history can grow; reload clears it. No persistent archive is promised.

Documentation at `/wisp/documentation/` defaults to Agent on fresh visits. Explicit Agent/Human choice persists in localStorage when available; unavailable storage is reported when a choice is attempted. Agent mode includes the exact raw language and protocol contracts; Human mode explains the runnable failure/repair/replay workflow. Engineering docs are published at `/wisp/Docs/` as raw Markdown. The route deliberately avoids a case-only collision with `Docs/` on macOS filesystems.

Logical allocation counters are not an absolute browser/WASM/JS/process memory guarantee. Worker isolation does not imply production security hardening. No benchmarks or production readiness claims.
