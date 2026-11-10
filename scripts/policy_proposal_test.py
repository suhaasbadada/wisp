"""Bounded operator orchestration over the actual pinned native project client."""
import contextlib
import hashlib
import importlib.util
import io
import json
import pathlib
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "clients/python"))
import wisp_client as CLIENT

SPEC = importlib.util.spec_from_file_location("policy_propose", ROOT / "examples/policies/propose.py")
PROPOSE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PROPOSE)
BINARY = str(ROOT / "target/debug/wisp")


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


class PolicyProposal(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory(prefix="wisp-proposal-")
        self.addCleanup(temp.cleanup)
        self.folder = pathlib.Path(temp.name)
        self.source = '// café 😀\nfn f(n:Int)->Int{n+1} print("never run");'
        (self.folder / "a.wisp").write_text(self.source, encoding="utf-8")
        (self.folder / "cases.json").write_text('{"version":1,"target":"f","cases":[{"id":"one","args":["2"],"expect":{"result":{"type":"Int","value":"2"},"output":""}}]}')
        self.manifest = self.folder / "project.json"
        self.manifest.write_text('{"version":1,"policies":[{"id":"a","source":"a.wisp","suite":"cases.json"}]}')
        description = CLIENT.ProjectClient(self.manifest, binary=BINARY).description["project"]
        policy = description["policies"][0]
        self.guard = {"policy_id": "a", "manifest_hash": description["manifest_hash"],
                      "source_revision": policy["report"]["revision"],
                      "suite_file_hash": policy["suite_file_hash"], "compiler": policy["report"]["compiler"]}
        self.guard_path = self.folder / "guard.json"
        self.guard_path.write_text(json.dumps(self.guard))
        self.body = self.folder / "body.txt"
        self.body.write_text("{n}")
        self.argv = ["--project", str(self.manifest), "--policy", "a", "--function", "f",
                     "--expected-guard-file", str(self.guard_path), "--replacement-file", str(self.body), "--wisp", BINARY]

    def invoke(self, argv=None):
        output, errors = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(output), contextlib.redirect_stderr(errors):
            code = PROPOSE.main(self.argv if argv is None else argv)
        return code, output.getvalue(), errors.getvalue()

    def snapshot(self):
        return {p.name: p.read_bytes() for p in self.folder.iterdir()}

    def test_pass_exact_candidate_pins_and_native_lifecycle_without_writes(self):
        before = self.snapshot()
        calls = []
        original = CLIENT.run_cli

        def traced(binary, args, **kwargs):
            calls.append((args, kwargs))
            return original(binary, args, **kwargs)

        with mock.patch.object(CLIENT, "run_cli", side_effect=traced):
            code, output, errors = self.invoke()
        self.assertEqual((code, errors), (0, ""))
        self.assertTrue(output.isascii())
        self.assertEqual(len(output.splitlines()), 1)
        r = CLIENT.decode_json(output)
        self.assertEqual((r["contract_version"], r["mode"], r["phase"], r["status"]), (1, "proposal", "reviewed", "Pass"))
        self.assertEqual(r["expected_guard"], self.guard)
        self.assertEqual(r["approval"], "not_granted")
        self.assertIs(r["applied"], False)
        self.assertEqual([c[0][1] for c in calls], ["describe", "focus", "prepare-edit", "review-candidate"])
        for args, _ in calls[1:]:
            for flag, key in [("--expected-manifest", "manifest_hash"), ("--expected-revision", "source_revision"),
                              ("--expected-suite", "suite_file_hash"), ("--expected-compiler", "compiler")]:
                self.assertEqual(args[args.index(flag) + 1], self.guard[key])
        focus = r["context"]
        self.assertEqual(focus["status"], "Ready")
        self.assertEqual(focus["report"]["agent_view"]["budget_bytes"], 4096)
        self.assertFalse(focus["project"]["new_execution"])
        edit = r["preparation"]["report"]["edit"]
        self.assertFalse(r["preparation"]["project"]["new_execution"])
        function = next(f for f in focus["report"]["graph"]["functions"] if f["name"] == "f")
        self.assertEqual(edit["base_body_hash"], function["body_hash"])
        span = function["body_span"]
        raw = self.source.encode()
        self.assertEqual(edit["source"].encode(), raw[:span["start"]] + self.body.read_bytes() + raw[span["end"]:])
        self.assertEqual(edit["candidate_revision"], digest(edit["source"].encode()))
        self.assertEqual(calls[-1][1]["input_text"], edit["source"])
        self.assertEqual(calls[-1][0][calls[-1][0].index("--expected-candidate") + 1], edit["candidate_revision"])
        review = r["review"]["report"]["review"]
        self.assertEqual(review["baseline_revision"], digest(raw))
        self.assertEqual(review["candidate_revision"], edit["candidate_revision"])
        self.assertTrue(review["new_execution"])
        self.assertEqual(review["summary"]["attempted_invocations"], 2)
        self.assertEqual(review["cases"][0]["before"]["result"]["value"], "3")
        self.assertEqual(review["cases"][0]["after"]["result"]["value"], "2")
        self.assertEqual(self.snapshot(), before)

    def test_review_fail_runtime_error_unknown_preserve_attempts(self):
        for body, status, code in [("{n+2}", "Fail", 1), ("{n/0}", "Error", 1), ("{f(n)}", "Unknown", 3)]:
            with self.subTest(status=status):
                self.body.write_text(body)
                before = self.snapshot()
                actual, output, errors = self.invoke()
                r = json.loads(output)
                self.assertEqual((actual, r["status"], r["phase"], errors), (code, status, "reviewed", ""))
                self.assertEqual(r["preparation"]["status"], "Ready")
                self.assertEqual(r["review"]["report"]["review"]["summary"]["attempted_invocations"], 2)
                self.assertEqual(self.snapshot(), before)

    def test_preparation_error_unknown_do_not_review(self):
        for body, status, code in [('{"wrong"}', "Error", 1), ("{" + "(" * 1000 + "n" + ")" * 1000 + "}", "Unknown", 3)]:
            self.body.write_text(body)
            with mock.patch.object(CLIENT.ProjectClient, "review_candidate", side_effect=AssertionError("No review")):
                actual, output, errors = self.invoke()
            r = json.loads(output)
            self.assertEqual((actual, r["status"], r["phase"], errors), (code, status, "preparation_rejected", ""))
            self.assertIsNone(r["review"])
            self.assertFalse(r["preparation"]["project"]["new_execution"])
            self.assertNotIn("source", r["preparation"]["report"].get("edit", {}))

    def test_received_context_error_unknown_before_replacement_io(self):
        # Inject protocol-valid nonexecuting responses at the existing client
        # transport boundary; no language implementation or timing assumption.
        original = CLIENT.run_cli
        self.body.unlink()
        for status, code in [("Error", 1), ("Unknown", 3)]:
            def response(binary, args, **kwargs):
                raw = original(binary, args, **kwargs)
                if args[1] == "focus":
                    r = json.loads(raw)
                    r["status"] = r["report"]["status"] = status
                    r["report"].pop("agent_view", None)
                    return json.dumps(r)
                return raw
            with mock.patch.object(CLIENT, "run_cli", side_effect=response):
                actual, output, errors = self.invoke()
            r = json.loads(output)
            self.assertEqual((actual, r["status"], r["phase"], errors), (code, status, "context_rejected", ""))
            self.assertIsNone(r["preparation"])
            self.assertIsNone(r["review"])

    def test_every_authored_guard_mismatch_before_focus_and_missing_body(self):
        self.body.unlink()
        for key in self.guard:
            guard = dict(self.guard)
            guard[key] = "other" if key in ["policy_id", "compiler"] else "0" * 64
            self.guard_path.write_text(json.dumps(guard))
            with mock.patch.object(CLIENT.ProjectClient, "focus", side_effect=AssertionError("No focus")):
                code, output, errors = self.invoke()
            self.assertEqual((code, output), (2, ""), key)
            self.assertEqual(errors, "Proposal host error; outcome unresolved (execution may have occurred).\n")
            self.assertEqual(json.loads(self.guard_path.read_text()), guard)

    def test_bad_guard_schema_codec_caps_before_native(self):
        variants = ["null", "{}", "[]", '{"policy_id":"a","policy_id":"a"}',
                    json.dumps(dict(self.guard, extra=True)), json.dumps(dict(self.guard, compiler="")),
                    json.dumps(dict(self.guard, policy_id="é")), json.dumps(dict(self.guard, source_revision="A" * 64)),
                    json.dumps(dict(self.guard, compiler="\ud800")), "[" * 65 + "0" + "]" * 65,
                    " " * 16385, b"\xff"]
        for value in variants:
            self.guard_path.write_bytes(value if isinstance(value, bytes) else value.encode())
            with mock.patch.object(PROPOSE, "ProjectClient", side_effect=AssertionError("No native IO")):
                code, output, _ = self.invoke()
            self.assertEqual((code, output), (2, ""))

    def test_bad_duplicate_override_flags_and_budget_before_io(self):
        variants = [self.argv + tail for tail in [["--budget", "-1"], ["--budget", "65537"], ["--budget", "1.0"],
                    ["--policy", "a"], ["--budget", "0", "--budget", "1"], ["--expected-result", "2"],
                    ["--output", "out.json"], ["--source", "x"], ["--refresh", "true"], ["--apply"], ["--wisp=" + BINARY]]]
        variants += [[], self.argv[:-1]]
        for argv in variants:
            with mock.patch.object(PROPOSE, "read_text", side_effect=AssertionError("No file IO")):
                code, output, _ = self.invoke(argv)
            self.assertEqual((code, output), (2, ""))

    def test_replacement_byte_cap_utf8_and_budget_endpoints(self):
        for raw in [b"\xff", "é".encode() * 32769]:
            self.body.write_bytes(raw)
            with mock.patch.object(CLIENT.ProjectClient, "prepare_edit", side_effect=AssertionError("No preparation")):
                code, output, _ = self.invoke()
            self.assertEqual((code, output), (2, ""))
        self.body.write_text("{n}")
        for budget in [0, 65536]:
            code, output, _ = self.invoke(self.argv + ["--budget", str(budget)])
            r = json.loads(output)
            self.assertEqual(code, 0)
            self.assertEqual(r["context"]["report"]["agent_view"]["budget_bytes"], budget)

    def test_pin_drift_after_focus_never_reviews(self):
        original = PROPOSE.read_text
        def drift(path, limit):
            text = original(path, limit)
            if pathlib.Path(path) == self.body:
                with (self.folder / "cases.json").open("a") as stream:
                    stream.write("\n")
            return text
        with mock.patch.object(PROPOSE, "read_text", side_effect=drift), mock.patch.object(
                CLIENT.ProjectClient, "review_candidate", side_effect=AssertionError("No review")):
            code, output, _ = self.invoke()
        self.assertEqual((code, output), (2, ""))

    def test_saved_input_drift_before_discovery_never_adopts_fresh_pins(self):
        self.body.unlink()
        frozen = self.guard_path.read_bytes()
        for name in ["project.json", "a.wisp", "cases.json"]:
            path = self.folder / name
            raw = path.read_bytes()
            path.write_bytes(raw + b"\n")
            with mock.patch.object(CLIENT.ProjectClient, "focus", side_effect=AssertionError("No focus")):
                code, output, _ = self.invoke()
            self.assertEqual((code, output), (2, ""), name)
            self.assertEqual(self.guard_path.read_bytes(), frozen)
            path.write_bytes(raw)

    def test_lost_review_or_closed_stdout_is_generic_unresolved_not_success(self):
        native = CLIENT.run_cli
        attempts = []
        def lost(binary, args, **kwargs):
            value = native(binary, args, **kwargs)
            if args[1] == "review-candidate":
                attempts.append(json.loads(value)["report"]["review"]["summary"]["attempted_invocations"])
                raise CLIENT.ClientError("captured-secret/environment/guard-file-contents")
            return value
        with mock.patch.object(CLIENT, "run_cli", side_effect=lost):
            code, output, errors = self.invoke()
        self.assertEqual((code, output, attempts), (2, "", [2]))
        self.assertNotIn("captured-secret", errors)
        self.assertIn("unresolved", errors)
        broken = mock.Mock()
        broken.write.side_effect = BrokenPipeError("captured-secret")
        stderr = io.StringIO()
        with contextlib.redirect_stdout(broken), contextlib.redirect_stderr(stderr):
            self.assertEqual(PROPOSE.main(self.argv), 2)
        broken.close.assert_called_once()
        self.assertNotIn("captured-secret", stderr.getvalue())

    def test_public_frozen_demo_cli_and_original_fixture_hashes(self):
        folder = ROOT / "examples/policies"
        before = {p.name: digest(p.read_bytes()) for p in folder.iterdir() if p.is_file()}
        command = [sys.executable, "-B", str(folder / "propose.py"), "--project", str(folder / "project-before.json"),
                   "--policy", "reservations", "--function", "decide", "--expected-guard-file", str(folder / "maintenance.guard.json"),
                   "--replacement-file", str(folder / "maintenance.body.txt")]
        response = subprocess.run(command, capture_output=True, text=True, timeout=60)
        self.assertEqual((response.returncode, response.stderr), (0, ""))
        r = json.loads(response.stdout)
        self.assertEqual(r["status"], "Pass")
        self.assertEqual(r["context"]["status"], "Ready")
        self.assertEqual(r["preparation"]["status"], "Ready")
        self.assertEqual(r["review"]["status"], "Pass")
        self.assertEqual(r["approval"], "not_granted")
        self.assertFalse(r["applied"])
        summary = r["review"]["report"]["review"]["summary"]
        self.assertEqual((summary["expectation_pass"], summary["changed"], summary["attempted_invocations"]), (7, 2, 14))
        self.assertEqual(before, {p.name: digest(p.read_bytes()) for p in folder.iterdir() if p.is_file()})


if __name__ == "__main__":
    unittest.main()
