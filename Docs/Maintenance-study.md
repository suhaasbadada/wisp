# Repeated dependency and stale-evidence study

Follow-on: [policy workbench v1](Workbench.md) now implements the first concrete
workflow slice. The product-decision section below records the study-time plan,
not a claim that further evaluation or feature upgrades are unnecessary.

## Result

**Both arms completed all three repetitions.** Each of six locked candidates passed exact preservation/compilation gates and 547 finite full-Decision invocations. All six structured history assertions matched the scenario. Assertions and self-reported logs are not authenticated execution telemetry or proof of understanding.

| Arm | Functional acceptance | Matching reported history assertions |
| --- | --- | --- |
| Wisp | 3/3 repetitions | 3/3 |
| Strict TypeScript / BigInt | 3/3 repetitions | 3/3 |

These are repetitions of **one** authored warehouse scenario, not six independent tasks or 3,282 independent agent trials. The result demonstrates neither a Wisp advantage nor uselessness. It does not test missing capabilities needed by broader workloads.

## Task and stronger baseline

Sherlock independently designed a pallet-admission task: three record types, 15 functions, transitive dependencies and an unrelated dashboard component. The current baseline mishandles partially filled pallets and hold expiration. Historical failure input 0 now passes on that still-faulty baseline; fresh input 1 fails. Agents must repair current behavior without treating old replay as acceptance, preserving signatures, public tests, history and every byte outside one or two parsed bodies.

Wisp uses the actual Rust compiler/interpreter, typed calls, guarded edits and historical artifacts. TypeScript uses actual strict tsc, BigInt, checker-resolved call/context navigation, full-source fallback, public tests and reproducible historical source replay. Both may read all source and author tests; no forced tool sequence or context budget. There is no regex-only or signatures-only straw baseline.

The Wisp source is 3,870 UTF-8 bytes; TypeScript is 4,118. They have the same single-file subsystem layout because Wisp has no native modules. This is larger than the first repairs, **not a production repository or meaningful large-context stress test**. Evidence logs show direct full-source reading; two TypeScript attempts requested compiler context. We cannot infer that Wisp's context selection helped or was unnecessary at larger scales.

## Provenance and procedure

- Independent design: Sherlock; materialization/preflight: a separate Bob session; trials: six fresh configured Bob sessions. These are separate agent sessions, **not independent external human authors/users** or verified distinct model identities.
- Inputs/tools were frozen before attempts in commit `701f268`. Exact hashes: `evaluation/maintenance/frozen.json`. Preflight executed both references (547/547), all eight negative controls per arm, actual history reproduction and the misleading passing old replay.
- Three repetitions per arm used seeded randomized pair order with alternating first arm: Wisp-2, TypeScript-2, TypeScript-3, Wisp-3, Wisp-1, TypeScript-1. The switch from unrestricted sorting to counterbalanced pairs was made and disclosed before freezing/attempts, not chosen from outcomes.
- Candidates, decisions and evidence were locked before grading at `72eb2559b7beead82e84d57d5d644f04a0d4b9af`. No parent solution edits, sibling feedback or private grader feedback preceded final lock. Full-source public debugging was allowed.
- `evaluation/maintenance/results.json` is the original grading report from that clean locked revision. Inputs, cases, history, references, submissions and logs remain unchanged; acceptance is reproducible in CI.
- The final TypeScript session was interrupted **before launch** by a transport failure. The original timing boundary is retained; a resumed boundary excludes that gap. No completed attempt was replaced. Timing files and the lock disclose this correction.

Artifacts and self-reported evidence: [repository study directory](https://github.com/suhaasbadada/wisp/tree/main/evaluation/maintenance). `private/` means withheld from trial instructions, **not technically inaccessible**: all sessions used one assigned checkout with instruction-only restrictions. Complete host interaction/access audits and verified model/settings/token records were unavailable. No blind or security-isolated holdout claim.

## Limits and measurements

Post-study tooling maintenance: exact snapshots of the four public documentation
inputs and original lifecycle source now live under `historical-inputs/`. Their
hashes still match the original, unchanged manifest. Live documentation and the
snapshot resolver can evolve; cases, execution/grading helpers and final
submissions remain hash-verified at their original live paths. New reports record
current tooling hashes separately. This changes neither the original study
results nor any acceptance expectation, and does not hide changed grading logic.

Actual grading checks every returned Decision field against an independently authored unit-placement oracle, rather than copying the implementation's rounding formula. The 547 invocations include seven public examples and a 540-case grid; semantic inputs may overlap and the valid domain is not exhausted. Errors, Unknown, incomplete reports and changed specifications cannot pass. Finite acceptance is not a proof.

Participant history assertions are scored separately from functional acceptance. Matching flags do not authenticate reproduction or establish general reasoning ability. Evidence logs are useful self-reports, not verified command/interaction telemetry.

Native fuel/allocation and grader command/byte/time measurements describe this execution infrastructure. Wisp invokes a process per case; TypeScript batches calls. They are not a fair runtime or agent-efficiency comparison. Host dispatch windows include scheduling, tools and boundary overhead, not model-inference latency. Actual model settings, agent tokens and peak model context remain unmeasured/null. No token savings, causal advantage, general success-rate estimate, graph novelty or production-readiness claim is made.

The prior pilot's Wisp refund boundary failure is still preserved; this new result does not retroactively repair it or change its score.

## Reproduce

```sh
npm ci
cargo build
npm run test:maintenance
npm run evaluate:maintenance -- --out /absolute/path/to/NEW-result.json
```

The evaluator verifies frozen inputs and locked final hashes before/after grading, refuses overwriting output and returns 0 for these accepted finals. Only run trusted authored TypeScript submissions: bounded subprocesses are **not security sandboxes**. No Docker, paid infrastructure, core host permission or language semantics change.

## Product decision: build a useful workflow

Do not keep adding benchmarks until an advantage appears. This scenario fits Wisp today and does not settle whether missing modules, collections, richer data types or integrations are necessary for broader useful work. Separate **missing capability**, **usability friction**, and **demonstrated design disadvantage**.

The next milestone is an **agent-facing policy-change workbench**: structured case suites, exact revision-linked before/after decisions, explicit behavioral differences and reviewable acceptance evidence. Use a concrete reservation-policy workflow as the first end-to-end example. Add the smallest missing capabilities that workflow requires, with tests and contracts, rather than expand syntax speculatively. External IO stays in explicit host adapters, not arbitrary core execution. This is a planned product direction, not a shipped capability or a promised advantage.
