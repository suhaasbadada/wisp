# Verification

## Reading historical checkpoints

This is an accumulated verification log, not a live CI dashboard. Older sections
retain the local/pre-publication checkpoint as it was recorded: “pending” or
“under verification” there does not reopen a subsequently accepted release.
Use the corresponding **“PR #N shipped at”** entry and linked release-acceptance
comment for the exact released SHA, CI, deployment and functional evidence.
Review scope and limitations still apply: later acceptance does not turn a
primary check into independent review or erase an earlier failure. Current run
state must be checked at its exact revision; an old green release is not evidence
for a new head.

## Saved exact-candidate review (under publication)

Bob's native unit passed ten new CLI tests and the 180-test Rust suite. Five
Python candidate-review tests and 43 MCP tests passed; workflow totals 147 Python
tests. Strict SDK checks retained Ready preparation, seven failed saved candidate
expectations and original behavior unchanged. Five-operation missing/old/drift
guards passed. The initial parity test re-serialized the saved suite and changed
its identities; correcting the test to preserve exact raw suite tokens restored
full parity without changing the saved expectations or runtime. Full prescribed
checks passed: 180 Rust, 41 Node, 147 Python, 326 native/WASM comparisons,
36 Chromium, fmt/Clippy/npm ci/WASM/check/build. The exact hash-locked SDK step
passed all five reports with 7/13 tools, saved candidate Fail and original behavior
unchanged. Joffrey independently reviewed with no substantive findings and passed
53 candidate-client/existing verification/MCP tests; native and SDK changes were
inspected, not independently executed. Exact-head Linux CI/publication pending.

