# ADR 0023: Caller-owned project guards across MCP reconnects

Status: accepted; shipped via PR #23 at
`37b94935f0136379cc5ec512383cce4e7d35210f`. Exact-head CI, immutable SDK checks,
artifacts and published contract acceptance are recorded there.

A server can correctly pin its loaded project yet still differ from the revision
an agent reasoned about before reconnecting. Add copyable per-policy call guards
to discovery and optional exact `expected` guards to project invocation. Compare
policy/manifest/source/suite/compiler identity before a native session is created;
readiness still independently protects against subsequent file drift.

Expose matched/not_requested/rejected explicitly. Preserve unguarded legacy
semantics without claiming caller binding; let an owner require guards through a
startup flag and corresponding required schema. No agent-selected paths, refresh,
automatic adoption, execution cache, business rule or core semantics change.

Tests include a changed-behavior reconnect with unguarded negative control,
defensive metadata, invalid guards, source readiness drift and native errors.
Guards bind bytes/identities, not authenticity, understanding, intended requirements
or approval. This addresses a concrete stale-evidence problem, not a universal
safety or measured comparative-language claim. See [MCP](../MCP.md).
