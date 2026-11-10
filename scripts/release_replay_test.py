"""Offline receipt replay, tamper/drift guards, and conservative outcomes."""
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
spec = importlib.util.spec_from_file_location("release_replay", EXAMPLE / "replay.py")
HOST = importlib.util.module_from_spec(spec); spec.loader.exec_module(HOST)
RAW = (EXAMPLE / "pr16-merge.json").read_bytes()


class ReleaseReplay(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.receipt, _ = HOST.observation.observe(RAW, BINARY, "saved")

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="wisp-replay-")
        self.addCleanup(self.temp.cleanup)
        self.path = pathlib.Path(self.temp.name) / "receipt.json"

    def save(self, receipt):
        self.path.write_text(json.dumps(receipt))
        return HOST.load(self.path)

    def test_native_offline_replay_preserves_original_and_marks_new_execution(self):
        original = copy.deepcopy(self.receipt)
        receipt, digest = self.save(original)
        with mock.patch.object(HOST.observation.capture_host, "api", side_effect=AssertionError("No GitHub")):
            report, code = HOST.replay(receipt, digest, BINARY)
        self.assertEqual(code, 0)
        self.assertEqual(report["status"], "Observed")
        self.assertEqual(report["comparison"], "Reproduced")
        self.assertTrue(report["new_execution"])
        self.assertEqual(report["approval"], "not_granted")
        self.assertEqual(report["receipt_hash"], hashlib.sha256(self.path.read_bytes()).hexdigest())
        self.assertEqual(report["recorded"], original["triage"])
        self.assertEqual(report["replayed"], report["recorded"])
        self.assertEqual(receipt, original)

    def test_snapshot_hash_fact_marker_and_native_boundary_tampering_preflight(self):
        variants = []
        for field, value in [("approval", "granted"), ("contract_version", True), ("extra", 1), ("kind", "other")]:
            r = copy.deepcopy(self.receipt); r[field] = value; variants.append(r)
        for field, value in [("snapshot_hash", "0" * 64), ("snapshot_json", RAW.decode() + " "),
                             ("api_get_invocations", False), ("repository_mutations", True)]:
            r = copy.deepcopy(self.receipt); r["collection"][field] = value; variants.append(r)
        r = copy.deepcopy(self.receipt); r["triage"]["evidence"]["revision"] = "0" * 40; variants.append(r)
        r = copy.deepcopy(self.receipt); r["triage"]["inputs"]["trusted_main"] = 1; variants.append(r)
        r = copy.deepcopy(self.receipt)
        r["triage"]["decision"] = {**r["triage"]["decision"], "state": "Blocked"}; variants.append(r)
        for field, value in [("request_id", "other"), ("contract_version", True), ("source_revision", "short")]:
            r = copy.deepcopy(self.receipt); r["triage"]["response"]["adapter"][field] = value; variants.append(r)
        for receipt in variants:
            with mock.patch.object(HOST, "ProjectClient", side_effect=AssertionError("No discovery/execution")):
                with self.assertRaises((HOST.ClientError, ValueError, TypeError)):
                    HOST.replay(receipt, "1" * 64, BINARY)

    def test_policy_suite_manifest_and_compiler_drift_prevents_submission(self):
        for key in ["manifest_hash", "source_revision", "suite_file_hash", "compiler"]:
            receipt = copy.deepcopy(self.receipt)
            if key == "compiler": receipt["triage"]["response"]["report"]["compiler"] = "other-compiler"
            else:
                receipt["triage"]["response"]["adapter"][key] = "0" * 64
                if key == "source_revision": receipt["triage"]["response"]["report"]["revision"] = "0" * 64
            with mock.patch.object(HOST.ProjectClient, "_exchange", side_effect=AssertionError("No submission")) as exchange:
                with self.assertRaisesRegex(HOST.ClientError, "pins differ"):
                    HOST.replay(receipt, "1" * 64, BINARY)
                exchange.assert_not_called()

    def test_native_output_or_usage_corruption_is_not_reproduced(self):
        for key, value in [("output", "forged output"), ("usage", {"attempted_cases": 0, "fuel": True, "logical_allocation_bytes": 0})]:
            receipt = copy.deepcopy(self.receipt); receipt["triage"]["response"]["report"][key] = value
            report, code = HOST.replay(receipt, "1" * 64, BINARY)
            self.assertEqual(code, 1)
            self.assertEqual(report["status"], "Mismatch")
            self.assertEqual(report["comparison"], "Changed")
        receipt = copy.deepcopy(self.receipt)
        receipt["triage"]["decision"] = {"state": "Blocked", "reason": "forged"}
        receipt["triage"]["response"]["report"]["result"]["value"] = copy.deepcopy(receipt["triage"]["decision"])
        report, code = HOST.replay(receipt, "1" * 64, BINARY)
        self.assertEqual(code, 1)
        self.assertEqual(report["status"], "Mismatch")

    def test_reproducing_blocked_pending_or_unknown_does_not_return_success(self):
        for change, expected, state in [("failure", 1, "Blocked"), ("missing", 3, "Unknown"), ("pending", 3, "Pending")]:
            data = json.loads(RAW)
            if change == "failure": data["checks"]["jobs"][0]["conclusion"] = "failure"
            if change == "missing": data["checks"] = None
            if change == "pending":
                data["checks"].update(status="in_progress", conclusion="")
                data["checks"]["jobs"][0].update(status="in_progress", conclusion="")
            receipt, _ = HOST.observation.observe(json.dumps(data).encode(), BINARY, "saved")
            report, code = HOST.replay(receipt, "1" * 64, BINARY)
            self.assertEqual(code, expected)
            self.assertEqual(report["status"], state)
            self.assertEqual(report["comparison"], "Reproduced")
            self.assertEqual(report["approval"], "not_granted")

    def test_exact_input_limit_and_wrapper_depth_are_compatible(self):
        data = json.loads(RAW); nested = "leaf"
        # Root + run + 62 lists reaches the existing 64-container limit.
        for _ in range(62): nested = [nested]
        data["checks"]["extra"] = nested
        raw = json.dumps(data).encode(); raw += b" " * (65536 - len(raw))
        receipt, _ = HOST.observation.observe(raw, BINARY, "saved")
        loaded, digest = self.save(receipt)
        report, code = HOST.replay(loaded, digest, BINARY)
        self.assertEqual(code, 0)
        self.assertEqual(report["comparison"], "Reproduced")
        self.assertEqual(loaded["collection"]["snapshot_json"].encode(), raw)

    def test_receipt_byte_unicode_duplicate_and_nesting_limits_before_native(self):
        with mock.patch.object(HOST, "ProjectClient", side_effect=AssertionError("No native")):
            for raw in [b" " * 1048577, b"\xff", b'{"contract_version":1,"contract_version":1}',
                        b'"\\ud800"', b"[1e400]", b"[" * 100 + b"0" + b"]" * 100]:
                self.path.write_bytes(raw)
                with self.assertRaises((HOST.ClientError, ValueError, UnicodeError, TypeError)):
                    receipt, digest = HOST.load(self.path)
                    HOST.replay(receipt, digest, BINARY)

    def test_runtime_error_and_unknown_cannot_be_replayed_into_observed(self):
        # Exercise real native outcomes through an isolated matching record
        # boundary, not a fabricated mocked runtime verdict.
        source = (EXAMPLE / "triage.wisp").read_text()
        records = source[:source.index("fn current_failure")]
        for state, body, code in [("Error", 'let x = 1 / 0; new Decision { state: "Observed", reason: "unreachable" }', 1),
                                  ("Unknown", "decide(evidence)", 3)]:
            folder = pathlib.Path(self.temp.name) / state; folder.mkdir()
            (folder / "triage.wisp").write_text(records + "fn decide(evidence: Evidence) -> Decision { " + body + " }\n")
            (folder / "cases.json").write_bytes((EXAMPLE / "cases.json").read_bytes())
            (folder / "project.json").write_bytes((EXAMPLE / "project.json").read_bytes())
            data, digest = HOST.triage.decode_evidence(RAW)
            saved = HOST.triage.triage(data, digest, BINARY, project=folder / "project.json")
            self.assertEqual(saved["status"], state)
            receipt = copy.deepcopy(self.receipt); receipt["triage"] = saved; receipt["status"] = state
            report, actual = HOST.replay(receipt, "1" * 64, BINARY, project=folder / "project.json")
            self.assertEqual(actual, code)
            self.assertEqual(report["status"], state)
            self.assertEqual(report["comparison"], "Reproduced")
            self.assertIsNone(report["replayed"]["decision"])

    def test_real_cli_exit_and_closed_reader(self):
        self.save(self.receipt)
        command = [sys.executable, "-B", str(EXAMPLE / "replay.py"), "--receipt", str(self.path), "--wisp", BINARY]
        p = subprocess.run(command, text=True, capture_output=True, timeout=15)
        self.assertEqual(p.returncode, 0, p.stderr)
        self.assertEqual(json.loads(p.stdout)["comparison"], "Reproduced")
        p = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE); p.stdout.close()
        try:
            self.assertEqual(p.wait(timeout=15), 2)
            self.assertNotIn(b"Exception ignored", p.stderr.read())
        finally:
            if p.poll() is None: p.kill(); p.wait()
            p.stderr.close()


if __name__ == "__main__":
    unittest.main()
