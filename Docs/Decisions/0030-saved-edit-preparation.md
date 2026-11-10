# ADR 0030: Prepare guarded bodies from saved project snapshots

Status: implemented; full local checks, exact hash-locked SDK workflow and
independent review passed. Exact-head Linux CI/publication pending.

Inline MCP preparation still required complete source input. Add native
`project prepare-edit`, Python `prepare_edit` and `wisp_project_prepare_edit` to
use an owner-configured retained source. Reuse unchanged Rust edit; do not add a
Python editor, writes, automatic Apply, case execution or approval.

The body hash is always required. Optional native four-part project guards remain
all-or-none and refuse before replacement reads; Python always supplies them.
Strict MCP caller guards cover all four saved operations. The client validates
all returned policy pins and candidate identity/byte/audit markers before exposure,
without claiming to independently parse or prove program preservation.

Only selected source is semantically checked, suites only JSON-loaded. The
proposal contains full candidate source; avoiding whole-source input is not a
total token, output, relevance or confidentiality guarantee. Existing trusted
stable-filesystem and finite-evidence limitations remain.

Native Error/Unknown and diagnostic ownership are preserved. Default discovery
stays seven tools; configured discovery becomes twelve. SDK checks prepare a
saved candidate, then verify/invoke the unchanged original, keeping preparation,
behavior evidence, application and approval distinct. No core semantics change.
