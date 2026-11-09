# Architecture

## Repeated maintenance validation

The ADR 0009 harness uses existing Rust typed calls and guarded edits; TypeScript
is an external comparison arm with a real compiler checker for calls/context.
Frozen task/tool hashes and final submission locks are verified before and after
grading. Functional acceptance and participant assertions are distinct. No new
language evaluator, semantics or core permission. The follow-on workbench is a
planned host workflow, not an implemented architecture or automatic repair claim.

## Product-validation tooling (outside the language core)

ADR 0008 freezes three paired maintenance tasks and finite mathematical oracles.
The Node acceptance harness verifies frozen inputs and exact one-body boundaries,
then uses the existing Rust typed-call interface or actual strict TypeScript/BigInt
compiler/Node adapter. TypeScript is a comparison arm, not a Wisp interpreter.
Subprocess timeout/output limits are not security isolation; only trusted
submissions may run. No syntax, semantics, permission or evidence identity changes.
CI tests preserve the locked failed submission rather than require a dishonest
all-green pilot. See Evaluation for measurements, provenance and limitations.

## Guarded body preparation

ADR 0007 adds non-executing preparation over a checked baseline. Exact source/body guards precede real block parsing and bounded prefix/replacement/suffix construction. Candidate checking and preservation audits protect signatures, records, other functions, top-level expressions and indexed probe specifications. Edit v1 is independent of unchanged semantics-5 evidence identities. Typed Ready candidates can still fault or violate intent.

Baseline, replacement and rejected-candidate diagnostics retain separate document ownership; rejected spans are never mapped to the baseline editor. Native output uses exclusive create-new/exact bytes. Browser Preview uses a disposable worker, deadline, exact snapshots and generation counters. Apply rechecks synchronously, consumes once and routes full source through checking-only invalidation. UTF-8 offsets are decoded as bytes, not UTF-16 indexes. Edit-and-revert, cancellation and late replies cannot restore Apply. Execution evidence remains historical; Run stays explicit.

The Rust core owns tokenization, AST, checking, conservative call/effect analysis, interpretation, hashing and serializable reports. Native CLI and wasm-bindgen expose the same operations. TypeScript renders reports as text and runs WASM in a dedicated worker; it does not implement language semantics.

Whole-source SHA-256 revision identity is distinct from conservative per-function/transitive dependency identity. Evidence must include predicate/range, compiler semantics version and execution configuration. No cross-key cache reuse is permitted. Agent View is compiler-derived context selection, not guaranteed task relevance or completeness. Stable symbol identity separate from version hashes is deferred; names are local identities only.

Bounds cover source, syntax nesting, calls, fuel, output, probe cases and logical allocation. Browser worker termination provides hard cancellation. Logical allocation limits are not an absolute bound on Rust/WASM/JS/browser process memory. No backend or API key is required.

Portable artifacts (ADR 0002) are explicit local files with full historical source, compiler identity, exact limits and one receipt. Rust validates envelopes and reproduces the exact first failure before acceptance. CLI/UI preserve raw artifact JSON for the shared decoder (no JavaScript/Value normalization of duplicate fields); malformed UTF-8 is rejected. A 1 MiB raw dispatcher request cap bounds envelope parsing, in addition to source/execution ceilings. Native file IO stays in the CLI host, not the language. Artifacts are unauthenticated and give no proof of historical authorship or timing. No automatic upload, persistence, compiler migration or cache is added.

## Immutable records (semantics-5)

Named records live in a nominal type namespace, separate from functions/values. Explicit `new` construction avoids if/brace ambiguity. A memoized, depth-bounded type DAG pass rejects recursive/deep types without expanding shared schemas into trees. Runtime record values have a separate depth cap. Initializers run once in source order; storage, equality traversal and display use declaration order. The runtime has no derived aggregate Clone/PartialEq that could bypass bounds: copies preflight payload allocation/depth, and equality/display traversal and string/output bytes consume fuel. Formatting streams capped fragments and rolls back an interrupted print, not a whole prebuilt aggregate string. These are logical units, never actual allocator/process guarantees.

