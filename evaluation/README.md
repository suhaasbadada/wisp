# Wisp product-validation pilot v1

This is a small, authored **workflow pilot**, not a language benchmark or a representative estimate of agent success. Language features are frozen. Three maintenance tasks cover shipping slabs, invoice rounding and quota admission with signed-i64 extremes. Both arms receive the same requirements, analogous faulty implementations, the same one-function-body change constraint, and the same final mathematical acceptance cases.

## Preregistered procedure

1. Freeze task briefs, starters, protocol and acceptance generator in `frozen.json` **before** trial attempts. The grader verifies these hashes and fails closed; never regenerate them to accommodate a submission.
2. Run six fresh agent sessions, one per task/arm, in shipping/refund/quota order within each arm. Use the same configured agent identity (`bob`) without overriding its model/options. Record actual exposed model/settings or null, never guess. These first pilots are sequential, unrandomized and one attempt per cell; they cannot separate task, order, language familiarity or model effects.
3. Supply only that task's brief/starter, relevant public language/CLI docs and this procedure. Permit ordinary code search and compiler/test tooling. Wisp can use the documented check/context/edit/call/run/archive/replay CLI; TypeScript can use strict tsc, source navigation and self-authored Node tests with BigInt. No forced tool sequence. Neither arm gets held-out cases, grader source, sibling submissions or implementation internals in its brief.
4. One final submission per cell, no grader feedback or parent repairs before scoring. Agents may iterate using their own tests/public examples. Changes must replace exactly one existing function body, preserving all other bytes; refund's `unit_net` is protected. Use each original public interface. No imports, host IO/network/process actions in submitted TypeScript. Both arms use integer-string JSON at grading boundaries; TypeScript uses bigint, not lossy number.
5. Ask each agent for a short evidence log: root cause, public checks, limitations, and final file. Preserve failures as failures; do not change specifications. Run final acceptance only after all six submissions are locked. Subsequent harness repairs must be disclosed and may not change frozen cases.
6. Report first-attempt task completion separately from case coverage and workflow observations. A passed compile/Ready is not behavioral success; every task requires structure, compilation and all its finite cases to pass. Error/Unknown/missing results fail. No claim of proof, universal correctness, context completeness, user adoption or superiority.

Trials use the same working tree with **instruction-only access restrictions**, not technical isolation or a sealed holdout. Native agent sessions do not expose verified token usage/model settings here. The parent authored tasks/oracles; the same configured implementation agent previously worked on Wisp. These are substantial familiarity and author biases. Results justify further trials, not market claims. Agent self-reports are not verified telemetry.

## Reproduce finite acceptance

```sh
npm ci
cargo build
node --test scripts/evaluate.test.mjs
node scripts/evaluate.mjs --out /absolute/path/to/NEW-result.json
# Optional: --task shipping --arm typescript
```

Default submissions: `evaluation/submissions/wisp/{task}.wisp` and `evaluation/submissions/typescript/{task}.ts`. Results include source hashes, frozen input hashes, compiler/tool versions, exact Git head and dirty flag. Output creation is exclusive: existing files are not overwritten. Exit 0 means all selected cells passed; 1 means failed acceptance; 2 means invalid CLI/output destination. Unit tests use separate trusted fixtures, not trial submissions.

The TypeScript baseline uses the actual strict compiler, BigInt and a batched Node invocation adapter. Wisp uses the actual Rust core, compiler-generated metadata and guarded preparation, then typed calls. The structural gate forbids tests/probes/signature edits in both arms. This suite is only three small single-file repairs; there is **no existing-language dependency-graph baseline**, large-repository task, blinded independent author, randomized repetition, external agent/user or production workload yet. The baseline is strong for these single-file tasks but not evidence against stronger repository tooling.

## Measurements and safety

- Measured grader command counts, stdout+stderr bytes and elapsed time describe **acceptance infrastructure**, not agent effort, task-token savings, model latency or runtime-language performance. Wisp invokes a process per case; TypeScript batches calls—do not compare those numbers as language performance.
- Agent input/output/total tokens, peak model context, intervention telemetry, model settings and agent latency are **not measured** unless actual harness evidence becomes available. Do not substitute byte counts, self-reported numbers or grader timings.
- A single sequential trial per cell gives no variance or causal advantage estimate. Do not combine unrelated finite cases into thousands of independent agent trials.
- Only execute trusted, self-authored evaluation submissions. The Node subprocess is **not a security sandbox**. Command time/output caps are operational bounds, not prevention of host IO or descendant processes. No Docker, network service, paid API or new core permission is needed.
- Store trial scratch files only under the assigned worktree or authorized temporary directory; never overwrite an original starter or unrelated user file. No new branches/worktrees or commits from trial sessions.

## Decision gate

Proceed to externally authored, repeated trials only if these pilots can complete without parent solution coaching and the workflow is understandable. Otherwise prioritize observed friction, preserve unsuccessful attempts and rerun a new, versioned task set. Broad language features remain out of scope. Quantitative superiority or token-cost claims require actual usage capture, matched models/tool budgets, randomized/repeated runs and strong full-protocol baselines.
