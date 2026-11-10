"""Replay an exact saved workflow observation offline, never fetching GitHub."""
import argparse
import hashlib
import importlib.util
import json
import math
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("wisp_workflow_observation", HERE / "observe.py")
observation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(observation)
triage = observation.triage
from wisp_client import ClientError, ProjectClient, decode_json, encode_json


def same(left, right):
    # Python equality considers True == 1; evidence comparison must not.
    return json.dumps(left, sort_keys=True, ensure_ascii=True, allow_nan=False) == json.dumps(
        right, sort_keys=True, ensure_ascii=True, allow_nan=False)


def hash_value(value):
    return isinstance(value, str) and re.fullmatch(r"[0-9a-f]{64}", value) is not None


def receipt_tree(value):
    # Saved input keeps its own 64-container limit. Receipt wrappers/native
    # reports add containers; cap the whole receipt separately, before execution.
    pending = [(value, 0)]
    while pending:
        item, depth = pending.pop()
        if isinstance(item, str):
            item.encode("utf-8")
        elif isinstance(item, (dict, list)):
            triage.require(depth < 96, "Receipt nesting exceeds 96 containers")
            if isinstance(item, dict):
                pending.extend((k, depth + 1) for k in item)
                pending.extend((v, depth + 1) for v in item.values())
            else:
                pending.extend((v, depth + 1) for v in item)
        elif isinstance(item, float):
            triage.require(math.isfinite(item), "Non-finite receipt number")


def validate(receipt):
    receipt_tree(receipt)
    triage.require(isinstance(receipt, dict) and set(receipt) == {
        "contract_version", "kind", "status", "approval", "side_effects", "collection", "triage"}, "Expected exact observation receipt envelope")
    triage.require(type(receipt["contract_version"]) is int and receipt["contract_version"] == 1
                   and receipt["kind"] == "wisp-workflow-observation" and receipt["approval"] == "not_granted"
                   and receipt["side_effects"] == "none", "Unsupported observation receipt")
    collection = receipt["collection"]
    triage.require(isinstance(collection, dict) and set(collection) == {
        "mode", "snapshot_json", "snapshot_hash", "api_get_invocations", "repository_mutations"}, "Expected exact collection envelope")
    triage.require(isinstance(collection["mode"], str) and collection["mode"] in {"saved", "github-explicit-attempt"}
                   and isinstance(collection["snapshot_json"], str) and hash_value(collection["snapshot_hash"])
                   and type(collection["api_get_invocations"]) is int
                   and collection["api_get_invocations"] == (0 if collection["mode"] == "saved" else 6)
                   and collection["repository_mutations"] is False, "Unsupported collection metadata")
    raw = collection["snapshot_json"].encode("utf-8")
    data, digest = triage.decode_evidence(raw)
    recorded = receipt["triage"]
    triage.require(isinstance(recorded, dict) and set(recorded) == {
        "contract_version", "status", "approval", "side_effects", "scope", "evidence_hash", "evidence", "inputs", "decision", "response"},
        "Expected exact recorded triage envelope")
    triage.require(type(recorded["contract_version"]) is int and recorded["contract_version"] == 1
                   and recorded["approval"] == "not_granted" and recorded["side_effects"] == "none"
                   and recorded["scope"] == triage.SCOPE and same(recorded["status"], receipt["status"])
                   and digest == collection["snapshot_hash"] == recorded["evidence_hash"], "Receipt marker or snapshot hash mismatch")
    triage.require(same(recorded["evidence"], data) and same(recorded["inputs"], triage.facts(data)),
                   "Recorded evidence/facts differ from the exact snapshot")
    triage.report_exit(recorded)
    response = recorded["response"]
    adapter = response["adapter"]; report = response["report"]; invocation = report["invocation"]
    triage.require(type(adapter["contract_version"]) is int and adapter["contract_version"] == 1
                   and adapter["phase"] == "response" and adapter["approval"] == "not_granted"
                   and adapter["request_id"] == "release-triage" and adapter["policy_id"] == "release"
                   and all(hash_value(adapter[key]) for key in ["manifest_hash", "source_revision", "suite_file_hash"]),
                   "Unsupported recorded adapter identity")
    triage.require(same(response["status"], recorded["status"]) and same(report["status"], recorded["status"])
                   and report["revision"] == adapter["source_revision"] and isinstance(report["compiler"], str)
                   and report["compiler"] and report["probes"] == [] and isinstance(report["output"], str)
                   and isinstance(report["diagnostics"], list) and invocation["target"] == "decide"
                   and type(invocation["new_execution"]) is bool and type(adapter["new_execution"]) is bool
                   and invocation["new_execution"] == adapter["new_execution"], "Unsupported recorded native report")
    if invocation["new_execution"]:
        triage.require(hash_value(invocation["execution_key"]), "Missing recorded execution identity")
    if recorded["status"] == "Complete":
        triage.require(invocation["new_execution"] and report["result"]["type"] == "Decision"
                       and same(report["result"]["value"], recorded["decision"]), "Recorded decision differs from native result")
    else:
        triage.require("result" not in report, "Incomplete recorded call cannot contain a result")
    return data, digest


