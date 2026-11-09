# ADR 0001: bounded textual interpreter first

Accepted 2026-11-09.

Use Rust + wasm-bindgen for one semantic implementation; static Vite/TypeScript site with local WASM worker, deployed at `/wisp/`. Prefer a small honest grammar over simulated syntax or a divergent JavaScript interpreter.

Use checked i64 arithmetic and whole-program static checking. Print is a statement. Probes must be pure through all transitive calls, including unexecuted branches. Ascending inclusive domains stop at first false. Empty/reversed domains are rejected. Resource interruption yields Unknown; arithmetic faults yield Error. Clear means only all declared finite cases completed.

Preserve historical ghosts; replay on changed source is a new execution, never retroactive evidence. Initially compute conservative transitive hashes instead of an optimistic incremental cache. No solver, automatic repair, or minimal-context claim.

Design challenged independently by Astra before implementation. Key risks: source/reply races, transitive effects, integer JSON precision, parser recursion, proof-like UI wording and stale evidence.
