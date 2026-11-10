"""Saved finite-suite verification through the pinned Python client."""
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


class SavedVerification(unittest.TestCase):
    def test_exact_native_report_and_finite_execution_evidence(self):
        client = CLIENT.ProjectClient(MANIFEST, binary=BINARY)
        result = client.verify("reservations")
        direct = json.loads(subprocess.check_output([BINARY, "verify", str(MANIFEST.with_name("reservations-after.wisp")),
                                                    "--suite", str(MANIFEST.with_name("cases.json"))]))
        self.assertEqual(result["report"], direct)
        self.assertEqual(result["status"], "Pass")
        self.assertTrue(result["project"]["new_execution"])
        self.assertEqual(result["project"]["approval"], "not_granted")
        self.assertEqual(direct["review"]["summary"]["attempted_invocations"], 14)

    def test_fail_error_unknown_and_preflight_are_native_data_not_transport_success(self):
        suite = {"version": 1, "target": "f", "cases": [{"id": "one", "args": ["2"], "expect": {
            "result": {"type": "Int", "value": "2"}, "output": ""}}]}
        with tempfile.TemporaryDirectory(prefix="wisp-client-verify-") as temp:
            folder = pathlib.Path(temp)
            manifest = folder / "project.json"
            manifest.write_text(json.dumps({"version": 1, "policies": [{"id": "p", "source": "source.wisp", "suite": "cases.json"}]}))
            for body, saved, status, executed in [("n", suite, "Pass", True), ("n+1", suite, "Fail", True),
                                                  ("n/0", suite, "Error", True), ("f(n)", suite, "Unknown", True),
                                                  ("n", None, "Error", False),
                                                  ("n", {**suite, "cases": [{**suite["cases"][0], "id": str(i)} for i in range(17)]}, "Unknown", False)]:
                (folder / "source.wisp").write_text("fn f(n:Int)->Int{" + body + "}")
                (folder / "cases.json").write_text(json.dumps(saved))
                result = CLIENT.ProjectClient(manifest, binary=BINARY).verify("p")
                self.assertEqual(result["status"], status)
                self.assertEqual(result["project"]["new_execution"], executed)
                self.assertEqual(result["report"]["review"]["approval"], "not_granted")

    def test_invalid_target_never_dispatches(self):
        client = CLIENT.ProjectClient(MANIFEST, binary=BINARY)
        with mock.patch.object(CLIENT, "run_cli", side_effect=AssertionError("No command")):
            for policy in ["missing", True, "../other"]:
                with self.assertRaises(CLIENT.ClientError): client.verify(policy)

    def test_pin_drift_including_other_policy_is_not_exposed_as_verified(self):
        with tempfile.TemporaryDirectory(prefix="wisp-client-verify-drift-") as temp:
            folder = pathlib.Path(temp)
            for name in ["a", "b"]:
                (folder / (name + ".wisp")).write_text("fn f(n:Int)->Int{n}")
                (folder / (name + ".json")).write_text('null')
            manifest = folder / "project.json"
            manifest.write_text(json.dumps({"version": 1, "policies": [
                {"id": n, "source": n + ".wisp", "suite": n + ".json"} for n in ["a", "b"]]}))
            client = CLIENT.ProjectClient(manifest, binary=BINARY)
            for name in ["project.json", "a.wisp", "a.json", "b.wisp", "b.json"]:
                path = folder / name; raw = path.read_bytes(); path.write_bytes(raw + b"\n")
                with self.subTest(name=name):
                    with self.assertRaises(CLIENT.ClientError): client.verify("a")
                path.write_bytes(raw)

    def test_malformed_verification_markers_and_ledgers_are_rejected(self):
        client = CLIENT.ProjectClient(MANIFEST, binary=BINARY)
        original = client.verify("reservations")
        variants = []
        for section, field, value in [("project", "guard_status", "not_requested"), ("project", "new_execution", False),
                                       ("project", "policy_id", "other"), ("report", "compiler", "other"),
                                       ("report", "result", {}), ("report", "invocation", {}), ("report", "output", "ran")]:
            response = copy.deepcopy(original); response[section][field] = value; variants.append(response)
        for field, value in [("approval", "granted"), ("candidate_revision", "0" * 64), ("new_execution", 1),
                             ("phase", "preflight"), ("query_key", "bad")]:
            response = copy.deepcopy(original); response["report"]["review"][field] = value; variants.append(response)
        for field, value in [("total", True), ("total", 8), ("attempted_invocations", 0), ("expectation_pass", 0)]:
            response = copy.deepcopy(original); response["report"]["review"]["summary"][field] = value; variants.append(response)
        response = copy.deepcopy(original); response["report"]["review"]["cases"][0]["expectation"] = "Fail"; variants.append(response)
        for response in variants:
            with mock.patch.object(CLIENT, "run_cli", return_value=json.dumps(response)):
                with self.assertRaises(CLIENT.ClientError): client.verify("reservations")


if __name__ == "__main__":
    unittest.main()
