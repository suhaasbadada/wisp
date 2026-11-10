# Offline workflow observation replay

`examples/release-triage/replay.py` validates an observation receipt and performs
a **new native execution** on its saved input, without GitHub access. It checks
reproducibility, not current CI, authenticated history or permission to merge/deploy.
The recorded receipt is never rewritten. This format is separate from the core's
historical ghost format and `wisp replay`; they are not interchangeable.

```sh
python3 -B examples/release-triage/replay.py --receipt workflow-observation.json
```

Use `--wisp PATH` for a trusted native binary. Create the receipt with
[observation](Workflow-observation.md); see the [quickstart](Operator-quickstart.md).

## Preflight and identity gates

Receipt files are read once, bounded to 1 MiB UTF-8 and 96 JSON containers.
Duplicate members, non-scalar Unicode, non-finite numbers and unsupported
version/kind/envelopes fail before native execution. The wrapper bound accommodates
the original input's independent 64-container/65,536-byte limit. Recover original
bytes from `collection.snapshot_json.encode("utf-8")`, not reserialized parsed data.

Validate exact outer/collection/triage fields, version 1, no-approval/no-mutation
markers, runtime status consistency, mode/API-count metadata, both snapshot hashes,
decoded evidence and newly derived typed facts. Equality distinguishes Boolean
from integer (`true` is not `1`), ignores object order and preserves array order.
Recorded native identity/status/invocation/result boundaries must be consistent;
incomplete reports cannot fabricate results.

Non-executing discovery must match the saved manifest, source, suite-file and
compiler pins **before submitting a replay request**. Drift is host exit 2, not a
silent policy substitution. The same client carries those pins into the fresh
session; readiness independently guards later filesystem drift. Existing domain
record/signature checks still run.

Compare the **entire** fresh triage report against the saved report: scope, facts,
evidence, decision, output, diagnostics, usage, compiler and execution identities.
Malformed/inconsistent records stop in preflight; internally consistent but
altered native observations become Changed/Mismatch after comparison. A forged
decision or edited output/usage cannot pass on outer hashes alone.

This is not authentication: a fully self-consistent forged receipt matching what
the current implementation actually does can still reproduce. No signature,
original operator identity/time, latest run, freshness, approved rerun or intended
requirements are established. Acquisition and authorization remain separate.
The verifier/host and binary are trusted local code.

## Report and exits

One ASCII-safe JSON object includes contract version 1,
`kind:"wisp-workflow-replay"`, status, comparison Reproduced/Changed,
`approval:"not_granted"`, `side_effects:"none"`, actual new-execution marker,
full receipt byte hash, snapshot hash, explicit offline scope and separate
`recorded`/`replayed` triage reports. Identical execution keys can recur for identical
inputs; the new invocation is still an execution, not a cache hit.

- Exit 0: Reproduced, native Complete and business Observed.
- Exit 1: Mismatch, recorded/replayed native Error, or reproduced business Blocked.
- Exit 3: native Unknown (unless Error takes precedence), or reproduced business
  Unknown/Pending.
- Exit 2: input/receipt inconsistency, policy/compiler drift, host/protocol/deadline
  or output failure; no successful complete report is assumed.

Error then Unknown precede mismatch. Reproduced faults/limits remain Error/Unknown,
never Observed. A closed stdout consumer returns 2, not Python shutdown exit 120.
After submission, unreceived outcomes remain unresolved, not proof of no execution.

Tests cover native reproduction without GitHub, hashes/type distinctions/tampering,
pins before submission, output/usage/coherent-decision corruption, blocked/pending/
unknown business outcomes, real native Error/Unknown, exact input byte/depth limits,
malformed receipts and CLI output failures. CI retains and checks receipt/replay.
These finite checks are not verifier completeness, deployment/functional acceptance,
production readiness or superiority. No core/policy/fixture semantics, GitHub request,
retry, cache or authority changes. No license has been selected.