Compiler graph metadata exposes record declarations/ordered fields/spans/hashes. All name-sorted exact record declarations conservatively contribute to every function transitive hash, direct probe property dependency and run prefix. This intentionally over-invalidates unrelated record changes, including unused records; it is not minimal relevance analysis. Offsets alone are excluded. Agent View record definitions share the UTF-8 text budget and report truncation/omissions.

The compiler identity changes to `wisp-0.1.0-semantics-5` because keywords and resource metering change. Artifact format remains version 1 but requires exact compiler identity. Earlier compiler artifacts are explicitly unsupported before historical execution; no silent migration, rehashing or retroactive evidence upgrade.

## Type-directed host invocation

ADR 0004 adds a host `call` operation, not language IO. Whole source is checked, then one named function executes with type-directed literal data; top-level statements and probes are skipped. Raw args are capped at 64 KiB, duplicates retained until shared Rust checking, with independent JSON nesting limits. Inputs never become code. Input JSON Pointer paths are distinct from source spans. Existing evaluator construction/copy/fuel/allocation/depth bounds apply. Metered streaming result encoding shares the captured-output ceiling and accepts no partial result. Call identities include compiler/config/target/transitive body/record facts/raw input; no cache or proof claim. Semantics-5 and existing artifact identities remain unchanged.

Native CLI owns bounded `--args-file`/stdin IO. Browser has a separate Invoke form; default Run remains whole-program/probes. Request fragments are embedded only after standalone-value syntax validation; raw data is retained for Rust duplicate/type checks. Source/input/target snapshots and worker identity prevent outdated result/diagnostic application. Output is rendered as text. Stop/deadline applies to the whole call worker; no backend, API key, upload or automatic data persistence.

## Machine contract and discovery

ADR 0005 adds 44 explicit diagnostic codes, with exhaustive legacy-kind mappings chosen by constructors—not inferred from human messages. Codes are additive/stable and independent of compiler semantics identity. Report status remains separate: transport excess is Request/Error; blocked probes retain Limit/Unknown; artifact reproduction may be Unknown with an Artifact diagnostic. Input paths remain distinct from source spans, and checking is fail-fast, not a complete defect inventory.

The Rust `capabilities` operation and native command produce one source-independent, non-executing discovery document. Its fixed serialization is tested below 32 KiB, never reflects request data and is not charged runtime budgets. Static build initializes the actual compiled WASM interface and writes its exact response to `dist/agent.json`; no TypeScript capability mirror or hand-maintained manifest exists. Native/WASM/static manifest equality, runnable examples, relative documentation links and code-table agreement are verification gates. Manifest metadata never enters existing ghost/dependency/invocation identities; a pinned pre-change semantics-5 artifact and exact raw-input invocation key/usage remain accepted unchanged.

## Probe context ledger

ADR 0006 adds context contract v1 over existing compiler facts. Whole-program checking precedes revision-local selector validation. No Machine, execution observations or proof is created. Exact whole probe → all records name-sorted → syntactically reachable full functions name-sorted is the deterministic candidate order. Source slices plus charged two-newline separators form an atomic prefix; an overflow stops selection, not an optimization or source truncation. Ledger spans/hashes/ranges reconcile selected bytes and explicitly classify omitted eligible/outside-closure bodies.

All top-level statements (including textually later ones), preceding/following probes, outside-closure functions and outside-slice trivia remain explicit scope omissions even if every candidate fits. Statements carry honest expression spans, not fabricated whole-statement ranges. Existing run keys account for prelude/preceding-probe dependencies despite omitted source; text is not guaranteed run-equivalent. Query identity independently includes context version/compiler/whole-source revision/effective limits/budget/selector. No key grants cache reuse, persistent symbol identity, relevance, minimality or completeness.

The browser uses an independent disposable query worker with its own Stop query and five-second deadline. Source/selector/budget snapshots and worker identity exclude late replies; accepted older metadata is visibly historical after edits. Execution outputs, ghosts and function Agent View remain independent. Raw text and ledger render as text; source comments/strings remain untrusted. UTF-8 TEXT budget excludes source-bounded ledger/graph metadata, not a total-response/token/process-memory cap.