PR #31 shipped at `1c1fa2603902d0099c29b07ffd559e88855348e8`: PR Checks
`42875245223`, merge Checks `42876131419`, Pages `42876131577`, deployment
`7690804516` passed. Actual PR/merge saved-preparation SDK reports, equal package
inventories, adverse evidence, immutable strict SDK and five public contracts are
[accepted](https://github.com/suhaasbadada/wisp/pull/31#issuecomment-6775936341).

## Saved-project body preparation

Bob's native implementation passed 13 new CLI tests and the 170-test Rust suite.
Five Python client preparation tests and 40 MCP tests passed; Python workflow
totals 139. Strict SDK discovery/preparation passed with twelve configured tools;
failure/reconnect coverage now checks all four saved operations. Full prescribed
checks passed: 170 Rust, 41 Node, 139 Python, 326 native/WASM comparisons,
36 Chromium, fmt/Clippy/npm ci/WASM/check/build. The exact hash-locked SDK workflow
passed all five reports with saved preparation Ready in both configured modes.
Joffrey independently reviewed with no substantive findings and passed 45 focused
Python/MCP tests; native tests were inspected, not independently executed.
Exact-head Linux CI/publication remain pending. Original files
and saved decisions are unchanged by preparation; full candidate output is not a
measured token-saving claim.

PR #30 shipped at `73b1f92bfc1fb7fb4150a01f35fd93f948b9ff14`: PR Checks
`42866696413`, merge Checks `42867694944`, Pages `42867695006`, deployment
`7689655032` passed. Actual PR/merge edit SDK reports, equal package inventories,
adverse cases, immutable strict release SDK and four published Docs contracts are
[accepted](https://github.com/suhaasbadada/wisp/pull/30#issuecomment-6774795361).
The first public verifier incorrectly requested unpublished root README.md and a
following shell command prematurely posted completion; the claim was promptly
corrected, actual published Docs were checked and the immutable smoke then passed.

## MCP guarded body preparation

Bob implemented the transport/schema and five additional MCP tests; 37 local
MCP tests passed, including exact Rust parity, Unicode/trivia and non-body
preservation, stale source/body guards, diagnostic ownership, strict boundaries
and Rust-enforced caps. All three official SDK modes passed discovery (7 default,
11 configured), real Ready preparation, separate finite review Pass and stale edit
Error. Primary full prescribed checks passed: 157 Rust, 41 Node, 131 Python,
326 native/WASM comparisons, 36 Chromium, fmt/Clippy/npm ci/WASM/check/build.
The exact hash-locked SDK workflow step passed locally with all five reports,
including Ready preparation/separate review Pass/stale Error in every smoke mode.
Joffrey independently reviewed with no substantive findings and passed the five
new focused MCP tests; he did not duplicate builds or SDK runs. Exact-head Linux
CI/publication remain pending. No Rust language implementation or semantics changed.

PR #29 shipped at `4040e2603e584592c2ee16fcdc1a153474ca4e28`: PR Checks
`42796920075`, merge Checks `42797374296`, Pages `42797374738`, deployment
`7679316986` passed. Actual PR/merge five SDK reports, equal package inventories,
adverse evidence and four published documents are
[accepted](https://github.com/suhaasbadada/wisp/pull/29#issuecomment-6774317400).
The earlier in-progress snapshot remains Unknown/missing_required_job, reproduced
by offline replay and strict MCP; later release success does not relabel it.

## Historical-status documentation maintenance

The reading note above clarifies archived local checkpoints without replacing
historical results or review limitations. ADR 0011 now links its already-recorded
PR #11 acceptance and explicitly preserves the lack of independent post-fix
re-review. TypeScript checking, documentation build and `npm test` passed:
41 Node, 126 Python, 326 native/WASM comparisons and 36 Chromium tests, including
frozen study preservation. Joffrey independently inspected the reading note and
ADR 0011 correction with no substantive findings; no tests were run by him.
This documentation-only maintenance does not rerun or upgrade historical release
acceptance. Rust fmt/Clippy/tests and SDK scripts were not rerun for these prose
changes; immutable PR #28 release checks below are separate evidence.

PR #28 shipped at `06509366b21a6d9bc256a8f4962dd6d6f6c016ad`: PR Checks
`42795633038`, merge Checks `42796226095`, Pages `42796226605`, deployment
`7679157894` passed. Actual PR/merge five SDK reports, equal package inventories,
adverse evidence, immutable hash-locked release SDK checks and three public
contracts are [accepted](https://github.com/suhaasbadada/wisp/pull/28#issuecomment-6764622743).

## Real-SDK saved-policy failure regressions

The exact hash-locked SDK workflow shell step passed locally with five report
artifacts. The new report checks six authored verification outcomes (Pass, Fail,
runtime Error/Unknown, preflight Error/Unknown), all three strict missing/old-guard
refusals, changed-behavior adoption versus unmet saved requirements, and same-session
drift as unresolved bridge failure. These are one authored regression matrix, not
independent agent trials. Full prescribed checks passed: 157 Rust, 41 Node,
126 Python, 326 native/WASM comparisons, 36 Chromium, fmt/Clippy/npm ci/WASM/check/
build. Joffrey independently reviewed with no substantive findings; his review
was inspection-only. Exact-head Linux CI and publication remain pending.

PR #27 shipped at `c9892e2b786c7dd91db1d8b96781127d7c574e59`: PR Checks
`42794165218`, merge Checks `42794824188`, Pages `42794824083`, deployment
`7678924016` passed. Actual PR/merge four SDK reports and equal package inventories,
adverse artifacts, immutable strict release SDK and three public contracts are
[accepted](https://github.com/suhaasbadada/wisp/pull/27#issuecomment-6764440355).

## Required pinned MCP SDK CI

A fresh disposable Python 3.12 venv installed the full committed SDK dependency
lock with hashes required and wheels only; `pip check`, all three SDK modes and
historical internal triage passed. This was macOS, not the pending exact-head
Linux CI run. The existing required verify job now includes these checks, a
five-minute step limit and structured report/package-list artifacts. The exact YAML
shell step also passed in an owned local fixture; all four JSON artifacts and
package list were checked. Full prescribed checks passed: 157 Rust, 41 Node,
126 Python, 326 native/WASM comparisons, 36 Chromium, fmt/Clippy/npm ci/WASM/check/
build. Joffrey independently reviewed with no substantive findings and checked
all 30 pinned packages' hashes against PyPI metadata, including Linux CPython 3.12
wheels. Exact-head Linux CI and publication remain pending; no server runtime SDK
dependency or dependency-authenticity claim is added.

PR #26 shipped at `c57c0707d0a2aece13f635b57bc5e9f0b79e8900`: PR Checks
`42792515022`, merge Checks `42793111572`, Pages `42793111632`, deployment
`7678678941` passed. Immutable SDK/internal triage, adverse artifacts and four
public contracts are [accepted](https://github.com/suhaasbadada/wisp/pull/26#issuecomment-6764179220).

## Saved-policy finite-suite verification

Ten native tests passed in Bob's 157-test Rust suite, including exact core report
parity, all four guards, Pass/Fail/Error/Unknown, raw JSON, confinement and selected
scope. Five Python client verification tests and 32 MCP tests passed; Python
workflow totals 126 tests. Strict ten-tool SDK discovery/verification and internal
historical CI triage passed: eight finite expectations Pass/16 fresh attempts,
then a separate Observed decision, never approval. Full prescribed checks passed:
157 Rust, 41 Node, 126 Python, 326 native/WASM comparisons, 36 Chromium,
fmt/Clippy/npm ci/WASM/check/build and all three official SDK modes plus internal
triage. Joffrey independently reviewed with no substantive findings and passed
42 Python verification/MCP/focus tests. Exact-head CI and publication remain
separate pending gates. Finite tests do not establish requirements sufficiency.

PR #25 shipped at `18e30b58f5328a4cb8bb83fcb092e5a05b52fdb4`: PR Checks
`42790205664`, merge Checks `42790868990`, Pages `42790868985`, deployment
`7678335099` passed. Immutable 17 transport regressions, three SDK modes, internal
triage, adverse artifacts and three public contracts are
[accepted](https://github.com/suhaasbadada/wisp/pull/25#issuecomment-6763902922).

## Bounded native collection

Seventeen actual-subprocess transport regressions passed, including exact/default
stdout and stderr caps, one-byte overflow, UTF-8 byte counting/decoding, concurrent
pipe pressure with large stdin, deadlines, exit handling and direct-child/worker
cleanup, including injected thread-start failures. Full prescribed checks passed:
147 Rust, 41 Node, 117 Python before the added startup regression, 326 native/WASM
comparisons, 36 Chromium, fmt/Clippy/npm ci/WASM/check/build, three official SDK
modes and the internal historical triage driver. Joffrey found a startup cleanup
gap; primary repaired it and added the regression. All 118 Python workflow tests,
three SDK modes and internal driver passed after the code repair; the corrected
startup test independently passed in Joffrey's re-review with no remaining
substantive findings. Exact-head CI/publication remain pending. macOS checks are
not a cross-platform cleanup proof.

PR #24 shipped at `b57c869249ba5179e2c244d48d912d9325077e68`: PR Checks
`42788102350`, merge Checks `42788586198`, Pages `42788585841`, deployment
`7678007901` passed. Immutable three-mode SDK/internal triage, adverse artifacts
and four public contracts are [accepted](https://github.com/suhaasbadada/wisp/pull/24#issuecomment-6763593355).

## Saved-project function context

Eight native focus tests, five Python client-focus tests and 29 MCP tests passed
in focused verification; the Python workflow totals 101 tests. Native context
parity, nonexecution, guard drift, all-policy pin validation, option/confinement
errors, text budgets and explicit Error/Unknown are covered. Strict official SDK
focus/invocation and the read-only historical internal triage driver passed.
Full prescribed checks passed: 147 Rust, 41 Node, 101 Python, 326 native/WASM
comparisons and 36 Chromium tests, plus fmt/Clippy/npm ci/WASM/check/build and
all three official SDK modes. Joffrey found two malformed-report validation gaps;
primary fixed inconsistent byte-ledger and contradictory execution-field acceptance
and added regressions. All 101 Python tests, configured SDK modes and the internal
driver passed after repair; Joffrey re-reviewed with no remaining substantive
findings and independently passed 43 focused Python tests. Exact-head CI and
publication remain separate pending gates. This tests bounded
transport/context behavior, not model reasoning quality or total token savings.

PR #23 shipped at `37b94935f0136379cc5ec512383cce4e7d35210f`: PR Checks
`42783467420`, merge Checks `42784105506`, Pages `42784105617` and deployment
`7677378139` passed. Immutable three-mode SDK checks, adverse artifacts and public
contracts are [accepted](https://github.com/suhaasbadada/wisp/pull/23#issuecomment-6763301673).

## Caller-owned MCP snapshot guards

Primary full verification passed 139 Rust, 41 Node, 93 Python tests (26 MCP/native),
326 native/WASM comparisons, 36 Chromium tests, fmt/Clippy/npm ci/WASM/TypeScript/
build and three official Python SDK 2.3.0 modes (source, saved project, strict caller
guard). Seven additional MCP tests cover defensive guard metadata, exact native
evidence parity, invalid/mismatched guards before submission, behavior changes
across reconnect with unguarded negative control, readiness drift/native-error
preservation, strict schema isolation and owner configuration guards. Joffrey
independently reviewed and found no substantive issues; 26 focused tests passed.
Exact-head CI/publication remain separate gates. This is a finite stale-reasoning
regression, not authentication, intended-requirement proof or measured superiority.

PR #22 shipped at `77564e9d3457f4115d5449307808c03c0726954b`: PR Checks
`42780646278`, merge Checks `42781496644`, Pages `42781496345` and deployment
`7677010536` passed. Immutable merged project/SDK verification, actual artifacts
and public guides are [accepted](https://github.com/suhaasbadada/wisp/pull/22#issuecomment-6762705294).

## Saved projects in MCP

Primary full checks passed 139 Rust, 41 Node, 86 Python tests (19 MCP/native),
326 native/WASM comparisons and 36 Chromium tests, plus fmt/Clippy/npm ci/WASM/
TypeScript/build. Eight additional MCP checks cover owner-only project selection,
default tool absence, init failure/target/schema/compiler guards, source/manifest/
suite drift, metadata snapshot semantics, exact inline/project core parity and
native Error/Unknown/business rejection/continuation and the shared project report
byte cap. Official Python SDK 2.3.0
smokes passed both default six-tool mode and configured eight-tool mode, including
a pinned reservation call without source arguments. Joffrey independently reviewed
and found no substantive issues; 18 focused tests passed in review. Primary then
made the existing report byte cap explicit on both saved-project result paths,
added its regression and reran the entire suite and both SDK modes successfully.
This post-cap check is primary verification, not independent re-review. Exact-head CI and release
acceptance remain separate gates. Per-call input savings are not a benchmark of
total protocol volume, model tokens or latency.

PR #21 shipped at `bcdd5d423d2940e5ff737bfd6203fbaa55badcc1`: PR Checks
`42778166976`, merge Checks `42779152799`, Pages `42779152536` and deployment
`7676666935` passed. Actual artifacts, immutable merged MCP server/client smoke
against official SDK/native release and published guides are
[accepted](https://github.com/suhaasbadada/wisp/pull/21#issuecomment-6762266364).

## Local MCP bridge

Primary full checks passed 139 Rust, 41 Node, 78 Python tests (including 11 new
MCP/native tests), 326 native/WASM comparisons and 36 Chromium tests, plus
fmt/Clippy/npm ci/WASM/TypeScript/build. Tests cover fixed schemas/routes,
initialization/notifications/IDs, raw numeric i64 boundaries, native Error/Unknown/
continuation, review/context separation, malformed frames/results, quotas/compiler
drift, real EOF and SIGTERM reaping an in-flight owned native child.
Official Python MCP SDK 2.3.0 interoperability passed initialize/list/six tools,
exact i64 and Complete/Error/Unknown with no top-level execution. This optional
smoke is separate from the standard-library CI tests, not universal client proof.
Joffrey independently reviewed and found no substantive issues; 11 focused tests
and diff checks passed. Exact-head CI/publication remain separate gates.

PR #20 shipped at `5ee6f094d1610a665e728d88bb5b9ab84170bd6e`: latest-head
Checks `42775773681`, merge Checks `42777387199`, Pages `42777386684` and
deployment `7676429837` passed. Actual PR/merged receipts and replays, cross-platform
native reproduction and public quickstart/replay contracts are
[accepted](https://github.com/suhaasbadada/wisp/pull/20#issuecomment-6761975339).

## Offline replay and handoff

Count correction: earlier summaries below/on prior PRs quoted 149 Rust tests.
Direct `cargo test -- --list` enumeration confirms **139** in the unchanged suite.
That was a totaling error, not a missing/failed check; historical pass/fail outcomes
and raw CI evidence are unchanged.

Nine focused tests cover full native reproduction without GitHub, receipt hashes/
schema/fact/result tampering, policy/compiler pins before submission, output/usage/
coherent-decision corruption, business blocked/pending/unknown outcomes, real
native Error/Unknown policies, maximum input byte/depth compatibility, receipt
limits, CLI exits and closed stdout. CI retains/checks replay alongside the receipt.
Primary full verification passed 139 Rust, 41 Node, 67 Python tests (27 workflow,
9 client, 7 triage, 8 capture, 7 observation, 9 replay), 326 native/WASM comparisons
and 36 Chromium tests, plus fmt/Clippy/npm ci/WASM/TypeScript/build. Joffrey reviewed
the final guards/comparison/handoff and found no substantive issues; nine replay
tests and diff checks passed in review. Actual merged PR #19 Linux CI receipt
artifact `13741574684` reproduced exactly through the local native release binary,
with new execution and no GitHub access during replay. Exact-head CI/publication
are separate gates; consult PR #20 for their final acceptance record.

PR #19 shipped at `cbbf5401d23e86579d7a05034118fda587352a89`: PR Checks
`42771545588`, merged Checks `42772214714`, Pages `42772214741` and deployment
`7675724651` passed. Actual PR/merged receipt hashes, native release observation
and public contracts are [accepted](https://github.com/suhaasbadada/wisp/pull/19#issuecomment-6761272942).

## Workflow observation receipts (under verification)

Seven tests cover saved-byte/hash recovery, offline no-network mode, explicit
capture/native composition, capture failure before native execution, incompatible
selection, business and mocked runtime incomplete outcomes, malformed/Unicode
input, real CLI exits and closed stdout. CI retains the offline receipt and
recomputes its exact snapshot hash. A real read-only observation of PR #18 merge
`e5e96bcfd68477ac759c75fcd7c69194c7c97b82` using Checks `42770806017`, Pages
`42770806358`, explicit attempt 1 each, produced native workflow Observed with
exact captured input retained and approval not_granted. Primary full checks passed
149 Rust, 41 Node, 27 workflow, 9 client, 7 triage, 8 capture and 7 observation
tests, 326 native/WASM comparisons and 36 Chromium tests, plus fmt/Clippy/npm ci/
WASM/TypeScript/build. Joffrey independently reviewed and found no substantive
issues; seven observation and seven triage tests passed in review. Exact-head CI
and publication remain separate gates.

PR #18 passed exact-head Checks `42768233545`, merged Checks `42770806017`, Pages
`42770806358` and deployment `7675541951` for that merge. Actual PR/merged artifacts,
native read-only capture and public contract bytes are separately
[accepted](https://github.com/suhaasbadada/wisp/pull/18#issuecomment-6761045533).

## Explicit-attempt capture (under verification)

Eight focused tests cover fixed-host GET invocation, pre-network argument checks,
repository/path/head/event/attempt mismatches, changed attempts/state, job-list
truncation/duplicates/identity, pending null normalization and direct consumption
by native Wisp triage. A real read-only capture of PR #16 runs 42765846556 and
42765846687, attempt 1, at `ae1d71f8cc0d7804570f1982e323259524955c84` produced
Observed/not_granted with six GET invocations and no file creation or mutation.
Primary full verification passed 149 Rust, 41 Node, 27 workflow, 9 client,
7 triage and 8 capture tests, 326 native/WASM comparisons and 36 Chromium tests,
plus fmt/Clippy/npm ci/WASM/TypeScript/build. Joffrey independently reviewed the
capture boundary and found no substantive issues; eight capture and seven triage
tests plus diff checks passed in review. Exact-head CI/publication remain separate.

PR #17 shipped at `e6274997b1925f6953aeeac531b8e175fd50a103`: PR Checks
`42766922443`, merge Checks `42767389783`, Pages `42767389590` and deployment
`7675083543` passed. Actual artifacts verify 8 cases/16 invocations and retain
historical workflow Observed separately from release acceptance; native release
and published contracts are [accepted](https://github.com/suhaasbadada/wisp/pull/17#issuecomment-6760578891).

## Repository workflow triage (under verification)

The new read-only host validates bounded saved provider evidence and maps it to
typed Wisp facts. Eight policy cases and six Python tests cover actual PR #16
historical Checks/Pages, current/stale/missing identities, failed jobs while runs
are active, failures with other missing/stale workflows, required-job coverage,
cancelled/skipped jobs, malformed provider metadata and distinct CLI exits. No
core source or existing historical fixture changed. Primary full verification
passed 149 Rust, 41 Node, 27 workflow, 9 client and 6 triage tests, 326 native/WASM
comparisons and 36 Chromium tests, plus fmt/Clippy/npm ci/WASM/TS/build. Joffrey
found broken stdout could override host exit 2 with Python shutdown exit 120;
primary closed the failed stream and added a real closed-reader regression.
Post-repair primary verification passed 27 workflow, 9 client and 7 triage tests,
TypeScript and static build. Other full checks passed before this stdout-only
repair; this is primary repair verification, not independent re-review.
Exact-head CI and publication remain separate gates.

PR #16 shipped at `ae1d71f8cc0d7804570f1982e323259524955c84`: PR Checks
`42765177801`, merged Checks `42765846556`, Pages `42765846687` and deployment
`7674877682` passed. Actual PR/merged artifacts retain both native decisions and
Pass/8 versus proposed Fail/2; published client contract bytes match the merge.
[Release acceptance](https://github.com/suhaasbadada/wisp/pull/16#issuecomment-6760365551).

## Python project client (under verification)

Both examples share discovery/session transport and the lossless codec. Client
regressions cover native Complete/Error/Unknown and continuation, strict request
preflight, defensive metadata, discovery/readiness/response drift, LF-only Unicode
framing and deadlines before/after readiness with owned-child/thread cleanup.
The existing 27 workflow tests retain numeric transport, component/discovery drift,
exact expectations and Error/Unknown coverage through the shared client. Primary
full checks passed 149 Rust, 41 Node, 27 workflow and 8 client tests, 326 native/WASM
comparisons, 36 Chromium tests, fmt/Clippy, npm ci, WASM, TypeScript and build.
Joffrey found tuples could bypass depth/key preflight while being encoded as
arrays. Primary rejected unsupported Python values and added no-submission
regressions. Post-repair primary full verification passed 149 Rust, 41 Node,
27 workflow and 9 client tests, 326 native/WASM comparisons, 36 Chromium tests,
fmt/Clippy, TypeScript and build. npm ci/WASM passed before this Python-only repair;
Rust sources are unchanged. Native old/new plan, composed review and positive-gate
reports match structurally. This is primary repair verification, not an independent
re-review. Exact-head CI and publication remain separate gates.

PR #15 shipped at `f75f34209f1aa3ac57e66591992d7cdedf883023`: merged Checks
`42762847918`, Pages `42762847814` and deployment `7674497567` passed. Actual
PR/merged artifacts preserve Pass/8 and proposed Fail/2, and public contract bytes
match the merge. [Release acceptance](https://github.com/suhaasbadada/wisp/pull/15#issuecomment-6760085991).

## Composed expectation gates

Opt-in caller-owned end-to-end snapshots add strict preflight coverage/schema,
exact completed-decision/output matching, preserved Error/Unknown and component
not-evaluated outcomes, retained file hashes and bounded mismatch pointers.
Focused tests cover matching recorded outcomes, the unchanged adverse shipping
trace, a deliberately failing proposed requirement, no expectation rewriting,
opaque numeric-vs-string mismatch, output differences, full-case coverage, malformed
input before Wisp, exact UTF-8 caps, 32 cases, snapshot identity and CLI exits.
Primary full pre-repair verification passed 149 Rust, 41 Node, 25 Python workflow,
326 native/WASM and 36 Chromium checks, plus fmt, strict Clippy, npm ci, WASM,
TypeScript and static build. Joffrey passed focused tests and found deep expected
data and lone-surrogate strings could break evidence serialization after runtime
calls. Primary added iterative 64-container/Unicode-scalar preflight on both input
files, ASCII-safe report output (without inflating UTF-8 adapter args), guarded
render/write, and real-CLI exact-depth/surrogate/ASCII-output regressions. Post-repair
primary full verification passed 149 Rust, 41 Node, 27 Python workflow, 326 exact
native/WASM and 36 Chromium checks, plus fmt, strict Clippy, TypeScript and static
build. npm ci/WASM passed before the host-only repair; Rust sources are unchanged.
This is primary repair verification, not a claimed independent re-review.
Exact-head CI/publication remain separate gates; old Wisp sources/traces unchanged.

PR #14 shipped at `fdcc0605144c32ec75c61ec495cac821d6de42c9`; PR Checks
`42758661450`, merge Checks `42759315694`, Pages `42759315752` and deployment
`7674034776` passed. Native release, numeric-error continuation, actual CI artifacts,
published guide bytes and pricing cases in published WASM are
[recorded on the PR](https://github.com/suhaasbadada/wisp/pull/14#issuecomment-6759686441).

## Composed order workflow

The read-only reference host and three saved policies add 16 Python regression
tests to `npm test`: authored before/after traces, retained discount/shipping
cliff, stage stopping, typed/runtime/final-stage overflow, continued unaffected
orders, runtime Unknown despite passing component examples, output-only changes,
component mismatches, zero-execution spec drift, discovery/session/review pinning,
strict input/count bounds and CLI outcomes. No business-rule arithmetic is
reimplemented in the host; expected traces are not an independent policy oracle.
CI retains real three-policy verify, plan and composed-review JSON separately.
Primary full pre-repair checks passed 149 Rust tests, 41 Node tests, 15 Python
workflow tests, 326 native/WASM comparisons and 36 Chromium tests, plus fmt,
strict Clippy, npm ci, WASM, TypeScript and static build. Joffrey passed the focused
tests and found Python's numeric conversion could abort a whole batch on `1e400`
instead of letting Rust reject one order. Primary retains validated raw JSON
number tokens through transport (never stringifies them into accepted Ints) and
adds mixed invalid/valid-order regressions for exponent overflow/underflow, signed
zero, decimals, ordinary numbers and 5,000-digit integers, including the real CLI.
Post-repair primary verification passed 149 Rust, 41 Node, 16 Python workflow,
326 native/WASM and 36 Chromium tests, plus fmt, strict Clippy, TypeScript and
static build. npm ci and WASM build passed in the full pre-repair run; no Rust
source changed in this increment. This is primary repair verification, not a
claimed independent re-review. Exact-head CI/publication remain separate gates.

PR #13 shipped at `8b28f49fad338a776ac80f266a4cd5c38c97289f`; PR Checks
`42755701880`, merge Checks `42756238266`, Pages `42756238280` and deployment
`7673633877` passed. Merged native discovery/host, actual CI interface/decision
artifacts, published structured WASM types, docs, old artifact/context acceptance
are [recorded on the PR](https://github.com/suhaasbadada/wisp/pull/13#issuecomment-6759135888).

## Checked callable interfaces

Interface v1 adds compiler-owned tagged parameter/return/record types and native
project discovery without a machine or suite verification. Tests cover exact
declaration/type ordering, whole-program error provenance, zero execution budgets,
byte boundaries, envelope precedence, all-policy aggregation and unchanged frozen
context identities. Python host consumes the metadata and checks discovery/startup
hashes. CI retains a project-interface JSON report. Primary Rust verification
passed 149 tests plus fmt/strict Clippy; npm ci, rebuilt WASM, TypeScript and
static build passed. Joffrey found no substantive issues and independently passed
22 targeted native/WASM comparisons, frozen context fixture and the Python host
using the existing compiled artifacts. Primary's parity reconciliation initially
assumed graph functions shared interface's name sorting; corrected the harness
to sort the old graph projection without changing either contract. A subsequent
full run reached the 120-second host deadline during parity, with no remaining
process; it was not counted as a pass. The bounded full rerun passed 41 Node
tests, 326 exact native/WASM comparisons (37 targeted interface comparisons with
independent revisions and type/signature reconciliation), all 36 Chromium tests
and the Python host. Discovery advertises interface v1, 12 operations, 55 codes
and seven runnable examples. No old identity fixtures were rewritten.

PR #12 shipped at `40f524bf351487bd7c277e9ef0f5852eb9029aad`; exact PR Checks
`42753562750`, merge Checks `42754071218`, Pages `42754071220` and deployment
`7673344571` passed. Merged native adapter/core object-only release checks, actual
CI decision evidence, published docs/WASM, original artifact and frozen context
acceptance are recorded [on the PR](https://github.com/suhaasbadada/wisp/pull/12#issuecomment-6758774519).

## Native decision adapter

Adapter v1 adds pinned JSON-lines sessions and a dependency-free Python host
example. Native tests cover exact standalone core-report bytes/raw argument keys,
canonical i64/Unicode/NUL, no top-level/probe execution, typed/adapter failures,
fault/Unknown continuation, duplicate/injection rejection, source/manifest/suite
changes after readiness, interactive response flushing, exact line/request caps,
EOF and invalid UTF-8. CI retains the two-order host decisions alongside saved
project verification/review evidence.

Primary full pre-repair checks passed 140 Rust tests, 41 Node tests, 276 exact
native/WASM comparisons and 36 Chromium tests, plus fmt, strict Clippy, npm ci,
WASM, TypeScript, static build and the Python host example. Joffrey independently
passed the six adapter tests/example and found positional arrays could enter
Serde's derived object structs. Primary added map-only host decoding, covering
adapter envelopes and both manifest/policy objects, with no-execution/no-ID-echo
regressions. Primary then reproduced the same pre-existing positional-array gap
in core requests/review schemas and shared map-only decoding across host/core
boundaries, including nested expectations, limits, artifacts/ghosts and changes.
Existing valid object/duplicate/raw-argument behavior is retained. Native tests
and parity cases require zero execution on invalid positional encodings.
Post-repair primary full checks passed 145 Rust tests, 41 Node tests, 288 exact
native/WASM comparisons and 36 Chromium tests, plus fmt, strict Clippy, rebuilt
WASM, TypeScript, static build and the Python application host. This is primary
repair/expanded-core verification, not a claimed independent re-review. The
original semantics-5 artifact, full context fixture and raw invocation identities
still pass. Exact-head CI and publication acceptance remain separate gates.

## Repository policy projects

Native project v1 adds end-to-end tests for shipped reservation manifests,
read-only behavior, strict config/IDs, confined paths, symlinks, bounded UTF-8,
raw duplicate suite preservation, specification drift with zero execution,
sorted multi-policy evidence, continuation after faults and aggregate Unknown.
CI runs saved project verify/review and retains JSON evidence separately from
test logs. Joffrey's independent review found a saved filename `-` could invoke
the legacy stdin reader with a bare manifest path. Project references now open
files directly; regressions cover both source and suite named `-` with unrelated
stdin bytes. Primary full pre-fix checks passed 133 Rust, 41 Node, 276 exact
native/WASM comparisons, 36 Chromium tests, fmt, strict Clippy, npm ci, WASM,
TypeScript and static build. After the reader fix, primary reran all 134 Rust
tests plus fmt and strict Clippy successfully. The nine project tests include
the maximum 8-policy/256-invocation workload, exact manifest/suite boundaries,
standalone-review report parity and the stdin regression. This is primary repair
verification, not a claimed independent re-review. Exact-head CI remains a
separate publication gate.

PR #11 shipped at `47366afc25a32bac20052c69769d8c542252f990`; exact PR Checks
`42745937377`, merge Checks `42746476312`, Pages `42746476414` and deployment
`7672306618` passed. Merged release/isolated install, separate-directory review,
spec-drift zero execution, mismatch preservation, actual CI evidence artifacts
and published document bytes were accepted.
[Acceptance](https://github.com/suhaasbadada/wisp/pull/11#issuecomment-6757764759).

## Policy workbench integration

Post-repair primary full verification passed 125 Rust tests, 41 Node evaluation
tests, 276 exact native/WASM comparisons (47 review cases with independent
revision/suite-hash/status/summary reconciliation plus six legacy null-function
non-execution cases), and 36 Chromium tests. fmt,
strict Clippy, npm ci, WASM, TypeScript and static builds passed. Cases cover the
Complete/Error/Unknown matrix, all-or-nothing preflight, exact raw argument keys,
source/typed-data byte/depth limits, ownership, output-only/Unicode/NUL differences,
native readers/exits and both historical suites. Browser walkthrough, expectation
mismatch, history, ghost/output isolation, edit-and-revert, preflight ownership,
Stop/deadline/late callback exclusion and untrusted text are verified. Discovery
advertises review v1, eleven operations, 55 codes and six runnable examples.
Joffrey reviewed `ea12fd1` and found two substantive issues: the custom function
decoder had accidentally changed legacy `function:null` rejection, and loading
the walkthrough hid a Historical warning while keeping old observations. Primary
repairs restored the original decoder and regression, added cross-operation
non-execution/parity cases, and retained the historical designation with a new
custom-review → walkthrough regression. The reviewer independently passed the
pre-repair Rust/maintenance/parity/review-browser/static checks. The post-repair
repetition above was primary verification, not a claimed independent re-review.
Exact-head CI/publication are pending.
Historical study documentation/lifecycle inputs were copied byte-exactly to
historical-inputs before live docs changed; original manifests/reports/cases and
grades remain unchanged, and the new resolver has a no-hidden-grader-change test.

PR #9 shipped at `1f5e81cc536528c399f48a6546af4f7c86fe94a4`: PR Checks
`42690751974`, post-merge Checks `42691298415`, Pages `42691298306` passed.
Fresh clean-release replay accepted all six locked finals; published study/ADR
bytes, Agent/Human content and unchanged core manifest were verified. Public
content checks did not repeat live browser interactions.
[Acceptance](https://github.com/suhaasbadada/wisp/pull/9#issuecomment-6750448266).

## Repeated maintenance study

Three fresh repetitions per arm on one independent agent-authored task are locked
and graded: all six pass 547 finite full-Decision invocations. Matching reported
history flags are separate, unauthenticated participant assertions. Frozen hashes
and locked results replay in `test:maintenance`, now part of `npm test`. Old pilot
failures remain unchanged. See [Maintenance study](Maintenance-study.md) and ADR
0009. Primary integrated verification passed 99 Rust tests, 40 Node evaluation
tests (17 prior-pilot + 23 maintenance), 222 native/WASM comparisons and 29
Chromium tests, plus fmt, strict Clippy, npm ci, WASM, TypeScript and static builds.
Pretrial Joffrey review found no substantive defects. Final Joffrey review of
`ee2ddcc` also found none, independently replayed all six 547-case outcomes and
passed 23 maintenance tests. Frozen inputs/finals/timing boundaries and unchanged
prior pilot were verified; full integration was not repeated independently.
Session freshness, access compliance and the prelaunch interruption cannot be
authenticated from logs. Exact-head remote CI/publication remain pending.

PR #8 shipped at `17b908633eea8b5bcf4197b72c3a95c2c1035946`: PR Checks
`42679867885`, post-merge Checks `42680350726`, Pages `42680350738` passed.
Public report/CLI/ADR bytes, compiled Agent/Human content, ten public study
artifacts and unchanged core manifest were verified. Browser interactions ran
locally, not repeated live. [Acceptance](https://github.com/suhaasbadada/wisp/pull/8#issuecomment-6748937313).

## Product-validation increment

Three preregistered paired tasks, six locked fresh-session submissions and
deterministic finite acceptance now complement compiler regressions. The initial
pilot accepted five submissions; Wisp refund failed an exact-byte boundary before
behavioral grading and remains unchanged. `npm run test:evaluation` checks harness
negative controls and replays that expected failure; `npm run evaluate` deliberately
exits 1 for the pilot. Results do not measure comparative agent tokens or latency.
See [Evaluation](Evaluation.md), ADR 0008 and evaluation/README.md. Independent
review and full local verification are complete; exact-head CI remains pending.

Primary verification passed 99 Rust tests, 17 evaluation tests (including both
1,237-case reference backends, faulty-starter negative controls and replay of the
locked failure), 222 native/WASM comparisons and 29 Chromium tests, plus fmt,
strict Clippy, TypeScript, npm ci, WASM and static builds. No language-core change.
Joffrey independently reviewed `de2f009` plus the audited report and found no
substantive defects. Independent checks passed 17 evaluation tests without skips,
99 Rust tests, TypeScript, fmt and strict Clippy. Independent CLI replay returned
expected exit 1 with identical grades/counts/submission hashes. Frozen inputs and
locked submissions/logs were unchanged. The reviewer did not repeat npm ci,
WASM/static builds, parity or Chromium; agent access/settings cannot be verified
from self-reported logs. Remote CI/deployment remain separate pending gates.

PR #7 shipped at `6f1378bdff3faa5be4606e238415c9e85d6123e0`: PR Checks
`42665597018`, post-merge Checks `42666104788` and Pages `42666103744` passed.
Published Preview/source/history preservation, edit-and-revert rejection, one-use
Apply without execution, explicit finite Clear, document-scoped rejection and
Stop were verified separately. Native exact new-file output/refused overwrite and
Agent-default/Human docs passed. [Acceptance](https://github.com/suhaasbadada/wisp/pull/7#issuecomment-6747057218).

## Guarded edit verification

Primary verification passed 99 Rust tests, 222 native/WASM comparisons (37 guarded-edit exact serialized-byte cases with independent candidate/source/body hashes and splice audits), 28 Chromium tests, fmt, strict Clippy, TypeScript, npm ci, WASM and static build. Frozen semantics-5 artifact, invocation identities and complete context report remain unchanged. Discovery advertises ten operations, fifty codes and five examples. Tests cover document provenance, exact preservation, stale guards, injection, limits, exclusive exact-byte output, preview without mutation, explicit Apply without execution, historical ghosts, edit-and-revert, target changes, Unicode and cancellation.

Joffrey independently reviewed `00082b1177020a210a6de6973015bee0b18a4c40` against merged PR #6 and found no substantive issues. Independent verification passed 99 Rust tests, 222 native/WASM comparisons, TypeScript and diff checks. Browser tests/build/lint were not independently repeated; primary results above remain separate evidence. Astra challenged the guarded-edit boundaries before implementation. Exact-head CI and published functional acceptance remain pending.

PR #6 published acceptance: merge `a3bd4515a8ae3ab2fb1ed3ba55daa408e97ae4f1` passed Checks `42660381988` and Pages `42660382108`. Live context reconciled 137 UTF-8 bytes, retained scope omissions with all candidates fitting, and returned empty TEXT/explicit overflow at zero budget. Historical badges and independent Stop preserved FAIL/output900/ghost9. Agent-default/Human docs and manifest matched context v1. [Acceptance](https://github.com/suhaasbadada/wisp/pull/6#issuecomment-6746556073).

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

## First-playable published acceptance

PR #1 merged at `ff22d8703387872b24c1c07e386a59538d7f5e9d`. Exact-head PR Checks `42589297890`, post-merge Checks `42589746427`, and Pages build/deploy `42589746572` passed. Published local-WASM execution, n=9 ghost, repaired 11-case Clear, historical replay Pass, runtime Error, Stop Unknown, Agent fresh default, explicit Human persistence and raw Docs links were verified separately in a T3 incognito browser. Full evidence is recorded on [PR #1](https://github.com/suhaasbadada/wisp/pull/1#issuecomment-6736173927).

## Portable failure workflow local verification

36 native tests (30 core, six CLI), 63 exact native/WASM report comparisons (15 artifact operations), ten Chromium integration tests, fmt/Clippy/TypeScript/static build passed. Browser download → native inspect/repaired replay and native archive → browser import/replay are exercised against real files and the actual WASM interface. Corrupt source/version/compiler, duplicate fields including limits, oversized and invalid-UTF8 files, file-read Stop cancellation, no overwrite, exit codes, read caps and current-source diagnostic isolation have regressions. Raw JSON is preserved end-to-end for shared duplicate-field checks, including >32-bit numeric transport. Import/reproduction errors never accept an artifact. Remote CI and published checks for this increment remain separate gates.

Independent review by Joffrey of `c6b10a9` found raw artifact interpolation could inject enclosing request fields and the import deadline excluded file reading. Both fixed before publication: standalone-value validation preserves original bytes for shared schema checks; one deadline spans reading and validation. Native/browser trailing-field injection tests and a clock-controlled stalled-reader/late-callback test passed. No findings were waived.

PR #2 shipped at `37ec979f28b7f78dc279bdfaf298ebbc5aac1134`: exact-head PR Checks `42639474098`, post-merge Checks `42640332928` and Pages `42640332920` passed. Live T3 incognito verification exported an actual 835-byte ghost file, reloaded and imported that same download into repaired code without replacing the editor, then replayed as new Pass (not full-domain Clear). Published CLI docs returned HTTP200. [Acceptance evidence](https://github.com/suhaasbadada/wisp/pull/2#issuecomment-6743596526).

## Immutable records local verification

56 Rust tests, 97 exact native/WASM report comparisons and 13 Chromium integration tests passed with fmt/Clippy/TypeScript/static build. Record tests cover nominal typing, unknown/duplicate/missing fields, forward/deep/cyclic definitions, initializer order, projection/purity, bounded aggregate copies/equality/display, record-only dependency invalidation (including direct probes), record-bearing artifact reproduction/replay, and older compiler rejection before execution. Browser invoice output/21-case finite evidence, live field/cycle errors, record graph context/overflow and visible compiler compatibility warning are checked. Native and actual WASM agree on successful and adversarial record programs. Exact-head remote CI and published acceptance remain separate gates for this increment.

Independent review by Joffrey of `bb6750b` found iterative equality visited fields in reverse declaration order, changing short-circuit/fuel behavior. Fixed before push by reversing LIFO stack insertion. Flat and nested tight-fuel native/WASM regressions now complete in 33/66 units, with one-less limits Unknown. The declared comparison order is preserved; no finding was waived. Astra challenged the record design before implementation.

PR #3 shipped at `d7c1beae34a8fc61315b9a2fe0e11ef471f6c4c7`: PR Checks `42644067073`, post-merge Checks `42644617655` and Pages `42644617774` passed. Live invoice output, exactly 21 finite cases, semantics-5 record graph/bounded context, older-compiler envelope rejection without editor/evidence mutation, published grammar/Human tutorial and Agent default with no saved choice verified via T3 preview. [Acceptance evidence](https://github.com/suhaasbadada/wisp/pull/3#issuecomment-6744146201).

## Structured invocation local verification

67 Rust tests, 133 exact native/WASM comparisons (36 invocation-specific) and 18 Chromium integration tests passed with fmt/Clippy/TypeScript/static build. Invocation covers canonical i64 extrema/Bool/String/nested records, strict fields/arity/types/duplicates, independent input bytes/depth, no input evaluation, source checking before input validation, skipped top-level statements/probes, nested captured output, combined print/result caps and encoding limits, key invalidation, native bounded files/stdin/exit codes and existing artifact compatibility. Browser tests verify typed return, input JSON Pointers, raw duplicates and trailing-field injection rejection, safely rendered source-like strings, Stop without partial result, and historical results/late-diagnostic isolation after input edits. Exact-head CI and published acceptance are pending for this increment.

Joffrey independently reviewed `e058357` and found displayed input diagnostics stayed current-looking when arguments/target changed after the response. Fixed by tracking diagnostic provenance and clearing input-dependent messages on edits while retaining applicable source Syntax/Type/Purity errors. A post-response edit regression passes alongside the existing in-flight edit regression; no finding was waived.

PR #4 shipped at `b2c353b0cd3fec263c5957ce4c0f3052529daec8`: PR Checks `42648448982`, post-merge Checks `42649043315` and Pages `42649043302` passed. Live WASM verified record input → typed Int/900, nested exact max-i64 return, zero probe cards/no top-level output, input-path error with no execution/result, post-response edit provenance, Stop with no accepted result, and Agent/Human invocation docs. [Acceptance evidence](https://github.com/suhaasbadada/wisp/pull/4#issuecomment-6744810668).

## Machine contract local verification

77 Rust tests, 146 exact native/WASM comparisons and 21 Chromium integration tests passed with fmt/Clippy/TypeScript/static build. The native command, actual WASM operation and generated static `agent.json` agree; three manifest examples execute with declared outcomes, relative contract links resolve against the static base, and code names/kinds/meanings match the checked Errors reference. Cases cover arithmetic zero vs overflow, distinct limits, nested blocked-probe and artifact-Unknown status exceptions, CLI-created diagnostics, malformed/null/duplicate/required-source request compatibility, source-independent non-reflective discovery and synthetic unknown-future-code client fallback. A pinned pre-change semantics-5 artifact and exact raw invoice invocation key/result/fuel/allocation remain unchanged. Exact-head remote CI and live deployment acceptance remain pending for this increment.

Joffrey independently reviewed `9e2dd17` against the merged typed-invocation baseline and found no substantive issues. Independent verification passed 77 Rust tests, 146 native/WASM comparisons, fmt/Clippy/TypeScript/diff checks; the reviewer did not rebuild generated WASM/site or rerun Chromium/remote CI. Primary verification rebuilt both generated interfaces and ran the complete browser suite separately. Astra challenged the machine contract before implementation.

PR #5 shipped at `6f3bc4d4531ee7549bcb41dcb52a49be6b730deb`: PR Checks `42652909282`, post-merge Checks `42653967597` and Pages `42653967901` passed. Live manifest HTTP200/application-json contained 11,996 UTF-8 bytes, eight operations, 44 codes and three examples; all five relative Docs links returned HTTP200. Live WASM emitted distinct zero-divisor/overflow codes, manifest twice(21) returned typed42, and Agent/Human discovery/error docs were verified. [Acceptance evidence](https://github.com/suhaasbadada/wisp/pull/5#issuecomment-6745519195).

## Probe context local verification

83 Rust tests, 184 native/WASM comparisons (37 exact serialized-byte context cases with independently reconciled source SHA-256/ranges/framing/counters) and 24 Chromium integration tests passed with fmt/Clippy/TypeScript/static build. Tests cover atomic zero/exact/one-short/multibyte/clamped budgets, deterministic closure/deduplication, syntax/type/purity before selection, no runtime execution/usage/observations, all-fit with scope omissions, prelude/preceding/following probe distinctions, revision-local duplicate selection identities, separate function Agent View/ghost/invocation compatibility, source/selector/budget history and late reply/cancel exclusion, and literal hostile-text rendering. Manifest now advertises nine operations, 45 additive diagnostic codes and four runnable examples. Pinned semantics-5 artifact and invocation identities remain unchanged. Exact-head CI and live acceptance are pending for this increment.

Joffrey independently reviewed `ccf42c2` against merged machine-contract baseline and found no substantive issues. Independent checks passed 83 Rust tests, 184 native/WASM comparisons, 24 Chromium tests and TypeScript; the reviewer did not regenerate WASM/static assets or rerun fmt/Clippy. Primary verification rebuilt interfaces and ran those static checks separately. Astra challenged selection, accounting, identity and scope before implementation.
