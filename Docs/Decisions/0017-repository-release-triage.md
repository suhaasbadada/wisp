# ADR 0017: Read-only repository workflow triage

Status: implemented; independent finding repaired and relevant checks passed;
exact-head CI and publication pending.

Exercise Wisp in a recurring repository-local task rather than add more language
syntax or claim usefulness from authored commerce examples alone. Classify saved
Checks/Pages evidence for an exact Wisp main merge through a typed Wisp policy.
Retain an actual PR #16 merge snapshot, not a synthetic green run presented as live.

Provider parsing stays in the host; classification stays in Wisp. Preserve raw
evidence, derived facts, identities and native execution. Failed current jobs are
immediate blockers, even while a workflow runs or the other workflow is missing.
Stale success is never success for another head. Required-job omissions are
Unknown; cancelled/skipped required jobs block, never trigger automatic retries.

This is saved workflow observation only: no GitHub fetching, side effects,
deployment/functional acceptance, authorization, package publication, new syntax
or core host capability. Offline snapshots are caller-owned and unauthenticated;
hashes do not establish provenance or latest-run selection. Keep permission and
release acceptance outside this aid. Current Checks/Pages job names are explicit
repository adapter configuration, not a universal CI model.

See [the contract](../Release-triage.md) for exact bounds and verdict precedence.

Joffrey reproduced a broken-stdout shutdown that overrode host exit 2 with Python
exit 120. The host now closes the failed stream before returning its documented
error exit; a real subprocess regression closes the reader before report output.
