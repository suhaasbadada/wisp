"""Explicit-attempt, fixed-host capture tests; no network in this suite."""
import importlib.util
import json
import pathlib
import subprocess
import sys
import unittest
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[1]
EXAMPLE = ROOT / "examples" / "release-triage"
spec = importlib.util.spec_from_file_location("release_capture", EXAMPLE / "capture.py")
HOST = importlib.util.module_from_spec(spec); spec.loader.exec_module(HOST)
SHA = "ae1d71f8cc0d7804570f1982e323259524955c84"
CHECKS = 42765846556
PAGES = 42765846687


def run(name, run_id):
    return {"id": run_id, "name": name, "path": HOST.PATHS[name], "head_sha": SHA, "head_branch": "main", "event": "push",
            "repository": {"full_name": "suhaasbadada/wisp"}, "head_repository": {"full_name": "suhaasbadada/wisp"},
            "run_attempt": 1, "status": "completed", "conclusion": "success"}


def jobs(name, run_id):
    names = ["verify"] if name == "Checks" else ["build", "deploy"]
    return {"total_count": len(names), "jobs": [
        {"id": run_id + index + 10, "run_id": run_id, "run_attempt": 1, "head_sha": SHA,
         "name": job, "status": "completed", "conclusion": "success"} for index, job in enumerate(names)]}


class ReleaseCapture(unittest.TestCase):
    def collect(self, mutate=None):
        calls = []; counts = {}
        def fetch(endpoint):
            calls.append(endpoint)
            run_id = CHECKS if str(CHECKS) in endpoint else PAGES
            name = "Checks" if run_id == CHECKS else "Pages"
            is_jobs = "/jobs?" in endpoint
            value = jobs(name, run_id) if is_jobs else run(name, run_id)
            counts[endpoint] = counts.get(endpoint, 0) + 1
            if mutate: mutate(value, name, is_jobs, counts[endpoint])
            return value
        raw = HOST.capture(SHA, CHECKS, 1, PAGES, 1, fetch=fetch)
        return json.loads(raw), calls

    def test_explicit_attempt_capture_is_consumable_and_preserves_provenance(self):
        data, calls = self.collect()
        HOST.triage.validate_evidence(data)
        self.assertEqual(len(calls), 6)
        self.assertTrue(all(p.startswith("repos/suhaasbadada/wisp/actions/runs/") for p in calls))
        self.assertEqual(sum("/attempts/1/jobs?per_page=100" in p for p in calls), 2)
        for key in ["checks", "pages"]:
            self.assertEqual(data[key]["capture"]["run_attempt"], 1)
            self.assertEqual(data[key]["capture"]["source"], "github-actions-rest")
            self.assertTrue(all(job["runAttempt"] == 1 and job["headSha"] == SHA for job in data[key]["jobs"]))
        report = HOST.triage.triage(data, "captured-test", str(ROOT / "target" / "debug" / "wisp"))
        self.assertEqual(report["decision"]["state"], "Observed")
        self.assertEqual(report["approval"], "not_granted")

    def test_argument_validation_never_contacts_github(self):
        for values in [("short", CHECKS, 1, PAGES, 1), (SHA, -1, 1, PAGES, 1),
                       (SHA, CHECKS, True, PAGES, 1), (SHA, CHECKS, 0, PAGES, 1),
                       (SHA, CHECKS, 1, CHECKS, 1), (SHA, 2 ** 63, 1, PAGES, 1)]:
            with mock.patch.object(HOST, "api", side_effect=AssertionError("No request")):
                with self.assertRaises(HOST.ClientError): HOST.capture(*values)

    def test_repository_workflow_head_branch_event_and_attempt_mismatches_reject(self):
        changes = [("id", CHECKS + 1), ("id", True), ("run_attempt", 2), ("run_attempt", True),
                   ("name", "other"), ("path", ".github/workflows/untrusted.yml"),
                   ("head_sha", "0" * 40), ("head_branch", "feature"), ("event", "pull_request"),
                   ("repository", {"full_name": "other/repo"}), ("head_repository", {"full_name": "fork/repo"})]
        for key, value in changes:
            def mutate(data, name, is_jobs, count):
                if name == "Checks" and not is_jobs: data[key] = value
            with self.subTest(key=key):
                with self.assertRaises(HOST.ClientError): self.collect(mutate)

    def test_changed_attempt_or_run_state_during_capture_is_not_retried(self):
        for key, value in [("run_attempt", 2), ("status", "in_progress"), ("conclusion", "failure")]:
            def mutate(data, name, is_jobs, count):
                if name == "Checks" and not is_jobs and count == 2: data[key] = value
            with self.assertRaises(HOST.ClientError): self.collect(mutate)

    def test_attempt_job_truncation_duplicates_and_wrong_identity_reject(self):
        def count(data): data["total_count"] += 1
        def oversized(data): data["total_count"] = 33
        def duplicate(data): data["jobs"] *= 2; data["total_count"] *= 2
        mutations = [count, oversized, duplicate]
        for key, value in [("run_id", PAGES), ("run_attempt", 2), ("head_sha", "0" * 40), ("id", True),
                           ("status", "future"), ("conclusion", "future"), ("name", "\ud800")]:
            mutations.append(lambda data, k=key, v=value: data["jobs"][0].update({k: v}))
        for mutation in mutations:
            def mutate(data, name, is_jobs, count):
                if name == "Checks" and is_jobs: mutation(data)
            with self.assertRaises((HOST.ClientError, ValueError)): self.collect(mutate)

    def test_running_null_conclusions_normalize_to_pending_not_success(self):
        def mutate(data, name, is_jobs, count):
            if name == "Checks":
                if is_jobs: data["jobs"][0].update(status="in_progress", conclusion=None)
                else: data.update(status="in_progress", conclusion=None)
        data, _ = self.collect(mutate)
        self.assertEqual(data["checks"]["conclusion"], "")
        self.assertEqual(data["checks"]["jobs"][0]["conclusion"], "")
        report = HOST.triage.triage(data, "running-test", str(ROOT / "target" / "debug" / "wisp"))
        self.assertEqual(report["decision"]["state"], "Pending")

    def test_api_uses_fixed_host_get_and_existing_gh_without_shell(self):
        endpoint = "repos/suhaasbadada/wisp/actions/runs/1"
        with mock.patch.object(HOST, "run_cli", return_value="{}") as cli:
            self.assertEqual(HOST.api(endpoint), {})
            cli.assert_called_once_with("gh", ["api", "--hostname", "github.com", "--method", "GET", endpoint], timeout=15)
        for raw in ["x" * 1048577, '{"id":1,"id":2}', "[NaN]"]:
            with mock.patch.object(HOST, "run_cli", return_value=raw):
                with self.assertRaises(HOST.ClientError): HOST.api(endpoint)

    def test_cli_invalid_arguments_return_two_before_github(self):
        command = [sys.executable, "-B", str(EXAMPLE / "capture.py"), "--revision", "short", "--checks-run", "1",
                   "--checks-attempt", "1", "--pages-run", "2", "--pages-attempt", "1"]
        process = subprocess.run(command, capture_output=True, text=True, timeout=10)
        self.assertEqual(process.returncode, 2)
        self.assertEqual(process.stdout, "")
        self.assertIn("40-character", process.stderr)


if __name__ == "__main__":
    unittest.main()
