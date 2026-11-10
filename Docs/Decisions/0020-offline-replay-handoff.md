# ADR 0020: Offline receipt replay and operator handoff

Status: implemented; full local checks and independent review passed. Consult
PR #20 for exact-head CI and final release acceptance.

Complete the bounded operator workflow by validating and replaying exact-input
receipts without GitHub. Check hashes, envelope/fact/native consistency and current
manifest/source/suite/compiler pins before a new invocation. Carry the same client
through readiness and compare the entire fresh report, not a chosen result field.

Historical/new evidence stays separate. Reproducibility is not authenticity,
freshness, deployment acceptance or approval. Reproduced Error/Unknown and blocked/
pending decisions cannot become success. Receipt wrappers have a separate bounded
depth/byte contract so maximum valid saved input remains replayable.

Add an operator quickstart for component review, positive/negative composed gates,
actual historical observation and offline replay. No core/policy/fixture semantics,
GitHub mutation, retry, cache, permissions or external-adoption/proof/efficiency
claims. The owner superseded the earlier PR #20 pause and authorized continued
development in tested increments. Wisp remains experimental; no license is selected.

See [replay](../Workflow-replay.md) and [quickstart](../Operator-quickstart.md).
