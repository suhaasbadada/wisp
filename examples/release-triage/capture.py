"""Capture explicitly chosen GitHub run attempts; never select, retry or watch."""
import argparse
import datetime
import importlib.util
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("wisp_release_triage", HERE / "run.py")
triage = importlib.util.module_from_spec(spec)
spec.loader.exec_module(triage)
from wisp_client import ClientError, decode_json, encode_json, run_cli, validate_json

PATHS = {"Checks": ".github/workflows/checks.yml", "Pages": ".github/workflows/pages.yml"}


def positive(value):
    triage.require(type(value) is int and 0 < value <= 9223372036854775807, "Run IDs and attempts must be positive signed-64-bit integers")
    return value


def api(endpoint):
    # Fixed host/repository, arguments not shell, existing gh credential handling.
    raw = run_cli("gh", ["api", "--hostname", "github.com", "--method", "GET", endpoint], timeout=15)
    triage.require(len(raw.encode("utf-8")) <= 1048576, "GitHub response exceeds 1 MiB")
    value = decode_json(raw); validate_json(value)
    return value


def identity(run, name, revision, run_id, attempt):
    triage.require(isinstance(run, dict), "Expected GitHub run object")
    triage.require(type(run.get("id")) is int and run["id"] == run_id
                   and type(run.get("run_attempt")) is int and run["run_attempt"] == attempt
                   and run.get("name") == name and run.get("path") == PATHS[name]
                   and run.get("head_sha") == revision and run.get("head_branch") == "main"
                   and run.get("event") == "push"
                   and isinstance(run.get("repository"), dict) and run["repository"].get("full_name") == triage.REPOSITORY
                   and isinstance(run.get("head_repository"), dict) and run["head_repository"].get("full_name") == triage.REPOSITORY,
                   "Run does not match the requested repository/workflow/revision/attempt/main push")
    triage.require(isinstance(run.get("status"), str) and run["status"] in triage.STATUSES
                   and (run.get("conclusion") is None or isinstance(run.get("conclusion"), str))
                   and (run.get("conclusion") or "") in triage.CONCLUSIONS, "Unsupported GitHub run status")
    return (run["id"], run["run_attempt"], run["name"], run["path"], run["head_sha"], run["head_branch"],
            run["event"], run["status"], run["conclusion"] or "")


def collect(name, revision, run_id, attempt, fetch):
    root = "repos/" + triage.REPOSITORY + "/actions/runs/" + str(run_id)
    first = fetch(root)
    pin = identity(first, name, revision, run_id, attempt)
    result = fetch(root + "/attempts/" + str(attempt) + "/jobs?per_page=100")
    triage.require(isinstance(result, dict) and type(result.get("total_count")) is int
                   and isinstance(result.get("jobs"), list)
                   and 0 <= result["total_count"] <= 32 and result["total_count"] == len(result["jobs"]),
                   "Missing, truncated or oversized attempt job list")
    jobs = []; ids = set()
    for job in result["jobs"]:
        triage.require(isinstance(job, dict) and type(job.get("id")) is int and positive(job["id"])
                       and job["id"] not in ids and type(job.get("run_id")) is int and job["run_id"] == run_id
                       and type(job.get("run_attempt")) is int and job["run_attempt"] == attempt
                       and job.get("head_sha") == revision, "Job identity differs from selected run attempt")
        ids.add(job["id"])
        triage.require(isinstance(job.get("conclusion"), str) or job.get("conclusion") is None,
                       "Unsupported GitHub job conclusion")
        jobs.append({"name": job["name"], "status": job["status"], "conclusion": job["conclusion"] or "",
                     "databaseId": job["id"], "runAttempt": attempt, "headSha": revision})
    # A bounded consistency read, not a watcher or retry: reject changes rather
    # than silently select a new attempt or wait for a different result.
    last = fetch(root)
    triage.require(identity(last, name, revision, run_id, attempt) == pin, "Run changed during capture; inspect it without automatic retry")
    return {"databaseId": run_id, "workflowName": name, "headSha": revision, "headBranch": "main", "event": "push",
            "status": last["status"], "conclusion": last["conclusion"] or "", "jobs": jobs,
            "capture": {"source": "github-actions-rest", "repository": triage.REPOSITORY,
                        "workflow_path": PATHS[name], "run_attempt": attempt,
                        "observed_at": datetime.datetime.now(datetime.timezone.utc).isoformat()}}


def capture(revision, checks_run, checks_attempt, pages_run, pages_attempt, fetch=None):
    triage.require(triage.sha(revision), "Expected a full lowercase 40-character revision")
    for value in [checks_run, checks_attempt, pages_run, pages_attempt]: positive(value)
    triage.require(checks_run != pages_run, "Checks and Pages run IDs must differ")
    fetch = api if fetch is None else fetch
    data = {"version": 1, "repository": triage.REPOSITORY, "revision": revision, "ref": "refs/heads/main",
            "checks": collect("Checks", revision, checks_run, checks_attempt, fetch),
            "pages": collect("Pages", revision, pages_run, pages_attempt, fetch)}
    triage.validate_evidence(data)
    raw = encode_json(data, ascii_strings=True) + "\n"
    triage.require(len(raw.encode("utf-8")) <= 65536, "Captured evidence exceeds the triage input bound")
    return raw


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--revision", required=True)
    parser.add_argument("--checks-run", required=True, type=int)
    parser.add_argument("--checks-attempt", required=True, type=int)
    parser.add_argument("--pages-run", required=True, type=int)
    parser.add_argument("--pages-attempt", required=True, type=int)
    args = parser.parse_args()
    try:
        raw = capture(args.revision, args.checks_run, args.checks_attempt, args.pages_run, args.pages_attempt)
        print(raw, end="", flush=True)
        return 0
    except (ClientError, OSError, ValueError, TypeError, KeyError, RecursionError) as error:
        if isinstance(error, BrokenPipeError):
            try: sys.stdout.close()
            except OSError: pass
        print("Capture error: " + str(error), file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
