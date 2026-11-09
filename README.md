# Wisp

**Built for agents. By agents.**

An experimental, function-oriented, statically typed language exploring inspectable context, replayable failure witnesses, and revision-aware finite evidence. One real Rust lexer/parser/checker/interpreter powers the native CLI and local WebAssembly playground. No backend, API key, or JavaScript language interpreter.

**[Playground](https://suhaasbadada.github.io/wisp/)** · **[Agent / Human docs](https://suhaasbadada.github.io/wisp/documentation/)** · **[Engineering scope](Docs/Scope.md)** · **[Protocol](Docs/Protocol.md)**

```wisp
fn bill(snacks: Int) -> Int {
  if snacks >= 10 { snacks * 80 } else { snacks * 100 }
}
print(bill(9));
probe n in 1..=11 { bill(n + 1) >= bill(n) }
```

The first counterexample is `n = 9`: ten snacks cost less than nine. Replace the discount branch with `900 + (snacks - 9) * 80` and all **11 declared adjacent comparisons** pass. That is finite evidence, not global proof or a decision about intended pricing. Historical ghosts remain attached to their original revisions; replay is a new single-input execution.

## Try it

```sh
cargo run -- examples/snacks.wisp
cargo run -- examples/snacks-repaired.wisp
cargo test
# Agent-friendly commands (check/focus do not execute):
cargo run -- check examples/snacks.wisp
cargo run -- focus examples/snacks.wisp bill --budget 1024
cargo run -- archive examples/snacks.wisp --out snacks.wisp-ghost.json
cargo run -- inspect snacks.wisp-ghost.json
cargo run -- replay examples/snacks-repaired.wisp --artifact snacks.wisp-ghost.json
# Same JSON dispatcher as WASM:
printf '%s' '{"op":"run","source":"print(1 + 2);"}' | cargo run -- --json
```

Browser development (Rust, Node 24+, wasm-pack 0.15.1):

```sh
rustup target add wasm32-unknown-unknown
cargo install wasm-pack --locked --version 0.15.1
npm ci
npm run wasm
npm run check
npm run build
npx playwright install chromium
npm test
npm run dev
```

Open the printed local URL at `/wisp/`. Documentation defaults to Agent on fresh visits; Human is an explicit alternative. See [verification](Docs/Testing.md), [architecture](Docs/Architecture.md), [decisions](Docs/Decisions/0001-first-playable.md), [contributing](Docs/Contributing.md) and [roadmap](Docs/Roadmap.md).

Ghosts can now be explicitly exported/imported as local JSON files in the playground and CLI. **Files include the entire historical source and execution limits**: review before sharing. Rust reproduces the exact recorded first failure before accepting a file; reproduction is not authentication of who ran it or when. No upload or automatic persistent storage. The CLI refuses to overwrite existing artifact paths. Explicit command exit states and the shared format are documented in [CLI.md](Docs/CLI.md) and [ADR 0002](Docs/Decisions/0002-portable-failure-artifacts.md).

## Honest boundaries

Checked i64/Bool/String, immutable let, typed functions/blocks/if, captured print, bounded pure finite probes. Limits produce Unknown, runtime faults Error. Agent View exposes compiler-derived call facts, body/signature boundaries, omissions and UTF-8 text-budget overflow—not guaranteed relevance, minimal slices or context completeness. Logical allocation counters are not absolute browser memory bounds. No result cache or solver. Records, unions, structured editing, persistent stable IDs and C backend are deferred.

Wisp is **not production-ready**. No speed/token/memory superiority is measured or claimed. Context benefits, novelty and adoption remain hypotheses; graph-oriented prior art includes Sley, Zerolang and Unison. **License pending owner selection**—do not assume an open-source license from public visibility.
