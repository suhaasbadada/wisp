# ADR 0024: Guarded saved-project function context

Status: implemented; full local checks and independent review passed after two
malformed-report validation fixes. Exact-head CI and publication pending.

Expose the existing Rust compiler's bounded Agent View through `project focus`,
the Python client and optional owner-configured MCP. Agents select a described
policy/function, not paths or source overrides. No second evaluator, core semantics
change, execution, refresh or automatic snapshot adoption is added.

Native focus loads all confined project files and compares optional selected
manifest/source/suite/compiler guards before analysis. It returns all policy pins;
the Python client validates all of them against discovery before exposing context.
Only selected source receives semantic checking; suites receive JSON syntax checks,
not case execution. Caller-owned guards cover both MCP focus and invocation, and
strict mode requires them for both. Default source tools remain independent.

Text budgets do not cover graph metadata, prove task relevance or completeness,
or establish total token savings. Existing stable-filesystem assumptions remain.
The internal SDK triage driver exercises context retrieval then a distinct guarded
invocation on historical repository evidence; this is not model-behavior evidence,
live deployment authority, authenticity or business approval.
