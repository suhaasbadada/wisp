"""End-to-end operator command checks; all test capture traffic is mocked."""
import contextlib
import hashlib
import importlib.util
import io
import json
import pathlib
import subprocess
import sys
import unittest
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[1]
EXAMPLE = ROOT / "examples" / "release-triage"
BINARY = str(ROOT / "target" / "debug" / "wisp")
spec = importlib.util.spec_from_file_location("release_observe", EXAMPLE / "observe.py")
HOST = importlib.util.module_from_spec(spec); spec.loader.exec_module(HOST)
RAW = (EXAMPLE / "pr16-merge.json").read_bytes()


class ReleaseObserve(unittest.TestCase):
    def command(self, args):
        out = io.StringIO(); err = io.StringIO()
        with mock.patch.object(sys, "argv", ["observe.py", *args]), contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = HOST.main()
        return code, out.getvalue(), err.getvalue()

    def test_saved_receipt_preserves_exact_bytes_hash_pins_and_no_network(self):
        raw = RAW + b" \n\t"
        with mock.patch.object(HOST.capture_host, "api", side_effect=AssertionError("Offline mode")):
            receipt, code = HOST.observe(raw, BINARY, "saved")
        self.assertEqual(code, 0)
        self.assertEqual(receipt["kind"], "wisp-workflow-observation")
        self.assertEqual(receipt["collection"]["snapshot_json"].encode("utf-8"), raw)
        digest = hashlib.sha256(raw).hexdigest()
        self.assertEqual(receipt["collection"]["snapshot_hash"], digest)
        self.assertEqual(receipt["triage"]["evidence_hash"], digest)
        self.assertEqual(receipt["collection"]["api_get_invocations"], 0)
        self.assertEqual(receipt["triage"]["decision"]["state"], "Observed")
        self.assertEqual(receipt["triage"]["response"]["adapter"]["policy_id"], "release")
        self.assertEqual(receipt["approval"], "not_granted")

    def test_live_command_joins_explicit_capture_and_native_triage(self):
        args = ["--revision", "ae1d71f8cc0d7804570f1982e323259524955c84", "--checks-run", "42765846556",
                "--checks-attempt", "1", "--pages-run", "42765846687", "--pages-attempt", "1", "--wisp", BINARY]
        with mock.patch.object(HOST.capture_host, "capture", return_value=RAW.decode("utf-8")) as capture:
            code, out, err = self.command(args)
        self.assertEqual(code, 0, err)
        capture.assert_called_once_with("ae1d71f8cc0d7804570f1982e323259524955c84", 42765846556, 1, 42765846687, 1)
        self.assertEqual(json.loads(out)["collection"]["mode"], "github-explicit-attempt")
        self.assertEqual(json.loads(out)["collection"]["api_get_invocations"], 6)

    def test_capture_failure_prevents_native_execution_and_receipt(self):
        args = ["--revision", "0" * 40, "--checks-run", "1", "--checks-attempt", "1",
                "--pages-run", "2", "--pages-attempt", "1"]
        with mock.patch.object(HOST.capture_host, "capture", side_effect=HOST.ClientError("changed attempt")), mock.patch.object(
                HOST.triage, "ProjectClient", side_effect=AssertionError("No native execution")) as client:
            code, out, err = self.command(args)
        self.assertEqual(code, 2); self.assertEqual(out, ""); self.assertIn("changed attempt", err)
        client.assert_not_called()

    def test_incompatible_or_incomplete_selection_is_rejected_before_work(self):
        for args in [["--evidence", "file", "--checks-run", "1"], ["--revision", "0" * 40],
                     ["--evidence", "file", "--revision", "0" * 40]]:
            with mock.patch.object(HOST.capture_host, "capture", side_effect=AssertionError("No capture")), mock.patch.object(
                    HOST.triage, "ProjectClient", side_effect=AssertionError("No execution")):
                with self.assertRaises(SystemExit) as error: self.command(args)
                self.assertEqual(error.exception.code, 2)

    def test_business_and_runtime_incomplete_outcomes_do_not_become_observed(self):
        for change, expected, state in [("missing", 3, "Unknown"), ("failure", 1, "Blocked"), ("pending", 3, "Pending")]:
            data = json.loads(RAW)
            if change == "missing": data["checks"] = None
            if change == "failure": data["checks"]["jobs"][0]["conclusion"] = "failure"
            if change == "pending":
                data["checks"].update(status="in_progress", conclusion="")
                data["checks"]["jobs"][0].update(status="in_progress", conclusion="")
            receipt, code = HOST.observe(json.dumps(data).encode(), BINARY, "saved")
            self.assertEqual(code, expected)
            self.assertEqual(receipt["triage"]["decision"]["state"], state)
            self.assertEqual(receipt["status"], "Complete")
        for status, code in [("Error", 1), ("Unknown", 3)]:
            with mock.patch.object(HOST.triage, "triage", return_value={"status": status, "decision": None}):
                receipt, actual = HOST.observe(RAW, BINARY, "saved")
            self.assertEqual(actual, code)
            self.assertIsNone(receipt["triage"]["decision"])
            self.assertEqual(receipt["collection"]["snapshot_json"], RAW.decode())

    def test_malformed_input_rejected_before_native_and_unicode_ascii_safe(self):
        with mock.patch.object(HOST.triage, "ProjectClient", side_effect=AssertionError("No execution")):
            for raw in [b" " * 65537, b"\xff", b"{}"]:
                with self.assertRaises((HOST.ClientError, ValueError, UnicodeError)): HOST.observe(raw, BINARY, "saved")
        data = json.loads(RAW); data["checks"]["extra"] = "é\u2028😀"
        receipt, _ = HOST.observe(json.dumps(data, ensure_ascii=False).encode("utf-8"), BINARY, "saved")
        encoded = HOST.encode_json(receipt, ascii_strings=True)
        self.assertTrue(encoded.isascii())
        self.assertEqual(json.loads(encoded)["triage"]["evidence"]["checks"]["extra"], "é\u2028😀")

    def test_real_cli_and_closed_reader_exit_contract(self):
        command = [sys.executable, "-B", str(EXAMPLE / "observe.py"), "--evidence", str(EXAMPLE / "pr16-merge.json"), "--wisp", BINARY]
        p = subprocess.run(command, text=True, capture_output=True, timeout=15)
        self.assertEqual(p.returncode, 0, p.stderr)
        self.assertEqual(json.loads(p.stdout)["triage"]["decision"]["state"], "Observed")
        p = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        p.stdout.close()
        try:
            self.assertEqual(p.wait(timeout=15), 2)
            self.assertNotIn(b"Exception ignored", p.stderr.read())
        finally:
            if p.poll() is None: p.kill(); p.wait()
            p.stderr.close()


if __name__ == "__main__":
    unittest.main()
