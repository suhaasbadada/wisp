"""Read-only Wisp-repository workflow triage from saved GitHub run evidence."""
import argparse
import hashlib
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "clients" / "python"))
from wisp_client import ClientError, ProjectClient, decode_json, encode_json, validate_json

REPOSITORY = "suhaasbadada/wisp"
STATUSES = {"queued", "in_progress", "completed", "waiting", "pending", "requested"}
CONCLUSIONS = {"", "success", "failure", "cancelled", "timed_out", "action_required",
               "neutral", "skipped", "startup_failure", "stale"}
FAILURES = {"failure", "timed_out", "action_required", "startup_failure"}
REQUIRED = {"Checks": {"verify"}, "Pages": {"build", "deploy"}}
WORKFLOW_FIELDS = [("present", "Bool"), ("current", "Bool"), ("status", "String"),
                   ("conclusion", "String"), ("failed_jobs", "Int"),
                   ("required_present", "Bool"), ("pending_jobs", "Int"), ("unsuccessful_jobs", "Int")]


def require(value, message):
    if not value:
        raise ClientError(message)


def sha(value):
    return isinstance(value, str) and re.fullmatch(r"[0-9a-f]{40}", value) is not None


def load(path):
    with open(path, "rb") as stream:
        raw = stream.read(65537)
    return decode_evidence(raw)


def decode_evidence(raw):
    require(len(raw) <= 65536, "Evidence exceeds 65536 bytes")
    data = decode_json(raw.decode("utf-8"))
    validate_evidence(data)
    return data, hashlib.sha256(raw).hexdigest()


def validate_evidence(data):
    validate_json(data)
    require(isinstance(data, dict) and set(data) == {"version", "repository", "revision", "ref", "checks", "pages"}
            and type(data["version"]) is int and data["version"] == 1
            and data["repository"] == REPOSITORY and sha(data["revision"])
            and isinstance(data["ref"], str), "Expected a version-1 Wisp repository evidence bundle")
    for field, name in [("checks", "Checks"), ("pages", "Pages")]:
        run = data[field]
        if run is None:
            continue
        require(isinstance(run, dict), "Expected a run object or null")
        require({"databaseId", "workflowName", "headSha", "headBranch", "event", "status", "conclusion", "jobs"} <= set(run),
                "Missing run metadata")
        require(type(run["databaseId"]) is int and run["databaseId"] > 0
                and run["workflowName"] == name and sha(run["headSha"])
                and isinstance(run["headBranch"], str) and isinstance(run["event"], str)
                and isinstance(run["status"], str) and run["status"] in STATUSES
                and isinstance(run["conclusion"], str) and run["conclusion"] in CONCLUSIONS
                and isinstance(run["jobs"], list) and len(run["jobs"]) <= 32, "Unsupported run metadata")
        require((run["status"] == "completed") == (run["conclusion"] != ""), "Contradictory run completion metadata")
        names = set()
        for job in run["jobs"]:
            require(isinstance(job, dict) and {"name", "status", "conclusion"} <= set(job), "Missing job metadata")
            require(isinstance(job["name"], str) and job["name"] and len(job["name"].encode("utf-8")) <= 256
                    and job["name"] not in names and isinstance(job["status"], str) and job["status"] in STATUSES
                    and isinstance(job["conclusion"], str) and job["conclusion"] in CONCLUSIONS, "Unsupported or duplicate job metadata")
            require((job["status"] == "completed") == (job["conclusion"] != ""), "Contradictory job completion metadata")
            names.add(job["name"])
    if data["checks"] is not None and data["pages"] is not None:
        require(data["checks"]["databaseId"] != data["pages"]["databaseId"], "Workflow run IDs must be distinct")


