# ADR 0013: Compiler-owned callable interface discovery

Status: implemented; local verification passed, independent review found no
substantive issues; exact-head CI and publication pending.

## Need

The native adapter exposes typed calls but applications/agents otherwise must
read sources or parse human signature strings to learn JSON boundaries. That
would duplicate language logic and makes integration brittle. A saved project
should have a non-executing structured discovery entry point.

## Decision

Add shared Rust `op:"describe"` and interface contract v1. Whole-program check,
then enumerate all function parameters/return types and nominal record fields
as tagged types. Sort declarations by name, preserve parameter/field order.
No machine, output, probes, execution usage/keys, suite approval or source edits.
Failures retain existing diagnostic status/provenance and no fabricated schema.

Native `describe FILE` and `project describe MANIFEST` use the same operation.
Project descriptions retain every policy result, pinned source/manifest/suite
identities and zero invocation counts. Suite verification stays separate. The
application example compares required boundary metadata and startup hashes,
closing the discovery-to-session revision gap without changing adapter v1.

Keep old analyze/context/graph reports and artifact/invocation identities intact;
do not add fields to frozen graph/context schemas or parse signatures in hosts.
Add discovery metadata for the new operation/interface contract and runnable
example, without changing language semantics/compiler identity or core permissions.

## Non-goals and boundaries

Not JSON Schema, code generation, an export/authentication allowlist, intent
verification, suite execution, cache or property-specific context selection.
All checked globals are visible; caller owns authorization and effect handling.
No new types or Unit declaration syntax. Source/token/type bounds remain; metadata
is outside execution fuel/output budgets, not an absolute resource guarantee.
Finite tests and a host example do not prove correctness, adoption or advantage.
