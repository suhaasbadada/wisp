"""Finite reference-workflow acceptance, not an independent business oracle."""
import copy
import hashlib
import importlib.util
import json
import pathlib
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

sys.dont_write_bytecode = True
ROOT = pathlib.Path(__file__).resolve().parent.parent
EXAMPLE = ROOT / "examples" / "order-gate"
BINARY = str(ROOT / "target" / "debug" / "wisp")
SPEC = importlib.util.spec_from_file_location("order_gate", EXAMPLE / "run.py")
HOST = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(HOST)


def project(binary, *args):
    p = subprocess.run([binary, "project", *map(str, args)], capture_output=True, text=True, timeout=15)
    if p.returncode not in {0, 1, 3}:
        raise AssertionError(p.stderr)
    return p.returncode, json.loads(p.stdout)


def outcomes(report):
    rows = []
    for row in report["orders"]:
        item = {k: row[k] for k in ["id", "status", "stage", "reason"]}
        if row["status"] == "Accepted":
            item["grand_total_cents"] = row["decisions"]["shipping"]["grand_total_cents"]
        rows.append(item)
    return rows


class OrderGate(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="wisp-order-gate-")
        self.addCleanup(self.temp.cleanup)
        self.path = pathlib.Path(self.temp.name) / "candidate"
        shutil.copytree(EXAMPLE, self.path)
        self.manifest = self.path / "project.json"
        self.baseline = self.path / "project-before.json"
        self.orders = HOST.load_orders(self.path / "orders.json")

    def test_component_verification_and_composed_expectations_preserve_inputs(self):
        before = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in self.path.iterdir() if p.is_file()}
        expected = json.loads((self.path / "expected.json").read_text())
        self.assertEqual(project(BINARY, "verify", self.manifest)[0], 0)
        self.assertEqual(project(BINARY, "verify", self.baseline)[0], 1)
        report = HOST.review(BINARY, self.baseline, self.manifest, self.orders)
        self.assertEqual(report["status"], "Complete")
        self.assertEqual(report["summary"], {"changed": 2, "unchanged": 6, "unavailable": 0})
        self.assertEqual(report["component_review"]["status"], "Pass")
        self.assertEqual(report["component_review"]["project"]["summary"], {"total": 3, "attempted_invocations": 36})
        self.assertEqual(report["application_invocations"], 38)
        for side, key in [("before", "baseline"), ("after", "candidate")]:
            plan = report[side]
            self.assertEqual(outcomes(plan), expected[key])
            self.assertEqual(plan["summary"], {"total": 8, "accepted": 4, "rejected": 4, "error": 0, "unknown": 0, "submitted_requests": 19, "attempted_invocations": 19})
            self.assertEqual(plan["approval"], "not_granted")
            self.assertEqual(plan["side_effects"], "none")
        after = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in self.path.iterdir() if p.is_file()}
        self.assertEqual(before, after)

    def test_discount_shipping_cliff_is_visible_not_approved_away(self):
        r = HOST.review(BINARY, self.baseline, self.manifest, [self.orders[2]])
        before, after = r["before"]["orders"][0], r["after"]["orders"][0]
        self.assertEqual(before["decisions"]["pricing"]["total_cents"], "1045")
        self.assertEqual(after["decisions"]["pricing"]["total_cents"], "990")
        self.assertEqual(before["decisions"]["shipping"]["grand_total_cents"], "1045")
        self.assertEqual(after["decisions"]["shipping"]["grand_total_cents"], "1090")
        self.assertEqual(r["changes"][0]["comparison"], "Changed")
        self.assertEqual(r["approval"], "not_granted")

    def test_business_rejections_stop_later_stages(self):
        r = HOST.plan(BINARY, self.manifest, self.orders[4:])
        self.assertEqual([len(row["evidence"]) for row in r["orders"]], [1, 1, 2, 3])
        self.assertTrue(all(row["status"] == "Rejected" for row in r["orders"]))
        self.assertEqual(r["status"], "Complete")

    def test_typed_input_error_is_not_business_rejection_or_execution(self):
        order = copy.deepcopy(self.orders[0]); order["unit_cents"] = 100
        r = HOST.plan(BINARY, self.manifest, [order])
        row = r["orders"][0]
        self.assertEqual((r["status"], row["status"], row["stage"]), ("Error", "Error", "pricing"))
        self.assertEqual(row["evidence"][-1]["report"]["diagnostics"][0]["code"], "E_INPUT_TYPE")
        self.assertFalse(row["evidence"][-1]["adapter"]["new_execution"])
        self.assertEqual(r["summary"]["attempted_invocations"], 1)
        self.assertNotIn("shipping", row["decisions"])
        self.assertNotIn("reason", row)

    def test_numeric_tokens_reach_rust_without_float_loss_or_string_coercion(self):
        path = self.path / "numeric-orders.json"
        original = HOST.invoke
        for token in ["100", "1e400", "1e-400", "-0", "0.0", "1.0", "9" * 5000]:
            with self.subTest(token=token[:20]):
                order = {**self.orders[0], "id": "bad-number", "unit_cents": "NUMBER"}
                text = json.dumps([order, self.orders[0]]).replace('"NUMBER"', token)
                path.write_text(text)
                orders = HOST.load_orders(path)
                emitted = []
                def capture(binary, args, input_text=None, **kw):
                    if input_text is not None:
                        emitted.append(input_text)
                    return original(binary, args, input_text, **kw)
                with mock.patch.object(HOST, "invoke", side_effect=capture):
                    r = HOST.plan(BINARY, self.manifest, orders)
                self.assertEqual(r["status"], "Error")
                self.assertEqual([row["status"] for row in r["orders"]], ["Error", "Accepted"])
                row = r["orders"][0]
                self.assertEqual(row["stage"], "pricing")
                self.assertEqual(row["evidence"][-1]["report"]["diagnostics"][0]["code"], "E_INPUT_TYPE")
                self.assertFalse(row["evidence"][-1]["adapter"]["new_execution"])
                self.assertTrue(any('"unit_cents":' + token in raw for raw in emitted))
        # The real CLI also retains mixed-order evidence, rather than aborting.
        path.write_text(json.dumps([{**self.orders[0], "id": "bad-number", "unit_cents": "NUMBER"}, self.orders[0]]).replace('"NUMBER"', '1e400'))
        result = subprocess.run([sys.executable, "-B", str(EXAMPLE / "run.py"), "--wisp", BINARY,
                                 "--project", str(self.manifest), "--orders", str(path)],
                                capture_output=True, text=True, timeout=60)
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertEqual([row["status"] for row in json.loads(result.stdout)["orders"]], ["Error", "Accepted"])

    def test_overflow_remains_error_while_other_orders_continue(self):
        order = copy.deepcopy(self.orders[0]); order["id"] = "overflow"; order["quantity"] = "2"; order["unit_cents"] = "9223372036854775807"
        r = HOST.plan(BINARY, self.manifest, [order, self.orders[0]])
        self.assertEqual(r["status"], "Error")
        self.assertEqual([row["status"] for row in r["orders"]], ["Error", "Accepted"])
        self.assertEqual(r["orders"][0]["evidence"][-1]["report"]["diagnostics"][0]["code"], "E_INT_OVERFLOW")
        self.assertNotIn("shipping", r["orders"][0]["decisions"])

    def test_unknown_runtime_input_is_unavailable_despite_passing_component_cases(self):
        path = self.path / "pricing.wisp"
        text = path.read_text(); start = text.index("fn decide"); body = text.index("{", start)
        path.write_text(text[:body + 1] + " if input.quantity == 2 { decide(input) } else { " + text[body + 1:] + " }")
        r = HOST.review(BINARY, self.baseline, self.manifest, self.orders)
        self.assertEqual(r["component_review"]["status"], "Pass")
        self.assertEqual(r["status"], "Unknown")
        self.assertEqual(r["summary"]["unavailable"], 1)
        remote = next(row for row in r["after"]["orders"] if row["id"] == "remote")
        self.assertEqual(remote["status"], "Unknown")
        self.assertNotIn("shipping", remote["decisions"])
        self.assertNotIn("reason", remote)
        self.assertEqual(len(remote["evidence"]), 2)

    def test_output_only_runtime_difference_remains_visible(self):
        path = self.path / "pricing.wisp"; text = path.read_text()
        body = text.index("{", text.index("fn decide"))
        path.write_text(text[:body + 1] + ' if input.quantity == 2 { print("audit"); } else { }; ' + text[body + 1:])
        r = HOST.review(BINARY, self.baseline, self.manifest, [self.orders[3]])
        self.assertEqual(r["component_review"]["status"], "Pass")
        self.assertEqual(r["status"], "Complete")
        self.assertEqual(r["changes"][0]["comparison"], "Changed")
        self.assertEqual(r["before"]["orders"][0]["decisions"], r["after"]["orders"][0]["decisions"])
        self.assertEqual(r["after"]["orders"][0]["evidence"][1]["report"]["output"], "audit\n")

    def test_final_stage_overflow_cannot_become_accepted(self):
        order = {**self.orders[0], "quantity": "1", "unit_cents": "9223372036854775807", "zone": "remote"}
        r = HOST.plan(BINARY, self.manifest, [order])
        self.assertEqual(r["status"], "Error")
        self.assertEqual((r["orders"][0]["status"], r["orders"][0]["stage"]), ("Error", "shipping"))
        self.assertNotIn("shipping", r["orders"][0]["decisions"])
        self.assertEqual(len(r["orders"][0]["evidence"]), 3)

    def test_maximum_order_batch_runs_at_most_96_fresh_calls(self):
        orders = [{**self.orders[0], "id": f"order-{i}"} for i in range(32)]
        r = HOST.plan(BINARY, self.manifest, orders)
        self.assertEqual(r["summary"]["accepted"], 32)
        self.assertEqual(r["summary"]["submitted_requests"], 96)
        self.assertEqual(r["summary"]["attempted_invocations"], 96)

    def test_suite_drift_blocks_component_gate_before_any_invocation(self):
        baseline = pathlib.Path(self.temp.name) / "baseline"
        shutil.copytree(self.path, baseline)
        suite = self.path / "pricing-cases.json"; suite.write_bytes(suite.read_bytes() + b"\n")
        r = HOST.review(BINARY, baseline / "project-before.json", self.manifest, self.orders)
        self.assertEqual(r["phase"], "component_gate")
        self.assertEqual(r["status"], "Error")
        self.assertEqual(r["application_invocations"], 0)
        self.assertFalse(r["component_review"]["project"]["new_execution"])
        self.assertNotIn("before", r)

    def test_component_mismatch_is_retained_and_not_rewritten(self):
        path = self.path / "pricing-cases.json"; suite = json.loads(path.read_text())
        suite["cases"][0]["expect"]["result"]["value"]["total_cents"] = "999"
        path.write_text(json.dumps(suite)); saved = path.read_bytes()
        r = HOST.review(BINARY, self.baseline, self.manifest, self.orders)
        self.assertEqual(r["status"], "Fail")
        self.assertEqual(r["application_invocations"], 0)
        self.assertEqual(path.read_bytes(), saved)

    def test_manifest_source_and_suite_changes_after_discovery_are_not_adopted(self):
        original = HOST.invoke
        for name in ["project.json", "pricing.wisp", "pricing-cases.json"]:
            with self.subTest(name=name):
                path = self.path / name; saved = path.read_bytes(); changed = False
                def race(binary, args, *a, **kw):
                    nonlocal changed
                    value = original(binary, args, *a, **kw)
                    if args[:2] == ["project", "describe"] and not changed:
                        path.write_bytes(saved + b"\n"); changed = True
                    return value
                with mock.patch.object(HOST, "invoke", side_effect=race):
                    with self.assertRaises(HOST.HostError):
                        HOST.plan(BINARY, self.manifest, self.orders)
                path.write_bytes(saved)

    def test_checked_review_revisions_are_required_before_composed_calls(self):
        original = HOST.invoke; serves = []
        def race(binary, args, *a, **kw):
            value = original(binary, args, *a, **kw)
            if args[:2] == ["project", "review"]:
                path = self.path / "pricing.wisp"; path.write_bytes(path.read_bytes() + b"\n")
            if args[:2] == ["project", "serve"]:
                serves.append(args)
            return value
        with mock.patch.object(HOST, "invoke", side_effect=race):
            with self.assertRaises(HOST.HostError):
                HOST.review(BINARY, self.baseline, self.manifest, self.orders)
        self.assertEqual(serves, [])

    def test_order_envelopes_and_bounds_fail_before_wisp(self):
        path = self.path / "bad-orders.json"
        bad = ["[]", "null", "[{}]", '[{"id":"a","id":"b"}]', "[NaN]", "[Infinity]", " " * 65537,
               json.dumps([self.orders[0], self.orders[0]]),
               json.dumps([{**self.orders[0], "extra": 1}]),
               json.dumps([{**self.orders[0], "id": "é"}]),
               json.dumps([{**self.orders[0], "id": str(i)} for i in range(33)])]
        for text in bad:
            path.write_text(text)
            with self.assertRaises((HOST.HostError, ValueError)):
                HOST.load_orders(path)
        path.write_bytes(b"\xff")
        with self.assertRaises(UnicodeError):
            HOST.load_orders(path)

    def test_cli_json_and_exit_states_are_separate_from_business_acceptance(self):
        command = [sys.executable, "-B", str(EXAMPLE / "run.py"), "--wisp", BINARY, "--project", str(self.manifest)]
        result = subprocess.run(command, capture_output=True, text=True, timeout=60)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)["summary"]["rejected"], 4)
        path = self.path / "invalid.json"; path.write_text("[]")
        result = subprocess.run([*command, "--orders", str(path)], capture_output=True, text=True, timeout=15)
        self.assertEqual(result.returncode, 2); self.assertEqual(result.stdout, "")
        order = {**self.orders[0], "unit_cents": 100}; path.write_text(json.dumps([order]))
        result = subprocess.run([*command, "--orders", str(path)], capture_output=True, text=True, timeout=60)
        self.assertEqual(result.returncode, 1); self.assertEqual(json.loads(result.stdout)["status"], "Error")


if __name__ == "__main__":
    unittest.main()
