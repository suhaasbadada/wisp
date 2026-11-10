# ADR 0014: Exercise the product as a composed application

Status: implemented; independent finding repaired, local verification passed;
exact-head CI and publication pending.

## Need

Successive APIs and component tests do not establish a useful policy-maintenance
product. Exercise discovery, immutable suites, guarded expectations, pinned calls
and incomplete results together in an application-shaped workflow before adding
more language mechanisms.

## Decision

Ship a dependency-free read-only order decision host plus three saved policies:
eligibility, pricing and shipping. Shared Rust remains the checker/evaluator;
Python owns explicit stage routing and transport, not rule arithmetic or a Wisp
interpreter. No checkout, reservation mutation, payment or network side effect.

An optional baseline mode requires shared component review before describing both
reviewed revisions and observing identical input orders. Retain component and
application evidence/counts separately. Compare completed decisions/output, not
metadata. Error/Unknown on either side makes that order unavailable; never infer
Unchanged from missing data. No passing gate grants approval or repairs cases.

The concrete member-discount change exposes a free-shipping cliff: one customer
total increases even as its quote decreases. Preserve both explicit traces and
call the interaction out; do not choose the owner's business intent or advertise
component Pass as an end-to-end correctness/approval claim.

## Limits

32 explicit orders/64KiB input; exact IDs/envelopes; typed business inputs handled
by Rust at each stage. Fresh core limits, at most96appcalls per plan; existing
component caps, per-child and outer test deadlines. Pin full manifest/source/suite
identities across component review, discovery and session startup. Not a hostile
filesystem sandbox, atomic concurrent snapshot, authenticated endpoint, queue,
transaction, general SDK or throughput claim. No language/core permissions change.

Use finite regression checks for known examples, faults, Unknown, output-only
changes, spec/file drift and byte/count limits. Existing historical studies and
their failures remain untouched. This integration evidence is not external-user
validation, an independent policy oracle, proof or language superiority.
