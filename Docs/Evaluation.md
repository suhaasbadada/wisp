# Product-validation pilot v1

Follow-up: the [repeated dependency/evidence study](Maintenance-study.md) completed
three repetitions per arm on one larger synthetic task. Both arms passed; it does
not replace or repair this pilot's failure. Product direction now prioritizes an
end-to-end policy-change workbench rather than indefinite benchmark accumulation.

## Outcome and decision

**Five of six final submissions met the frozen task contract. Wisp: 2/3; TypeScript: 3/3.** This is a small workflow pilot, not a representative benchmark, statistical ranking, token-cost comparison or proof of usefulness to external users. Keep language features frozen; improve boundary communication and measurement before broadening the language.

| Task | Wisp | TypeScript |
| --- | --- | --- |
| Shipping slabs | Accepted; 34/34 finite cases | Accepted; 34/34 |
| Discounted refunds | **Rejected by byte-preservation gate; behavior not graded** | Accepted; 1,050/1,050, including protected-helper calls |
| Quota admission | Accepted; 153/153 | Accepted; 153/153 |

These are **three agent tasks per arm**, not thousands of independent agent trials. Agents could iterate on self-authored public tests before one final submission. No parent solution repairs or grader feedback preceded the submission lock.

## Frozen design and provenance

- Inputs/procedure committed before attempts at `ef02699`: matched task briefs, analogous faulty sources, exact one-function-body constraints and deterministic mathematical oracles.
- Six fresh native sessions used configured `bob` without model/option overrides, in Wisp shipping/refund/quota then TypeScript shipping/refund/quota order. Actual model/settings and token telemetry were not exposed. Sequencing, language familiarity and implementation-agent familiarity are uncontrolled.
- Final submissions and self-reported evidence locked at `0cd894d1b62d114a5211801ca32f68a52b56a6ae` **before** grading. Hashes: `evaluation/submissions/locked.json`. No parent modification of submission/log after scoring.
- Original machine report: `evaluation/pilot-results.json`, retained verbatim. Its Git head identifies the locked commit. `dirty:true` includes the result itself: the first harness created output before collecting Git status.
- Original `compile_check:false` on Wisp refund means the combined gate did not complete, **not** language compilation failure. `cases_passed:0` means behavior was not graded, **not** 1,050 wrong answers. The structural error is authoritative.
- A post-score instrumentation correction adds explicit report-count/unchecked-compile fields, binary/evaluator/worker hashes and captures Git status before output creation. Cases, requirements, submissions and grades are unchanged. The pilot replay test checks original outcomes/hashes. An audited rerun is stored separately in `evaluation/pilot-audited.json`; it does not replace original evidence.

Artifacts live in the repository's [evaluation directory](https://github.com/suhaasbadada/wisp/tree/main/evaluation). Logs are agent self-reports, not complete tool transcripts; automated access audits and model usage records were unavailable. Access restrictions were instructional in a shared checkout, **not technical holdout isolation**. The author wrote tasks/oracles and supplied public-doc pointers; this is not blind external onboarding.

## What the failure means

The Wisp refund repair changed the intended arithmetic but inserted a blank line **after** the parsed closing brace. `wisp edit` permits outer whitespace by design; its prefix/suffix audit preserves original bytes around the submitted insertion. The stricter task contract allows changes only inside the parsed body. The submission violated that rule and was rejected before behavioral grading.

Its evidence log claimed a body-only edit. Exact recomposition, not that self-report, determined acceptance. We did not trim it, relax the grader, repair the submission or substitute its own public-test results. This is an integration/contract-interpretation failure, **not evidence of a broken Rust preservation audit or incorrect refund arithmetic**.

The shipping Wisp agent independently noticed this whitespace distinction and removed outer whitespace during its own iteration. Documentation now clarifies parsed body vs insertion ranges for strict clients; core behavior is unchanged.

All three TypeScript logs reported a scratch CommonJS/ES-module loading failure under this repository's `type:module` package, then a self-resolved setup adjustment. This is observed environment friction, not measured language disadvantage. The grader uses actual strict tsc, BigInt and batched Node calls in a CommonJS temporary directory.

## Measurements and limitations

Measured acceptance: exact preservation, whole-source compilation, typed outputs, finite cases, faulty-starter negative controls and replay of locked outcomes. Errors, Unknown and missing results never pass.

Raw command counts, response bytes and elapsed milliseconds are **grader infrastructure measurements only**. Wisp starts a process per case; TypeScript batches each task after compilation. These are not matched agent effort, token cost or runtime-language performance. Agent tokens, peak model context, latency and verified intervention telemetry remain **unmeasured** (null in the lock).

Limitations: one sequential attempt per cell; three short single-file repairs with known issue reports; shared-checkout honor-system restrictions; no external author/user; no randomized repeats, repository/dependency-graph baseline, verified identical exposed model/settings, maintainability study or production workload. Strict TypeScript/BigInt is credible for these tasks, not the strongest possible repository protocol. Finite acceptance proves neither all-input correctness nor superiority, novelty, adoption or product-market fit.

## Reproduce acceptance, not stochastic agent behavior

```sh
npm ci
cargo build
npm run test:evaluation
npm run evaluate -- --out /absolute/path/to/NEW-result.json
```

Direct evaluation intentionally exits **1** because the locked Wisp refund failed. `test:evaluation` should pass: it checks the grader, negative controls and **preservation of that failure**. Never execute untrusted submissions: the Node subprocess is **not a security sandbox**. No new core permission or paid infrastructure. Preregistered instructions remain frozen in `evaluation/README.md`.

## Next validation gate

Independent Joffrey review of `de2f009` and the audited report found no substantive
defects. It replayed acceptance with expected exit 1, verified unchanged frozen
inputs/locked artifacts, and passed 17 evaluation tests, 99 Rust tests,
TypeScript, fmt and strict Clippy. This reviews the harness/evidence, not a blind
replication of agent behavior; access/settings remain unverified.

Capture actual usage/settings; use independently authored tasks and technically separate grader material; randomize/repeat matched trials; include strong existing-language graph/full-protocol tooling for repository-scale work; preserve complete interactions. Revisit the body/insertion boundary with external agents before deciding whether Wisp materially improves success or effort. These six observations establish no quantitative advantage.
