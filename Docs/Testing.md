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

PR #3 shipped at `d7c1beae34a8fc61315b9a2fe0e11ef471f6c4c7`: PR Checks `42644067073`, post-merge Checks `42644617655` and Pages `42644617774` passed. Live invoice output, exactly 21 finite cases, semantics-5 record graph/bounded context, older-compiler envelope rejection without editor/evidence mutation, published grammar/Human tutorial and Agent default with no saved choice verified via T3 preview. [Acceptance evidence](https://github.com/suhaasbadada/wisp/pull/3#issuecomment-6744146201).

## Structured invocation local verification

67 Rust tests, 133 exact native/WASM comparisons (36 invocation-specific) and 18 Chromium integration tests passed with fmt/Clippy/TypeScript/static build. Invocation covers canonical i64 extrema/Bool/String/nested records, strict fields/arity/types/duplicates, independent input bytes/depth, no input evaluation, source checking before input validation, skipped top-level statements/probes, nested captured output, combined print/result caps and encoding limits, key invalidation, native bounded files/stdin/exit codes and existing artifact compatibility. Browser tests verify typed return, input JSON Pointers, raw duplicates and trailing-field injection rejection, safely rendered source-like strings, Stop without partial result, and historical results/late-diagnostic isolation after input edits. Exact-head CI and published acceptance are pending for this increment.

Joffrey independently reviewed `e058357` and found displayed input diagnostics stayed current-looking when arguments/target changed after the response. Fixed by tracking diagnostic provenance and clearing input-dependent messages on edits while retaining applicable source Syntax/Type/Purity errors. A post-response edit regression passes alongside the existing in-flight edit regression; no finding was waived.

PR #4 shipped at `b2c353b0cd3fec263c5957ce4c0f3052529daec8`: PR Checks `42648448982`, post-merge Checks `42649043315` and Pages `42649043302` passed. Live WASM verified record input → typed Int/900, nested exact max-i64 return, zero probe cards/no top-level output, input-path error with no execution/result, post-response edit provenance, Stop with no accepted result, and Agent/Human invocation docs. [Acceptance evidence](https://github.com/suhaasbadada/wisp/pull/4#issuecomment-6744810668).

## Machine contract local verification

77 Rust tests, 146 exact native/WASM comparisons and 21 Chromium integration tests passed with fmt/Clippy/TypeScript/static build. The native command, actual WASM operation and generated static `agent.json` agree; three manifest examples execute with declared outcomes, relative contract links resolve against the static base, and code names/kinds/meanings match the checked Errors reference. Cases cover arithmetic zero vs overflow, distinct limits, nested blocked-probe and artifact-Unknown status exceptions, CLI-created diagnostics, malformed/null/duplicate/required-source request compatibility, source-independent non-reflective discovery and synthetic unknown-future-code client fallback. A pinned pre-change semantics-5 artifact and exact raw invoice invocation key/result/fuel/allocation remain unchanged. Exact-head remote CI and live deployment acceptance remain pending for this increment.

Joffrey independently reviewed `9e2dd17` against the merged typed-invocation baseline and found no substantive issues. Independent verification passed 77 Rust tests, 146 native/WASM comparisons, fmt/Clippy/TypeScript/diff checks; the reviewer did not rebuild generated WASM/site or rerun Chromium/remote CI. Primary verification rebuilt both generated interfaces and ran the complete browser suite separately. Astra challenged the machine contract before implementation.

PR #5 shipped at `6f3bc4d4531ee7549bcb41dcb52a49be6b730deb`: PR Checks `42652909282`, post-merge Checks `42653967597` and Pages `42653967901` passed. Live manifest HTTP200/application-json contained 11,996 UTF-8 bytes, eight operations, 44 codes and three examples; all five relative Docs links returned HTTP200. Live WASM emitted distinct zero-divisor/overflow codes, manifest twice(21) returned typed42, and Agent/Human discovery/error docs were verified. [Acceptance evidence](https://github.com/suhaasbadada/wisp/pull/5#issuecomment-6745519195).

## Probe context local verification

83 Rust tests, 184 native/WASM comparisons (37 exact serialized-byte context cases with independently reconciled source SHA-256/ranges/framing/counters) and 24 Chromium integration tests passed with fmt/Clippy/TypeScript/static build. Tests cover atomic zero/exact/one-short/multibyte/clamped budgets, deterministic closure/deduplication, syntax/type/purity before selection, no runtime execution/usage/observations, all-fit with scope omissions, prelude/preceding/following probe distinctions, revision-local duplicate selection identities, separate function Agent View/ghost/invocation compatibility, source/selector/budget history and late reply/cancel exclusion, and literal hostile-text rendering. Manifest now advertises nine operations, 45 additive diagnostic codes and four runnable examples. Pinned semantics-5 artifact and invocation identities remain unchanged. Exact-head CI and live acceptance are pending for this increment.

Joffrey independently reviewed `ccf42c2` against merged machine-contract baseline and found no substantive issues. Independent checks passed 83 Rust tests, 184 native/WASM comparisons, 24 Chromium tests and TypeScript; the reviewer did not regenerate WASM/static assets or rerun fmt/Clippy. Primary verification rebuilt interfaces and ran those static checks separately. Astra challenged selection, accounting, identity and scope before implementation.
