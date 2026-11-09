# Verification

Run commands in `AGENTS.md`. CI must check Rust fmt/clippy/tests, WASM build, TypeScript, static build, native/WASM agreement and browser smoke. Deployment and functional acceptance are separate from CI.

Adversarial coverage must include arithmetic overflow/division, recursion/fuel, nesting/source size, malformed and unsupported syntax, output/allocation limits, transitive impurity, empty/range limits, exact finite case semantics, stale ghosts, unrelated vs transitive dependency changes, Stop/error UI, fresh default Agent docs and safe text rendering. Never treat a compile-only WASM build as interface verification.

Results will be recorded with the exact revision and remaining gaps before handoff. No Docker required.

## First-playable local evidence (2026-11-09)

- Rust: fmt check, Clippy all targets with warnings denied, 25 tests including 3,000 malformed input cases passed.
- Actual wasm-bindgen JS interface: 48 exact native/WASM report comparisons, including i64 precision, arithmetic faults, limits, examples, replay and >32-bit transport counts passed.
- TypeScript/static build passed; npm audit reported zero known vulnerabilities for the lockfile. Vite upgraded to 7.3.7 after initial audit identified patched dev-server vulnerabilities.
- Six Chromium integration tests passed: broken/repair/replay, safe output/runtime/live errors/Stop, default Agent + explicit persisted Human, mobile width/controls, dependency badges and duplicate probe/focus regressions.
- Astra challenged the design before code. Joffrey independently reviewed integration head `bd5a327`; found platform-sized request integer divergence, duplicate predicate badge mismatch and example-switch focus mismatch. All three were corrected with regression tests and rerun checks. Review was read-only, not a self-approval or a universal correctness claim.
- Local T3 preview loaded actual worker/WASM with no console errors; visual layout inspected at 1280×800. Published-site verification and exact remote CI/head will be recorded separately.

Known gaps: no cross-browser matrix, fuzzing engine, formal proof, measured performance comparison or production sandbox certification. Stop integration verifies hard host termination/message exclusion; bounded programs can normally finish before a human click.

## Remote CI repair

Checks run `42588805445` on `acfa830ac6623bfe4a52e4aa6e72eb27e67fefe9` passed Rust, WASM, TypeScript and static build, then failed installing Chromium dependencies: `ubuntu-latest` resolved to Ubuntu 26.04, unsupported by pinned Playwright 1.56.1. Runner images are now pinned to supported `ubuntu-24.04` for reproducible dependency installation. The browser gate is retained, not skipped or waived. Replacement exact-head CI must pass before merge.

## First-playable published acceptance

PR #1 merged at `ff22d8703387872b24c1c07e386a59538d7f5e9d`. Exact-head PR Checks `42589297890`, post-merge Checks `42589746427`, and Pages build/deploy `42589746572` passed. Published local-WASM execution, n=9 ghost, repaired 11-case Clear, historical replay Pass, runtime Error, Stop Unknown, Agent fresh default, explicit Human persistence and raw Docs links were verified separately in a T3 incognito browser. Full evidence is recorded on [PR #1](https://github.com/suhaasbadada/wisp/pull/1#issuecomment-6736173927).

## Portable failure workflow local verification

36 native tests (30 core, six CLI), 63 exact native/WASM report comparisons (15 artifact operations), ten Chromium integration tests, fmt/Clippy/TypeScript/static build passed. Browser download → native inspect/repaired replay and native archive → browser import/replay are exercised against real files and the actual WASM interface. Corrupt source/version/compiler, duplicate fields including limits, oversized and invalid-UTF8 files, file-read Stop cancellation, no overwrite, exit codes, read caps and current-source diagnostic isolation have regressions. Raw JSON is preserved end-to-end for shared duplicate-field checks, including >32-bit numeric transport. Import/reproduction errors never accept an artifact. Remote CI and published checks for this increment remain separate gates.

Independent review by Joffrey of `c6b10a9` found raw artifact interpolation could inject enclosing request fields and the import deadline excluded file reading. Both fixed before publication: standalone-value validation preserves original bytes for shared schema checks; one deadline spans reading and validation. Native/browser trailing-field injection tests and a clock-controlled stalled-reader/late-callback test passed. No findings were waived.

PR #2 shipped at `37ec979f28b7f78dc279bdfaf298ebbc5aac1134`: exact-head PR Checks `42639474098`, post-merge Checks `42640332928` and Pages `42640332920` passed. Live T3 incognito verification exported an actual 835-byte ghost file, reloaded and imported that same download into repaired code without replacing the editor, then replayed as new Pass (not full-domain Clear). Published CLI docs returned HTTP200. [Acceptance evidence](https://github.com/suhaasbadada/wisp/pull/2#issuecomment-6743596526).

## Immutable records local verification

56 Rust tests, 97 exact native/WASM report comparisons and 13 Chromium integration tests passed with fmt/Clippy/TypeScript/static build. Record tests cover nominal typing, unknown/duplicate/missing fields, forward/deep/cyclic definitions, initializer order, projection/purity, bounded aggregate copies/equality/display, record-only dependency invalidation (including direct probes), record-bearing artifact reproduction/replay, and older compiler rejection before execution. Browser invoice output/21-case finite evidence, live field/cycle errors, record graph context/overflow and visible compiler compatibility warning are checked. Native and actual WASM agree on successful and adversarial record programs. Exact-head remote CI and published acceptance remain separate gates for this increment.

Independent review by Joffrey of `bb6750b` found iterative equality visited fields in reverse declaration order, changing short-circuit/fuel behavior. Fixed before push by reversing LIFO stack insertion. Flat and nested tight-fuel native/WASM regressions now complete in 33/66 units, with one-less limits Unknown. The declared comparison order is preserved; no finding was waived. Astra challenged the record design before implementation.
