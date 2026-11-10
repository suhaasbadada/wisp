# Read-only repository workflow triage

This small application uses Wisp for a recurring task in **this repository**:
classifying the Checks/Pages workflow evidence for one exact trusted-main merge.
It is an operator aid, not the authority that merges or deploys. The existing
Actions workflow permissions, deployment guards and human authorization remain
unchanged. It does not repair failures, retry cancelled runs, merge, deploy, fetch
URLs or contact GitHub.

```sh
cargo build --locked
target/debug/wisp project verify examples/release-triage/project.json
python3 -B examples/release-triage/run.py \
  --evidence examples/release-triage/pr16-merge.json
```

The saved PR #16 merge is **actual historical run evidence**, captured from Checks
`42765846556` and Pages `42765846687`, revision
`ae1d71f8cc0d7804570f1982e323259524955c84`. This returns runtime Complete and a
decision `{state:"Observed",reason:"workflow_checks_complete"}`, exit 0. It does
not assert that these are the latest runs or that this old revision is the current
main. Published artifacts, deployment revision, public content and representative
behavior were separately accepted on PR #16; they are **not inputs to this policy**.

This is a first repository-local operational use, not external adoption, a measured
time saving, a production release gate or proof that the policy captures every
operational requirement. Wisp remains experimental.

## Saved provider envelope

The version-1 UTF-8 file is bounded to 65,536 bytes and 64 nested JSON containers,
with Unicode scalars and no duplicate members. Its exact top-level fields are:

```json
{
  "version": 1,
  "repository": "suhaasbadada/wisp",
  "revision": "ae1d71f8cc0d7804570f1982e323259524955c84",
  "ref": "refs/heads/main",
  "checks": null,
  "pages": null
}
```

Null means missing evidence, never success. A non-null run is an object from
`gh run view` with required fields `databaseId`, `workflowName`, `headSha`,
`headBranch`, `event`, `status`, `conclusion`, `jobs`. To inspect a chosen run:

```sh
gh run view RUN_ID --repo suhaasbadada/wisp \
  --json databaseId,workflowName,headSha,headBranch,event,status,conclusion,jobs \
  --jq '.jobs |= map({name,status,conclusion})'
```

Choose the exact Checks and Pages runs for the intended merge, then place those
objects in the envelope, or use the [explicit-attempt capture host](Release-capture.md)
to avoid manual transcription. There is no automated latest-run selection,
authenticated offline provenance, polling, timestamp/freshness window
or run-attempt selection is implied. Preserve failed/cancelled evidence; do not
replace it with another run to manufacture success. File hashes are identities,
not signatures or proof of provenance. A caller can forge a saved bundle; use an
authorized GitHub source and verify intended repository/revision/run IDs separately.
Do not include credentials in input files or reports.

Repository is fixed to this project; revisions are lowercase 40-character GitHub
SHAs. Workflow names are exactly Checks/Pages, with distinct positive integer run
IDs. At most 32 uniquely named jobs per run are accepted; each job needs `name`,
`status`, `conclusion`, with names at most 256 UTF-8 bytes. Additional provider
run/job members are retained, not interpreted. Unknown statuses/conclusions,
missing fields, contradictory completion metadata, duplicate jobs or invalid
schema fail before Wisp starts (stderr, exit 2, no JSON report). A closed stdout
consumer also returns host exit 2 rather than a misleading success or Python's
shutdown flush exit 120; no complete report should be assumed received.

Known statuses: queued, in_progress, completed, waiting, pending, requested.
Known conclusions: empty, success, failure, cancelled, timed_out, action_required,
neutral, skipped, startup_failure, stale. Completion requires a nonempty
conclusion; non-completion requires an empty one. Jobs may fail while the overall
run remains in progress, and this must not be described as merely waiting for green.

## Adapter facts versus Wisp policy

Python validates and transports provider data, not the release decision. It
produces typed `Workflow` facts: presence; exact revision/main/push correlation;
status/conclusion; count of failed jobs; presence of this repository's required
names (Checks `verify`, Pages `build` and `deploy`); and pending/unsuccessful counts
for those required jobs. Every job with failure, timed_out, action_required or
startup_failure contributes to the failure count, including additional jobs.
Counts are canonical Wisp Int strings. Provider-to-fact mapping is an adapter
contract and still needs tests/review; moving a decision into Wisp does not make
the adapter automatically correct. Other repositories/job names are not supported.

`triage.wisp` owns the classification and precedence:

1. A non-main envelope is Blocked/untrusted_revision.
2. A failed job in a present, exact-head/main/push workflow is Blocked/failed_job,
   even if the other workflow is missing, stale or running.
3. Missing workflow evidence is Unknown/missing_workflow; mismatched head,
   branch or event is Unknown/stale_workflow. A stale failure is not attributed
   to the requested revision and a stale success cannot make it Observed.
4. Missing required job names are Unknown/missing_required_job.
5. A completed required job with any non-success conclusion is
   Blocked/unsuccessful_required_job, including cancelled, neutral and skipped.
6. Any unfinished workflow or required job is Pending/work_in_progress.
7. A completed non-success workflow is Blocked/unsuccessful_workflow.
8. Only then is the evidence Observed/workflow_checks_complete.

The host checks the expected function and record signatures, then calls shared
Rust via the pinned [Python client](Python-client.md). Top-level policy statements
and probes do not run. No new core syntax or permission is introduced.

## Evidence and exits

The report retains the raw loaded bundle, full-file SHA-256, derived typed input,
native response (compiler/revision/manifest/suite/invocation evidence), runtime
`status`, separate `decision`, scope, `approval:"not_granted"` and
`side_effects:"none"`. Files are read once and never rewritten. Runtime Error or
Unknown remains that state with `decision:null`, not a fabricated business result.
Runtime Complete can carry a business Unknown or Blocked decision.

Exit 0 Observed; 1 Blocked or runtime Error; 3 Pending/business Unknown/runtime
Unknown; 2 host/configuration/protocol/input error. These exits are useful for
read-only tooling but none grants permission to merge, deploy or pay. A green
workflow is not a successful deployment, and a deployment is not functional
acceptance. Keep these gates separate in operator handoff.

CI verifies the eight saved policy cases and retains the historical snapshot's
triage report. Python tests exercise raw provider mapping, exact identities,
failure-before-completion precedence, missing/stale evidence, required-job
coverage, malformed input and CLI exits. This is finite authored coverage, not
a complete provider/operational model or evidence of language superiority.
