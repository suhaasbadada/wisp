# ADR 0019: One-command observation with exact input receipt

Status: implemented; full local checks and independent review passed;
exact-head CI and publication pending.

Join explicit-attempt capture and native triage behind one read-only operator
entry point, with an offline saved-file mode. Preserve the exact input spelling
and hash inside the JSON receipt, rather than requiring temporary files or hashing
a reserialized approximation. Keep collection metadata, native status, business
decision and no-approval boundary distinct.

Capture failures stop before native execution. Runtime Error/Unknown retains the
snapshot and no fabricated decision. Host/protocol failures remain exit 2 rather
than success receipts. Offline mode has zero API invocations; online mode keeps
explicit IDs/attempts and all capture validation. No source/suite/core changes,
new permissions, retries, watchers or mutation.

Receipts are forgeable saved data, not authenticated provenance or latest-run
proof. This increment emits them but does not yet validate/replay arbitrary
receipt files. Existing capture/triage commands remain usable independently.
See [the contract](../Workflow-observation.md).
