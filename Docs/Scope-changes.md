# Scope change log

- 2026-11-09 (post-first-playable): ADR 0002 adds explicit portable failure artifacts and usable native agent commands. This is workflow hardening, not a language-syntax or proof-engine expansion. Files include source; no automatic upload or persistent browser archive.

- 2026-11-09: pinned first-playable scope and ADR 0001 before code. Records/errors, structured semantic edits, persistent symbol IDs, solvers and native C backend explicitly deferred. No requirements relaxed to make tests pass.
- 2026-11-09: implementation contracts added in Language/Protocol/Playground. Conservative evidence keys include execution prefixes because earlier code consumes shared budgets; no result cache. Documentation route is `/wisp/documentation/` to avoid a case-only collision with required `Docs/` on macOS. Ghosts persist through edits in the page session, not reloads; no archive promised.
