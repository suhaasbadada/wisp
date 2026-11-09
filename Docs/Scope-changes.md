# Scope change log

- 2026-11-09: ADR 0003 advances the previously agreed records direction for invoice/inventory data. Explicit immutable nominal construction/projection and bounded aggregate operations only; no object model, recursive types, mutation or host permissions. Compiler identity will change; old-compiler artifacts are rejected explicitly rather than migrated.

- 2026-11-09 (post-first-playable): ADR 0002 adds explicit portable failure artifacts and usable native agent commands. This is workflow hardening, not a language-syntax or proof-engine expansion. Files include source; no automatic upload or persistent browser archive.

- 2026-11-09: pinned first-playable scope and ADR 0001 before code. Records/errors, structured semantic edits, persistent symbol IDs, solvers and native C backend explicitly deferred. No requirements relaxed to make tests pass.
- 2026-11-09: implementation contracts added in Language/Protocol/Playground. Conservative evidence keys include execution prefixes because earlier code consumes shared budgets; no result cache. Documentation route is `/wisp/documentation/` to avoid a case-only collision with required `Docs/` on macOS. Ghosts persist through edits in the page session, not reloads; no archive promised.
