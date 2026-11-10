# One-command workflow observation

`examples/release-triage/observe.py` joins explicit-attempt capture and native
Wisp triage into one read-only operator command. It also accepts saved evidence
without any GitHub access. This is still an **observation**, not merge/deploy
approval, deployment acceptance or functional acceptance.

Offline, using the retained historical PR #16 bundle:

```sh
cargo build --locked
python3 -B examples/release-triage/observe.py \
  --evidence examples/release-triage/pr16-merge.json
```

Or collect explicitly chosen actual GitHub runs and immediately triage them:

```sh
python3 -B examples/release-triage/observe.py \
  --revision ae1d71f8cc0d7804570f1982e323259524955c84 \
  --checks-run 42765846556 --checks-attempt 1 \
  --pages-run 42765846687 --pages-attempt 1
```

Use IDs/attempts for the revision you intend to inspect. These example IDs are
historical, not the latest main. `--evidence` and `--revision` are mutually
exclusive; file mode rejects run/attempt options, and GitHub mode requires all
four. Invalid selection fails before capture or native execution. `--wisp PATH`
selects your trusted native binary (default `target/debug/wisp`).

## Self-contained observation receipt v1

Stdout is one ASCII-safe JSON object:

```text
{
  contract_version: 1,
  kind: "wisp-workflow-observation",
  status: <native triage runtime status>,
  approval: "not_granted", side_effects: "none",
  collection: {
    mode: "saved" | "github-explicit-attempt",
    snapshot_json: <exact UTF-8 input decoded as a string>,
    snapshot_hash: <SHA-256 of those original UTF-8 bytes>,
    api_get_invocations: 0 | 6,
    repository_mutations: false
  },
  triage: <complete ordinary triage report>
}
```

`snapshot_json.encode("utf-8")` recovers the original evidence bytes, including
whitespace, Unicode spelling and trailing newline; no parse-and-reserialize step
quietly changes the hashed input. `collection.snapshot_hash` equals the embedded
triage `evidence_hash`. Native compiler/policy/manifest/suite/invocation evidence
is retained in `triage.response`. The full original triage scope, input facts,
raw evidence and decision remain available, not collapsed into a Boolean result.

The API invocation count describes the operator mode's successful capture path,
not an authenticated remote telemetry receipt. Saved files can contain copied or
forged capture descriptors. Observation metadata and hashes are not signatures,
freshness guarantees or permission grants. This version emits a receipt; it does
not yet independently validate arbitrary saved receipt files or replay them.

The command reads at most 65,536 input bytes (one extra byte detects overflow),
validates the saved envelope and retains its exact bytes before native execution.
Online capture keeps its six explicit bounded GET invocations and consistency
checks. The native batch has the client deadline, fresh session and discovery/
readiness pins. It introduces no cache, retry, watcher or source/suite change.
No evidence/output file is created by the application; use `-B` as shown to avoid
Python bytecode caches. If saving stdout, use a new path or shell `noclobber` to
avoid overwriting prior evidence.

## Failure and action boundaries

Exit 0 means runtime Complete with business Observed/workflow_checks_complete.
Exit 1 means business Blocked or runtime Error. Exit 3 means business Pending/
Unknown or runtime Unknown. A native incomplete outcome retains `decision:null`
and the exact snapshot, never a fabricated business Observed. Runtime Complete
can still carry business Unknown/Blocked/Pending.

Exit 2 means input/capture/host/protocol/deadline/output failure: do not assume a
complete receipt was emitted or that native requests after submission did not run.
Capture failures prevent native startup. If native host failure occurs after
successful capture, this command emits no success receipt; use the separate
capture command if you need to retain collection independently of native execution.
A closed stdout reader returns host exit 2 without Python shutdown exit 120.

The host never restarts a cancelled run, retries a failed workflow, changes GitHub
or local policy files, merges, deploys or grants approval. Capture and classification
remain separate gates inside the receipt. Observed workflows are not evidence of
artifact contents, actual deployment revision/readiness or representative behavior.
Perform those release gates separately and retain their evidence.

## Verification and limits

Tests cover exact byte/hash round-trip, offline no-network behavior, explicit
capture/native composition, preflight selection, capture failure before execution,
business and mocked runtime incomplete outcomes, malformed input, Unicode output,
CLI exits and a closed stdout consumer. CI retains an offline observation receipt
and independently recomputes its snapshot hash. A real read-only PR #18 merge
capture/observation has also been exercised locally.

This reduces transcription and intermediate-file handling for one repository task;
it does not establish a measured efficiency advantage, external adoption, complete
CI modeling or production readiness. See [capture](Release-capture.md),
[triage](Release-triage.md), and the [Python client](Python-client.md) for provider,
process, memory, identity and trust limitations.
