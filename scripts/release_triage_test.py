"""Saved GitHub evidence -> typed Wisp triage, without network or write actions."""
import copy
import hashlib
import importlib.util
import json
import pathlib
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[1]
EXAMPLE = ROOT / "examples" / "release-triage"
BINARY = str(ROOT / "target" / "debug" / "wisp")
spec = importlib.util.spec_from_file_location("release_triage", EXAMPLE / "run.py")
HOST = importlib.util.module_from_spec(spec); spec.loader.exec_module(HOST)


class ReleaseTriage(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="wisp-triage-")
        self.addCleanup(self.temp.cleanup)
        self.path = pathlib.Path(self.temp.name) / "evidence.json"
        self.original = json.loads((EXAMPLE / "pr16-merge.json").read_text())

    def run_case(self, data):
        self.path.write_text(json.dumps(data))
        loaded, digest = HOST.load(self.path)
        report = HOST.triage(loaded, digest, BINARY)
        self.assertEqual(report["status"], "Complete")
        self.assertEqual(report["approval"], "not_granted")
        self.assertEqual(report["side_effects"], "none")
        self.assertEqual(report["evidence"], data)
        self.assertEqual(report["evidence_hash"], hashlib.sha256(self.path.read_bytes()).hexdigest())
        return report["decision"]

    def test_actual_pr16_historical_evidence_is_observed_not_release_acceptance(self):
        raw = (EXAMPLE / "pr16-merge.json").read_bytes()
        data, digest = HOST.load(EXAMPLE / "pr16-merge.json")
        report = HOST.triage(data, digest, BINARY)
        self.assertEqual(report["decision"], {"state": "Observed", "reason": "workflow_checks_complete"})
        self.assertIn("not deployment or functional acceptance", report["scope"])
        self.assertEqual((EXAMPLE / "pr16-merge.json").read_bytes(), raw)
        self.assertEqual(data["checks"]["databaseId"], 42765846556)
        self.assertEqual(data["pages"]["databaseId"], 42765846687)

    def test_live_job_failure_is_blocked_while_run_still_running(self):
        for other in ["complete", "missing", "stale"]:
            data = copy.deepcopy(self.original)
            data["checks"].update(status="in_progress", conclusion="")
            data["checks"]["jobs"][0]["conclusion"] = "failure"
            if other == "missing": data["pages"] = None
            if other == "stale": data["pages"]["headSha"] = "0" * 40
            self.assertEqual(self.run_case(data), {"state": "Blocked", "reason": "failed_job"})

    def test_missing_stale_untrusted_and_wrong_event_never_observed(self):
        for field in ["checks", "pages"]:
            data = copy.deepcopy(self.original); data[field] = None
            self.assertEqual(self.run_case(data), {"state": "Unknown", "reason": "missing_workflow"})
            for change in [{"headSha": "0" * 40}, {"headBranch": "feature"}, {"event": "pull_request"}]:
                data = copy.deepcopy(self.original); data[field].update(change)
                self.assertEqual(self.run_case(data), {"state": "Unknown", "reason": "stale_workflow"})
        data = copy.deepcopy(self.original); data["ref"] = "refs/heads/feature"
        self.assertEqual(self.run_case(data), {"state": "Blocked", "reason": "untrusted_revision"})
        data = copy.deepcopy(self.original); data["pages"]["headSha"] = "0" * 40
        data["pages"]["jobs"][0]["conclusion"] = "failure"
        self.assertEqual(self.run_case(data)["state"], "Unknown")

    def test_job_coverage_pending_cancelled_skipped_and_nonrequired_failure(self):
        data = copy.deepcopy(self.original); data["pages"]["jobs"].pop()
        self.assertEqual(self.run_case(data), {"state": "Unknown", "reason": "missing_required_job"})
        data = copy.deepcopy(self.original)
        data["pages"].update(status="in_progress", conclusion="")
        data["pages"]["jobs"][1].update(status="queued", conclusion="")
        self.assertEqual(self.run_case(data), {"state": "Pending", "reason": "work_in_progress"})
        for conclusion in ["cancelled", "neutral", "skipped", "stale"]:
            data = copy.deepcopy(self.original); data["pages"]["jobs"][1]["conclusion"] = conclusion
            self.assertEqual(self.run_case(data), {"state": "Blocked", "reason": "unsuccessful_required_job"})
        data = copy.deepcopy(self.original); data["checks"]["conclusion"] = "cancelled"
        self.assertEqual(self.run_case(data), {"state": "Blocked", "reason": "unsuccessful_workflow"})
        for conclusion in ["failure", "timed_out", "action_required", "startup_failure"]:
            data = copy.deepcopy(self.original)
            data["pages"]["jobs"].append({"name": "additional", "status": "completed", "conclusion": conclusion})
            self.assertEqual(self.run_case(data), {"state": "Blocked", "reason": "failed_job"})

    def test_malformed_provider_data_rejected_before_native_process(self):
        variants = [[], {}, {**self.original, "version": True}, {**self.original, "repository": "other/repo"},
                    {**self.original, "revision": "short"}, {**self.original, "extra": 1}]
        for field, value in [("databaseId", True), ("databaseId", 0), ("workflowName", "other"),
                             ("status", "future"), ("status", []), ("conclusion", "future"),
                             ("conclusion", ""), ("jobs", {})]:
            data = copy.deepcopy(self.original); data["checks"][field] = value; variants.append(data)
        data = copy.deepcopy(self.original); data["checks"]["jobs"] *= 2; variants.append(data)
        data = copy.deepcopy(self.original); data["checks"]["jobs"][0]["name"] = "\ud800"; variants.append(data)
        data = copy.deepcopy(self.original); data["checks"]["jobs"][0]["status"] = "in_progress"; variants.append(data)
        data = copy.deepcopy(self.original); data["checks"]["jobs"] = [{}]; variants.append(data)
        data = copy.deepcopy(self.original); data["pages"]["databaseId"] = data["checks"]["databaseId"]; variants.append(data)
        with mock.patch.object(HOST, "ProjectClient", side_effect=AssertionError("No native process")):
            for data in variants:
                self.path.write_text(json.dumps(data))
                with self.assertRaises((HOST.ClientError, ValueError, TypeError)):
                    HOST.load(self.path)
            for raw in [b"\xff", b" " * 65537, b'{"version":1,"version":1}']:
                self.path.write_bytes(raw)
                with self.assertRaises((HOST.ClientError, ValueError, UnicodeError)):
                    HOST.load(self.path)

    def test_cli_exit_and_runtime_decision_are_separate(self):
        command = [sys.executable, "-B", str(EXAMPLE / "run.py"), "--wisp", BINARY, "--evidence", str(self.path)]
        for change, expected in [("observed", 0), ("missing", 3), ("blocked", 1), ("pending", 3), ("malformed", 2)]:
            data = copy.deepcopy(self.original)
            if change == "missing": data["checks"] = None
            if change == "blocked": data["checks"]["jobs"][0]["conclusion"] = "failure"
            if change == "pending":
                data["checks"].update(status="in_progress", conclusion="")
                data["checks"]["jobs"][0].update(status="in_progress", conclusion="")
            if change == "malformed": data["version"] = 2
            self.path.write_text(json.dumps(data))
            p = subprocess.run(command, text=True, capture_output=True, timeout=15)
            self.assertEqual(p.returncode, expected, p.stderr)
            if expected == 2: self.assertEqual(p.stdout, "")
            else: self.assertEqual(json.loads(p.stdout)["status"], "Complete")

    def test_closed_stdout_reader_is_host_exit_two_not_shutdown_exit_120(self):
        process = subprocess.Popen([sys.executable, "-B", str(EXAMPLE / "run.py"), "--wisp", BINARY,
                                    "--evidence", str(EXAMPLE / "pr16-merge.json")],
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        process.stdout.close()
        try:
            self.assertEqual(process.wait(timeout=15), 2)
            error = process.stderr.read().decode("utf-8")
            self.assertIn("Triage host error", error)
            self.assertNotIn("Exception ignored", error)
        finally:
            if process.poll() is None: process.kill(); process.wait()
            process.stderr.close()


if __name__ == "__main__":
    unittest.main()
