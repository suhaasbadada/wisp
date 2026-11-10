# Explicit-attempt GitHub evidence capture

`examples/release-triage/capture.py` removes manual transcription from the
[saved workflow triage](Release-triage.md) application. It reads GitHub via an
already authenticated **trusted local `gh` executable**, emits one bounded saved
bundle on stdout, and performs no workflow, repository or deployment mutation.
It does not invoke Wisp; run the triage host separately on the captured bundle.

The [observation command](Workflow-observation.md) can join these two steps and
retain the exact captured bytes/hash, without an intermediate file.

```sh
python3 -B examples/release-triage/capture.py \
  --revision ae1d71f8cc0d7804570f1982e323259524955c84 \
  --checks-run 42765846556 --checks-attempt 1 \
  --pages-run 42765846687 --pages-attempt 1
```

These are actual historical PR #16 merge runs, not the latest main or an invented
green example. Choose the IDs/attempts for the revision you intend to inspect;
all five arguments are required. There is **no latest-run search, retry, watcher,
sleep loop or automatic run/attempt substitution**. Capture is a one-shot read,
not CI monitoring or remediation. Never silently restart a cancelled run. Preserve
failed attempt evidence; this tool does not erase or replace it.

Save stdout to a **new** file using your normal artifact mechanism, then pass it
to `run.py --evidence FILE`. Capture itself creates/overwrites no file. Shell
redirection can overwrite files: use a new path or your shell's `noclobber` mode.
Exit 0 means capture succeeded, not that CI passed; failed/running metadata can
be captured successfully and then classify Blocked/Pending. Host/input/protocol/
deadline/output failures return 2 without a successful complete bundle.

## Correlation and bounded consistency

IDs and attempts must be positive signed-64-bit integers; the two run IDs must
differ. Revision is a full lowercase 40-character SHA. These inputs are validated
before contacting GitHub. The repository and API host are fixed to
`suhaasbadada/wisp` and `github.com`. Each API invocation is an explicit GET through
`gh api --hostname github.com --method GET`, with no shell or credential arguments.
Existing `gh` credential handling is reused; no token is read, printed or stored
by this host. Never place tokens in input or captured metadata.

For each selected workflow, the host:

1. Reads `/repos/suhaasbadada/wisp/actions/runs/RUN_ID` and checks run ID, exact
   SHA, main branch, push event, selected attempt, repository and head repository,
   workflow name and the expected repository workflow path.
2. Reads `/runs/RUN_ID/attempts/ATTEMPT/jobs?per_page=100`. It requires an exact,
   nontruncated job count of 0–32, unique positive job IDs, and every job's run ID,
   attempt and head SHA to match. Status/name/conclusion validation is shared
   with the saved-bundle host. Null pending conclusions normalize to empty strings,
   never success. No pagination is silently dropped: a larger/truncated list fails.
3. Reads the same run metadata once more and rejects any selected-identity,
   status or conclusion change. This is a bounded consistency check, **not**
   polling for completion. A newly incremented attempt is rejected, not followed.

There are six bounded CLI GET invocations total on a successful capture, each
with a 15-second subprocess deadline, up to roughly 90 seconds plus local work.
No program-level retries. API JSON is validated for duplicate members, scalar
Unicode and nesting; each buffered response must be at most 1 MiB. The trusted
`gh` process buffers output before that byte check; this is not a hostile-output
memory/process sandbox. It assumes the authorized GitHub API and local credential
configuration, not arbitrary executables or remote hosts.

Required workflow paths are `.github/workflows/checks.yml` and
`.github/workflows/pages.yml`. An explicit attempt must still be the run's current
attempt during capture; selecting an older attempt after a rerun fails. This
prevents using a superseded green attempt as the selected run's current evidence,
but does not assess whether a rerun was appropriate or authenticate the operator's
selection. A new attempt must be deliberately selected, with prior failures
preserved outside this tool.

## Output and limits

The output remains saved-bundle version 1, consumable by the existing triage host.
Run/job names, states and IDs are mapped from the validated API responses; unknown
provider fields (including steps, logs, actor data and URLs) are **not copied**.
This avoids publishing incidental provider payloads or credentials. Each run has
an additive `capture` descriptor with API source label, repository, workflow path,
attempt and UTC observation time; each job retains its ID, attempt and head SHA.
The descriptor is caller-owned metadata, **not a signature or new authorization**.
Triage retains it but still makes only the saved-workflow classification.

The entire encoded bundle must fit the existing 65,536-byte input bound before
stdout begins. Hashing remains the triage host's job after it reads actual saved
bytes, so file spelling/whitespace is honestly part of that hash. Partial stdout
after a closed consumer is not a valid completed capture.

The pre/post reads are not an atomic snapshot across workflows, do not establish
freshness after capture and cannot prevent GitHub changes immediately afterward.
Offline files can be forged. Full-head/attempt correlation and capture provenance
are useful evidence, not deployment/functional acceptance, approval or proof.
Tests use authored API fixtures; one real read-only PR #16 capture has also been
exercised locally. That is a repository-local use, not external adoption or a
measured advantage over existing tools.
