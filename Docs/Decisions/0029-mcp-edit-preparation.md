# ADR 0029: Pure guarded edit preparation over MCP

Status: accepted; shipped via PR #30 at
`73b1f92bfc1fb7fb4150a01f35fd93f948b9ff14`. Exact-head Linux CI, actual SDK
artifacts, immutable strict release smoke and published contracts are
[accepted](https://github.com/suhaasbadada/wisp/pull/30#issuecomment-6774795361),
including the corrected public-contract verification record.

Agents could inspect/check/review inline policies through MCP but not use the
existing Rust guarded body-preparation operation. Expose it as `wisp_prepare_edit`
with flat source/function/source-hash/body-hash/replacement arguments. Translate
to the unchanged Rust request: no Python language implementation, host writer,
automatic apply, evaluation or new permission.

Always require both source/body guards copied from compiler analysis. Ready means
a checked, preservation-audited proposed source only; caller-owned finite review
is separate. Keep native conflicts, Error/Unknown and document-owned diagnostics.
The new inline tool is independent of owner-configured saved-project guards and
cannot overwrite paths, source files or expectations. Hash matches do not prove
authenticity, intent or approval.

Default discovery grows from six to seven tools and configured discovery from
ten to eleven; existing request schemas/behavior are unchanged. Official SDK
checks prepare a real body, separately review the changed result, and refuse a
stale body guard. Authored finite checks are not reasoning or superiority proof.
