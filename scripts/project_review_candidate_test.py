"""Exact saved-baseline review without changing expectations or applying code."""
import copy
import hashlib
import json
import pathlib
import sys
import tempfile
import unittest
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "clients/python"))
import wisp_client as CLIENT
BINARY = str(ROOT / "target/debug/wisp")


def digest(source):
    return hashlib.sha256(source.encode()).hexdigest()


class SavedCandidateReview(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory(prefix="wisp-client-candidate-")
        self.addCleanup(temp.cleanup); self.folder = pathlib.Path(temp.name)
        self.base = '// café 😀\nfn f(n:Int)->Int{n+1} print("never run");'
        for name in ["a", "b"]: (self.folder / (name + ".wisp")).write_text(self.base)
        self.suite = '{"version":1,"target":"f","cases":[{"id":"one","args":["2"],"expect":{"result":{"type":"Int","value":"2"},"output":""}}]}'
        (self.folder / "cases.json").write_text(self.suite)
        manifest = self.folder / "project.json"
        manifest.write_text(json.dumps({"version": 1, "policies": [
            {"id": n, "source": n + ".wisp", "suite": "cases.json"} for n in ["a", "b"]]}))
        self.client = CLIENT.ProjectClient(manifest, binary=BINARY)
        focus = self.client.focus("a", "f")
        body = next(f["body_hash"] for f in focus["report"]["graph"]["functions"] if f["name"] == "f")
        self.prepared = self.client.prepare_edit("a", "f", body, "{n}")["report"]["edit"]

    def test_prepared_candidate_passes_saved_requirements_without_application(self):
        before = {p.name: p.read_bytes() for p in self.folder.iterdir()}
        edit = self.prepared
        response = self.client.review_candidate("a", edit["source"], edit["candidate_revision"])
        self.assertEqual(response["status"], "Pass")
        self.assertTrue(response["project"]["new_execution"])
        review = response["report"]["review"]
        self.assertEqual(review["baseline_revision"], digest(self.base))
        self.assertEqual(review["candidate_revision"], edit["candidate_revision"])
        self.assertEqual(review["cases"][0]["before"]["result"]["value"], "3")
        self.assertEqual(review["cases"][0]["after"]["result"]["value"], "2")
        self.assertEqual(review["summary"]["changed"], 1)
        self.assertEqual(review["approval"], "not_granted")
        # Preserve saved suite tokens/whitespace; decoding/re-encoding it would
        # deliberately change the core suite/query identities being compared.
        request = '{"op":"review","source":' + json.dumps(self.base) + ',"candidate":' + json.dumps(edit["source"]) + ',"suite":' + self.suite + '}'
        expected = json.loads(CLIENT.run_cli(BINARY, ["--json"], input_text=request))
        self.assertEqual(response["report"], expected)
        self.assertEqual(before, {p.name: p.read_bytes() for p in self.folder.iterdir()})
        self.assertEqual(self.client.verify("a")["status"], "Fail")

    def test_fail_error_unknown_and_preflight_preserved(self):
        for source, status, executed in [("fn f(n:Int)->Int{n+2}", "Fail", True),
                ("fn f(n:Int)->Int{n/0}", "Error", True), ("fn f(n:Int)->Int{f(n)}", "Unknown", True),
                ("fn f(", "Error", False)]:
            r = self.client.review_candidate("a", source, digest(source))
            self.assertEqual(r["status"], status)
            self.assertEqual(r["project"]["new_execution"], executed)
            self.assertEqual(r["project"]["approval"], "not_granted")

    def test_bad_candidate_identity_and_targets_never_dispatch(self):
        for policy, candidate, revision in [("missing", "x", digest("x")), ("a", True, "0" * 64),
                ("a", "x", "bad"), ("a", "x", "0" * 64), ("a", "é" * 32769, digest("é" * 32769)),
                ("a", "\ud800", "0" * 64)]:
            with mock.patch.object(CLIENT, "run_cli", side_effect=AssertionError("No native command")):
                with self.assertRaises(CLIENT.ClientError): self.client.review_candidate(policy, candidate, revision)

    def test_all_saved_pin_drift_refuses_result_exposure(self):
        for name in ["project.json", "a.wisp", "b.wisp", "cases.json"]:
            path = self.folder / name; raw = path.read_bytes(); path.write_bytes(raw + b"\n")
            with self.subTest(name=name):
                with self.assertRaises(CLIENT.ClientError):
                    self.client.review_candidate("a", self.prepared["source"], self.prepared["candidate_revision"])
            path.write_bytes(raw)

    def test_malformed_identities_and_execution_ledgers_rejected(self):
        candidate = self.prepared["source"]; revision = self.prepared["candidate_revision"]
        original = self.client.review_candidate("a", candidate, revision)
        variants = []
        for section, field, value in [("project", "candidate_revision", "0" * 64), ("project", "source_revision", revision),
                ("project", "new_execution", False), ("report", "revision", revision)]:
            r = copy.deepcopy(original); r[section][field] = value; variants.append(r)
        for field, value in [("baseline_revision", revision), ("candidate_revision", digest(self.base)),
                             ("approval", "granted"), ("new_execution", 1)]:
            r = copy.deepcopy(original); r["report"]["review"][field] = value; variants.append(r)
        r = copy.deepcopy(original); r["report"]["review"]["summary"]["attempted_invocations"] = 0; variants.append(r)
        for r in variants:
            with mock.patch.object(CLIENT, "run_cli", return_value=json.dumps(r)):
                with self.assertRaises(CLIENT.ClientError): self.client.review_candidate("a", candidate, revision)


if __name__ == "__main__": unittest.main()