def load(path):
    with open(path, "rb") as stream:
        raw = stream.read(1048577)
    triage.require(len(raw) <= 1048576, "Observation receipt exceeds 1 MiB")
    receipt = decode_json(raw.decode("utf-8"))
    validate(receipt)
    return receipt, hashlib.sha256(raw).hexdigest()


def replay(receipt, receipt_hash, binary, project=HERE / "project.json"):
    data, digest = validate(receipt)
    triage.require(hash_value(receipt_hash), "Expected the full receipt byte hash")
    # Discovery does not execute policy code. Compare every saved pin before the
    # fresh session; readiness independently guards subsequent filesystem drift.
    client = ProjectClient(project, binary=binary)
    description = client.description["project"]
    policies = description["policies"]
    triage.require(len(policies) == 1 and policies[0]["id"] == "release", "Expected the release project")
    policy = policies[0]; saved = receipt["triage"]; adapter = saved["response"]["adapter"]
    triage.require(description["manifest_hash"] == adapter["manifest_hash"]
                   and policy["report"]["revision"] == adapter["source_revision"]
                   and policy["suite_file_hash"] == adapter["suite_file_hash"]
                   and policy["report"]["compiler"] == saved["response"]["report"]["compiler"],
                   "Receipt policy/compiler/project pins differ; no replay submitted")
    fresh = triage.triage(data, digest, binary, project=project, client=client)
    matched = same(saved, fresh)
    states = {saved["status"], fresh["status"]}
    if "Error" in states:
        status, code = "Error", 1
    elif "Unknown" in states:
        status, code = "Unknown", 3
    elif not matched:
        status, code = "Mismatch", 1
    else:
        status, code = fresh["decision"]["state"], triage.report_exit(fresh)
    return {"contract_version": 1, "kind": "wisp-workflow-replay", "status": status,
            "comparison": "Reproduced" if matched else "Changed", "approval": "not_granted", "side_effects": "none",
            "new_execution": fresh["response"]["report"]["invocation"]["new_execution"],
            "receipt_hash": receipt_hash, "snapshot_hash": digest,
            "scope": "offline reproducibility of saved evidence, not current CI or authenticated history",
            "recorded": saved, "replayed": fresh}, code


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--receipt", required=True, type=pathlib.Path)
    parser.add_argument("--wisp", default="target/debug/wisp")
    args = parser.parse_args()
    try:
        receipt, receipt_hash = load(args.receipt)
        report, code = replay(receipt, receipt_hash, args.wisp)
        print(encode_json(report, ascii_strings=True), flush=True)
        return code
    except (ClientError, OSError, ValueError, TypeError, KeyError, RecursionError) as error:
        if isinstance(error, BrokenPipeError):
            try: sys.stdout.close()
            except OSError: pass
        print("Replay host error: " + str(error), file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
