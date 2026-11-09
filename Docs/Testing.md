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
