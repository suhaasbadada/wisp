# Wisp engineering contract

- Work only in the assigned task worktree. Preserve unrelated work.
- Every behavior change updates the relevant `Docs/` contract and tests.
- No license has been selected. Do not add one without the owner's choice.
- Never claim finite tests prove a property, a graph is context-complete, or Wisp outperforms other languages without measurements.
- The Rust core is the sole language implementation; browser TypeScript is transport/UI only.
- No arbitrary host execution, filesystem or network access in the language core.
- Checks: `cargo fmt --all -- --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test`, `npm ci`, `npm run check`, `npm run build`, `npm test`. Build WASM first using `npm run wasm`.
- No Docker is needed. Any Docker test must run through `~/.local/bin/docker-test` after reading `~/.config/opencode/docker-tests.md`.
- Before merging: independent review and fresh CI for the exact PR head. Deploy only trusted main via Pages Actions; never run fork PR code with deployment privileges.
