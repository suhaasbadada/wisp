# ADR 0002: portable failure artifacts and native agent commands

Accepted 2026-11-09. First playable is shipped; the next increment closes the workflow between browser and native CLI without expanding language syntax.

## Objective

A failure should outlive a tab and be shareable as an explicit local file. Add versioned, single-ghost JSON artifacts containing historical source, exact compiler identity, effective limits and immutable receipt. Add native `run`, `check`, `focus`, artifact export/inspection and replay commands. Keep the existing file and `--json` entrypoints compatible.

Validation belongs in Rust, shared with WASM. Imported files are untrusted, bounded data, never executable host code. Validate format/version/compiler, source revision, receipt integrity and reproducibility of the exact recorded first failure under archived configuration. Reproduction is a new bounded execution, not authentication of claimed history. Reject unsupported versions/compiler identities; do not silently migrate specifications or choose intent.

Browser export/import is explicit. Files contain source and may contain sensitive business logic; show that fact before export. No automatic localStorage archive, upload, network storage or telemetry. Keep in-memory historical sources unchanged after import and edits. Replay on current source remains a new single-input execution, not full-domain Clear. The sandboxed core still has no filesystem/network permissions; host CLI/UI own file IO.

## Acceptance

- A browser-generated artifact validates and replays n=9 through native CLI; a CLI artifact imports into the browser and survives a reload via explicit re-import.
- Corrupt source/hash/receipt/config, unknown versions/compiler, non-failing historical claims, malformed/oversized files and changed predicates are errors, never passing evidence.
- Historical configuration is distinct from current replay limits. Unknown reproduction cannot be accepted as reproduced failure.
- Native `check` does not execute print/probes. Focus reports byte-budget overflow truthfully. New command exit states are documented; old JSON transport compatibility is preserved.
- Update docs/tutorials/protocol/tests with every implemented behavior. No records, solver, persistent symbol IDs or result cache added in this increment.
