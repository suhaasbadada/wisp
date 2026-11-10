"""Guarded native saved-project focus through the reusable Python client."""
import copy
import json
import pathlib
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "clients" / "python"))
import wisp_client as CLIENT

BINARY = str(ROOT / "target" / "debug" / "wisp")
MANIFEST = ROOT / "examples" / "policies" / "project.json"


class ProjectFocus(unittest.TestCase):
    def test_native_focus_preserves_core_report_and_text_budget_without_evaluation(self):
        client = CLIENT.ProjectClient(MANIFEST, binary=BINARY)
        for budget in [0, 1, 64, 4096, 65536]:
            focused = client.focus("reservations", "decide", budget=budget)
            direct = json.loads(subprocess.check_output([BINARY, "focus", str(MANIFEST.with_name("reservations-after.wisp")), "decide", "--budget", str(budget)]))
            self.assertEqual(focused["report"], direct)
            self.assertFalse(focused["project"]["new_execution"])
            self.assertEqual(focused["project"]["guard_status"], "matched")
            self.assertEqual(focused["report"]["output"], "")
            self.assertEqual(focused["report"]["probes"], [])
            self.assertNotIn("usage", focused["report"])
            self.assertLessEqual(len(focused["report"]["agent_view"]["text"].encode()), budget)

    def test_invalid_targets_and_budgets_never_start_native_command(self):
        client = CLIENT.ProjectClient(MANIFEST, binary=BINARY)
        for policy, function, budget in [("absent", "decide", 1), ("reservations", "absent", 1),
                                         ("reservations", "decide", True), ("reservations", "decide", -1),
                                         ("reservations", "decide", 65537), ("reservations", "decide", 1.5)]:
            with mock.patch.object(CLIENT, "run_cli", side_effect=AssertionError("No native command")):
                with self.assertRaises(CLIENT.ClientError): client.focus(policy, function, budget)

    def test_selected_and_other_policy_snapshot_drift_is_rejected(self):
        with tempfile.TemporaryDirectory(prefix="wisp-client-focus-") as temp:
            folder = pathlib.Path(temp)
            (folder / "suite.json").write_text('{}')
            for name in ["a.wisp", "b.wisp"]: (folder / name).write_text('fn f(n: Int) -> Int { n }')
            manifest = folder / "project.json"
            manifest.write_text(json.dumps({"version": 1, "policies": [
                {"id": name, "source": name + ".wisp", "suite": "suite.json"} for name in ["a", "b"]]}))
            client = CLIENT.ProjectClient(manifest, binary=BINARY)
            self.assertEqual(client.focus("a", "f")["status"], "Ready")
            for name in ["a.wisp", "b.wisp", "suite.json", "project.json"]:
                path = folder / name; raw = path.read_bytes(); path.write_bytes(raw + b"\n")
                with self.subTest(name=name):
                    with self.assertRaises(CLIENT.ClientError): client.focus("a", "f")
                path.write_bytes(raw)

    def test_malformed_native_focus_markers_and_budget_never_become_ready(self):
        client = CLIENT.ProjectClient(MANIFEST, binary=BINARY)
        original = client.focus("reservations", "decide", budget=1)
        changes = [("project", "manifest_hash", "0" * 64), ("project", "policy_id", "other"),
                   ("project", "guard_status", "not_requested"), ("project", "new_execution", True),
                   ("report", "compiler", "other"), ("report", "output", "executed"), ("report", "usage", {}),
                   ("report", "invocation", {"new_execution": True}), ("report", "result", {"type": "Int", "value": "1"})]
        variants = []
        for section, field, value in changes:
            response = copy.deepcopy(original); response[section][field] = value; variants.append(response)
        for field, value in [("focus", "other"), ("budget_bytes", True), ("used_bytes", True), ("required_bytes", 0), ("overflow", False)]:
            response = copy.deepcopy(original); response["report"]["agent_view"][field] = value; variants.append(response)
        response = copy.deepcopy(original); response["project"]["policies"][0]["suite_file_hash"] = "0" * 64; variants.append(response)
        for response in variants:
            with mock.patch.object(CLIENT, "run_cli", return_value=json.dumps(response)):
                with self.assertRaises(CLIENT.ClientError): client.focus("reservations", "decide", 1)
        response = client.focus("reservations", "decide", 4096)
        self.assertFalse(response["report"]["agent_view"]["overflow"])
        response["report"]["agent_view"].update(text="", used_bytes=0)
        with mock.patch.object(CLIENT, "run_cli", return_value=json.dumps(response)):
            with self.assertRaises(CLIENT.ClientError): client.focus("reservations", "decide", 4096)

    def test_nonready_native_focus_reports_remain_error_or_unknown_data(self):
        client = CLIENT.ProjectClient(MANIFEST, binary=BINARY)
        original = client.focus("reservations", "decide")
        # Adapter contract simulation: actual native Error/Unknown source behavior
        # is independently covered by tests/project_focus.rs.
        for status in ["Error", "Unknown"]:
            response = copy.deepcopy(original); response["status"] = status; response["report"]["status"] = status
            response["report"].pop("agent_view")
            with mock.patch.object(CLIENT, "run_cli", return_value=json.dumps(response)):
                returned = client.focus("reservations", "decide")
            self.assertEqual(returned["status"], status)
            self.assertFalse(returned["project"]["new_execution"])


if __name__ == "__main__":
    unittest.main()
