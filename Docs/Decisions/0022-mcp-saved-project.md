# ADR 0022: Owner-configured saved projects in MCP

Status: implemented; full local checks, both SDK modes and independent review
passed; exact-head CI and publication pending.

Inline source tools require agents to resend source for each invocation. Add an
optional owner-selected startup manifest, exposing checked project metadata and
typed invocation by policy/function IDs without source/path arguments. Preserve
the original six tools and default no-project/no-project-filesystem-read behavior.

Reuse the existing client and native saved-project adapter. Initialization pins
manifest/source/suite/compiler; every fresh call validates readiness against those
pins. Metadata explicitly remains the initialization snapshot; edits are not
silently adopted, cases are not automatically verified and restart is deliberate.
Keep complete adapter/core evidence and Error/Unknown/business rejection distinct.

This is metadata reuse, not an execution cache or language implementation. No
agent-selected host files, writes, arbitrary commands, network, retries or approval.
Smaller invocation requests do not establish total wire, latency or token savings;
discovery/provenance costs remain. See [MCP](../MCP.md).
