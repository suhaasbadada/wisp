# ADR 0021: Local MCP tools over the shared Rust core

Status: accepted; shipped via PR #21 at
`bcdd5d423d2940e5ff737bfd6203fbaa55badcc1`. Exact-head CI, immutable server/SDK
native release smoke, artifacts and public contract acceptance are recorded there.

Make existing Wisp capabilities directly discoverable to an agent's MCP client,
rather than require copied shell/JSON adapters. Add a local stdio transport exposing
compiler capabilities, checking, typed interfaces/calls, finite source review and
bounded probe context. Every language operation remains a fixed native `--json`
request; the host never interprets Wisp or takes agent-supplied file/command paths.

Preserve native status/report and compiler identity, separate bridge failure from
native failure, and never turn Error/Unknown/Fail into success. Tool outputs and
prints are data; no approvals, arbitrary host execution, networking, file writes,
cache or new core semantics. The sequential 2025-11-25 tools subset explicitly
excludes tasks/async cancellation and documents quotas/deadlines/buffering limits.

The runtime remains standard-library Python. An optional pinned official SDK smoke
checks interoperability separately from authored tests, without claiming universal
client compatibility, external use or performance gains. See [MCP](../MCP.md).
