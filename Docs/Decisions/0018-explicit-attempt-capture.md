# ADR 0018: Explicit-attempt read-only GitHub capture

Status: implemented; full local checks and independent review passed;
exact-head CI and publication pending.

Manual transcription is a practical gap in repository workflow triage. Add a
separate read-only capture host that requires exact revision, run IDs and attempts,
uses authorized local `gh` GET calls to fixed GitHub/repository endpoints, and
emits the existing saved-bundle contract. It never selects the latest run, retries,
watches, triggers workflows or decides merge/deploy permission.

Validate repository/head repository, workflow name/path, main push, full SHA,
run/attempt and every job identity. Reject truncated or overlarge job sets and
pre/post run-state changes instead of silently following a new attempt. Retain
small provenance descriptors, not full API payloads, logs, actor data or secrets.
Pending conclusions remain empty, never assumed successful.

The capture descriptor is not authenticated provenance; files are still forgeable
and the pre/post reads are not an atomic/freshness guarantee. Preserve old failed
attempt evidence and require deliberate new-attempt selection. The runtime core,
triage policy, permissions and historical fixtures do not change. This completes
a bounded collection step rather than turning Wisp into a GitHub/network runtime.

See [the contract](../Release-capture.md) for read counts, deadlines and limits.
