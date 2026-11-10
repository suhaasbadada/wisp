# ADR 0012: Native JSON-lines decision adapter

Status: implemented; independent finding repaired and local checks passed;
exact-head CI and publication pending.

## Need

Saved project review makes policy changes inspectable, but a host application
still needs a practical way to consume runtime decisions. Reconstructing core
requests, resolving paths and launching a process for every input are avoidable
integration work. This increment supplies an explicit local adapter, not a claim
of measured production usefulness.

## Decision

Add native-only `project serve MANIFEST`. Pin all bounded project files, publish
readiness with manifest/source/suite identities, then accept strict JSON-line
requests naming correlation ID, policy ID, global function and raw typed args.
Use the unchanged shared Rust call operation for every request. Embed its exact
serialized report; retain raw arguments/encoded result boundaries. No new core
operation, language syntax, semantics version, dependencies or permissions.

Requests run serially with fresh core defaults. Request errors, faults and Unknown
are per-response outcomes, not process exit status. Normal EOF exits 0; malformed
transport caps and IO exit 2. Readiness confirms snapshots only, never checking,
suite execution, approval, authentication or adoption of later file edits.

The adapter allows an explicit global function rather than interpreting suite
target metadata as an authorization boundary. The local trusted host owns target
allowlists, input authorization, side effects, deadlines and disposition of Error
or Unknown. The Python example acts on no decisions and rejects incomplete ones.

## Bounds and non-goals

131,072 line bytes excluding LF; 1,024 requests including invalid ones; existing
core argument/typing/fuel bounds unchanged. Cap input reading before unbounded
allocation. Flush each response so an interactive caller can proceed. No implicit
stdin-as-file conventions, hot reload, cache, HTTP/network listener, daemon,
parallelism, persistence, replay prevention or automatic spec repair/deployment.
Compilation per call remains; no unmeasured performance claim.

See [Adapter](../Adapter.md) for exact status/correlation, identity, diagnostic,
readiness and transport failure contracts.

## Review-driven wire correction

Joffrey found derived structs accepted positional arrays on the adapter boundary.
Primary reproduced the same existing gap in core requests and nested review
schemas. A shared private map-only decoder now covers native manifests/policies,
adapter envelopes and core Request/Limits/Ghost/Artifact/Change/Suite/Case/Expect/
ExpectedResult boundaries. Native and WASM regressions require rejection before
execution. Valid object behavior, nullable legacy fields, raw argument bytes,
existing identities and compiler semantics version remain unchanged. This closes
a documented-contract implementation gap rather than adding an array wire form.
