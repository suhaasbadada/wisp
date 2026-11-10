# ADR 0016: Reusable source-local Python project client

Status: accepted; shipped via PR #16 at
`ae1d71f8cc0d7804570f1982e323259524955c84`. Exact-head CI, merged native release,
actual CI artifacts and published contract acceptance are recorded on that PR.

Two application examples duplicated discovery, JSON and adapter transport. Move
that transport into one experimental standard-library client, retaining domain
record/signature validation and composed expectations in the applications.

Validate readiness before submitting requests, rather than retrospectively
checking a completed batch. Pin discovery to session manifest/source/suite bytes,
check response identities and invocation markers, preserve Error/Unknown as data,
and expose defensive metadata copies. Batches are fresh bounded sessions, not a
cache, daemon, package publication or automatic retry system. LF-only framing
preserves Unicode line characters. Shared lossless JSON retains raw input numbers.

The Rust core and frozen semantics/fixtures do not change. This does not grant
approval, add host capabilities to Wisp, or claim external adoption. A deadline
after submission leaves unreceived outcomes unresolved; IDs are not idempotency
keys. The trusted-binary and memory/process-isolation limitations are explicit
in [the client contract](../Python-client.md).

Joffrey found tuples were encoded as arrays without being traversed in preflight,
allowing depth/key checks to be bypassed. Reject unsupported Python value types
instead of silently coercing them, with explicit no-submission regression tests.