def facts(data):
    def workflow(run, name):
        if run is None:
            return {"present": False, "current": False, "status": "", "conclusion": "", "failed_jobs": "0",
                    "required_present": False, "pending_jobs": "0", "unsuccessful_jobs": "0"}
        required = [job for job in run["jobs"] if job["name"] in REQUIRED[name]]
        return {"present": True, "current": run["headSha"] == data["revision"] and run["headBranch"] == "main" and run["event"] == "push",
                "status": run["status"], "conclusion": run["conclusion"],
                "failed_jobs": str(sum(job["conclusion"] in FAILURES for job in run["jobs"])),
                "required_present": {job["name"] for job in required} == REQUIRED[name],
                "pending_jobs": str(sum(job["status"] != "completed" for job in required)),
                "unsuccessful_jobs": str(sum(job["status"] == "completed" and job["conclusion"] != "success" for job in required))}
    return {"trusted_main": data["repository"] == REPOSITORY and data["ref"] == "refs/heads/main",
            "checks": workflow(data["checks"], "Checks"), "pages": workflow(data["pages"], "Pages")}


def triage(data, digest, binary, project=HERE / "project.json"):
    client = ProjectClient(project, binary=binary)
    policies = client.description["project"]["policies"]
    require(len(policies) == 1 and policies[0]["id"] == "release", "Expected the release triage project")
    interface = policies[0]["report"]["interface"]
    boundary = {"name": "decide", "parameters": [{"name": "evidence", "type": {"kind": "Record", "name": "Evidence"}}],
                "return_type": {"kind": "Record", "name": "Decision"}}
    require(boundary in interface["functions"], "Unsupported triage function boundary")
    records = {r["name"]: r["fields"] for r in interface["records"]}
    expected = {"Workflow": [{"name": name, "type": {"kind": kind}} for name, kind in WORKFLOW_FIELDS],
                "Evidence": [{"name": "trusted_main", "type": {"kind": "Bool"}},
                             {"name": "checks", "type": {"kind": "Record", "name": "Workflow"}},
                             {"name": "pages", "type": {"kind": "Record", "name": "Workflow"}}],
                "Decision": [{"name": "state", "type": {"kind": "String"}}, {"name": "reason", "type": {"kind": "String"}}]}
    require(all(records.get(k) == v for k, v in expected.items()), "Unsupported triage record boundary")
    inputs = facts(data)
    response = client.call("release", "decide", [inputs], request_id="release-triage")
    decision = response["report"]["result"]["value"] if response["status"] == "Complete" else None
    return {"contract_version": 1, "status": response["status"], "approval": "not_granted", "side_effects": "none",
            "scope": "saved workflow evidence only; not deployment or functional acceptance", "evidence_hash": digest,
            "evidence": data, "inputs": inputs, "decision": decision, "response": response}


def report_exit(report):
    require(report["status"] in {"Complete", "Error", "Unknown"}, "Unsupported runtime triage status")
    if report["status"] != "Complete":
        require(report["decision"] is None, "Incomplete triage must not fabricate a decision")
        return 3 if report["status"] == "Unknown" else 1
    require(isinstance(report["decision"], dict) and set(report["decision"]) == {"state", "reason"}
            and isinstance(report["decision"]["state"], str)
            and report["decision"]["state"] in {"Observed", "Blocked", "Pending", "Unknown"}
            and isinstance(report["decision"]["reason"], str), "Unsupported triage decision")
    return {"Observed": 0, "Blocked": 1, "Pending": 3, "Unknown": 3}[report["decision"]["state"]]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--evidence", required=True, type=pathlib.Path)
    parser.add_argument("--wisp", default="target/debug/wisp")
    args = parser.parse_args()
    try:
        data, digest = load(args.evidence)
        report = triage(data, digest, args.wisp)
        code = report_exit(report)
        print(encode_json(report, ascii_strings=True), flush=True)
        return code
    except (ClientError, OSError, ValueError, TypeError, KeyError, RecursionError) as error:
        if isinstance(error, BrokenPipeError):
            try:
                sys.stdout.close()
            except OSError:
                pass
        print("Triage host error: " + str(error), file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
