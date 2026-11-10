# A narrowly usable Wisp workflow

Wisp is usable for checked finite policy maintenance and read-only application
observations, not yet a broadly validated production product. Requirements:
Rust/Cargo and Python 3.8+; Node/WASM only for browser/full tests. No API key,
backend or paid service is needed for these local steps. No license is selected.

## 1. Build and review policy cases

```sh
cargo build --locked
target/debug/wisp project verify examples/policies/project.json
target/debug/wisp project review examples/policies/project-before.json examples/policies/project.json
```

Review rejects component suite/ID drift. Passing finite cases is evidence, not
permission to merge/deploy, and does not establish end-to-end intent.

## 2. Check composed requirements

```sh
python3 -B examples/order-gate/run.py \
  --baseline examples/order-gate/project-before.json \
  --expect examples/order-gate/observed.expect.json
```

This passes eight **recorded** outcomes, including the known adverse shipping
interaction—not endorsement. The proposed free-shipping requirement deliberately
returns Fail/exit 1 despite component Pass and runtime Complete:

```sh
python3 -B examples/order-gate/run.py \
  --baseline examples/order-gate/project-before.json \
  --orders examples/order-gate/bulk-orders.json \
  --expect examples/order-gate/proposed-free-shipping.expect.json
```

Do not rewrite policy/expectations to manufacture success. Review input/requirement
diffs and owner intent. See [workflow gates](Workflow-gates.md).

## 3. Observe and replay actual saved CI evidence

Create a **new** receipt. The subshell's `noclobber` prevents overwriting one
without changing your parent shell's setting:

```sh
( set -C
  python3 -B examples/release-triage/observe.py \
    --evidence examples/release-triage/pr16-merge.json > workflow-observation.json
)
python3 -B examples/release-triage/replay.py --receipt workflow-observation.json
```

Both exit 0 for this actual historical PR #16 snapshot. Replay reports
Reproduced/Observed and `new_execution:true`; neither grants approval. This old
revision is not today's main. Retain files and review hashes before sharing.
All offline steps require **no GitHub access**.

For live reads, replace `--evidence` with a full revision and explicitly chosen
Checks/Pages IDs **and attempts**. Authorized local `gh` credentials are additionally
required; never put a token in commands or evidence. See [capture](Release-capture.md)
and [observation](Workflow-observation.md). No automatic latest selection, retry,
rerun, watcher, merge or deployment is performed.

## 4. Integrate and hand off

Use the source-local [Python client](Python-client.md), not copied example
transport. Rust owns semantics/checking/invocation; Python orchestrates data and
provider facts. Keep native Error/Unknown and business Blocked/Pending/Unknown
explicit. See [replay](Workflow-replay.md) for guards and conservative exits.

An MCP-capable agent client can launch the [local MCP bridge](MCP.md) to discover
and invoke six source tools directly; an owner-configured `--project MANIFEST`
adds two saved-project tools without source/path selection by the agent.
Configure the trusted server/binary paths in
that client; no global harness configuration is installed automatically. This
adds a tested agent transport, not production authority or universal compatibility.

Separately verify exact PR/head/checks/review; authorized merge; merged CI;
actual deployment revision/status; actual artifacts; public content and
representative behavior. Observed workflows are not those other gates. Preserve
failed/cancelled attempts and investigate rather than blindly retry.

## What remains unproven

Repository-local operator use is not independent external adoption. Commerce
examples remain authored fixtures; tests are finite observations, not universal
correctness, graph/context completeness, superiority or measured token/time savings.
Hosts/binaries are trusted local code, receipts are forgeable, and source-local
clients are not a package ecosystem or hostile-process sandbox. Production use,
independent recurring users, requirements ownership and license choice remain
owner decisions.
