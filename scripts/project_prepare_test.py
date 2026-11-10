"""Pinned saved-body preparation without applying or executing the candidate."""
import copy
import json
import pathlib
import sys
import tempfile
import unittest
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "clients" / "python"))
import wisp_client as CLIENT
BINARY = str(ROOT / "target" / "debug" / "wisp")


class SavedPreparation(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="wisp-client-prepare-")
        self.addCleanup(self.temp.cleanup)
        self.folder = pathlib.Path(self.temp.name)
        self.source = '// café 😀\nfn f(n:Int)->Int { n }\nprint("not run");\nprobe n in 0..=1 { f(n)==n }\n'
        for name in ["a", "b"]:
            (self.folder / (name + ".wisp")).write_text(self.source)
            (self.folder / (name + ".json")).write_text('null')
        self.manifest = self.folder / "project.json"
        self.manifest.write_text(json.dumps({"version": 1, "policies": [
            {"id": n, "source": n + ".wisp", "suite": n + ".json"} for n in ["a", "b"]]}))
        self.client = CLIENT.ProjectClient(self.manifest, binary=BINARY)
        focused = self.client.focus("a", "f")
        self.function = next(f for f in focused["report"]["graph"]["functions"] if f["name"] == "f")
        self.body_hash = self.function["body_hash"]

    def test_prepared_bytes_match_core_splice_and_saved_files_stay_unchanged(self):
        before = {p.name: p.read_bytes() for p in self.folder.iterdir()}
        response = self.client.prepare_edit("a", "f", self.body_hash, " { n + 1 } ")
        report = response["report"]; span = self.function["body_span"]; raw = self.source.encode()
        self.assertEqual(report["edit"]["source"].encode(), raw[:span["start"]] + b" { n + 1 } " + raw[span["end"]:])
        self.assertEqual(response["status"], "Ready")
        self.assertFalse(response["project"]["new_execution"])
        self.assertFalse(report["new_execution"])
        self.assertNotIn("review", report)
        self.assertEqual(response["project"]["approval"], "not_granted")
        self.assertEqual(before, {p.name: p.read_bytes() for p in self.folder.iterdir()})

    def test_native_conflict_error_and_unknown_are_preserved_without_accepted_source(self):
        for body_hash, replacement, status in [("0" * 64, "{ n }", "Error"),
                (self.body_hash, '{ "wrong type" }', "Error"),
                (self.body_hash, "{" + "(" * 1000 + "n" + ")" * 1000 + "}", "Unknown")]:
            result = self.client.prepare_edit("a", "f", body_hash, replacement)
            self.assertEqual(result["status"], status)
            self.assertFalse(result["report"]["new_execution"])
            self.assertNotIn("source", result["report"].get("edit", {}))

    def test_invalid_requests_never_dispatch(self):
        for policy, function, body_hash, replacement in [("missing", "f", self.body_hash, "{n}"),
                ("a", "missing", self.body_hash, "{n}"), ("a", "f", "bad", "{n}"),
                ("a", "f", self.body_hash, True), ("a", "f", self.body_hash, "é" * 32769),
                ("a", "f", self.body_hash, "\ud800")]:
            with mock.patch.object(CLIENT, "run_cli", side_effect=AssertionError("No command")):
                with self.assertRaises(CLIENT.ClientError): self.client.prepare_edit(policy, function, body_hash, replacement)

    def test_all_policy_and_manifest_drift_is_rejected_before_candidate_exposure(self):
        for name in ["project.json", "a.wisp", "a.json", "b.wisp", "b.json"]:
            path = self.folder / name; raw = path.read_bytes(); path.write_bytes(raw + b"\n")
            with self.subTest(name=name):
                with self.assertRaises(CLIENT.ClientError): self.client.prepare_edit("a", "f", self.body_hash, "{ n+1 }")
            path.write_bytes(raw)

    def test_malformed_candidate_markers_hashes_ranges_and_audit_are_rejected(self):
        original = self.client.prepare_edit("a", "f", self.body_hash, "{ n+1 }")
        variants = []
        for section, field, value in [("project", "new_execution", True), ("project", "guard_status", "not_requested"),
                ("report", "new_execution", True), ("report", "invocation", {}), ("report", "review", {})]:
            r = copy.deepcopy(original); r[section][field] = value; variants.append(r)
        for field, value in [("candidate_revision", "0" * 64), ("base_body_hash", "0" * 64),
                ("target", "other"), ("source", "tampered"), ("candidate_body_hash", "0" * 64),
                ("insertion_range", {"start": True, "end": 1})]:
            r = copy.deepcopy(original); r["report"]["edit"][field] = value; variants.append(r)
        r = copy.deepcopy(original); r["report"]["edit"]["preservation"]["checked"] = 1; variants.append(r)
        r = copy.deepcopy(original); r["report"]["edit"]["preservation"]["probes"][0]["text_preserved"] = False; variants.append(r)
        for response in variants:
            with mock.patch.object(CLIENT, "run_cli", return_value=json.dumps(response)):
                with self.assertRaises(CLIENT.ClientError): self.client.prepare_edit("a", "f", self.body_hash, "{ n+1 }")


if __name__ == "__main__":
    unittest.main()
