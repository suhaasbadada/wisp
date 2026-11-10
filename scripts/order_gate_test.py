"""Finite reference-workflow acceptance, not an independent business oracle."""
import copy
import hashlib
import importlib.util
import json
import os
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

    def test_exact_composed_expectations_pass_without_approving_the_tradeoff(self):
        path = self.path / "observed.expect.json"; saved = path.read_bytes()
        expected, digest = HOST.load_expectations(path, self.orders)
        workflow = HOST.review(BINARY, self.baseline, self.manifest, self.orders)
        r = HOST.check_expectations(workflow, expected, digest, "order-hash")
        self.assertEqual(r["status"], "Pass")
        self.assertEqual(r["expectation"]["summary"], {"total": 8, "pass": 8, "fail": 0, "error": 0, "unknown": 0})
        self.assertEqual(r["expectation"]["document"], "candidate")
        self.assertEqual(r["expectation"]["expected_hash"], hashlib.sha256(saved).hexdigest())
        self.assertEqual(r["approval"], "not_granted")
        self.assertEqual(r["workflow"]["after"]["orders"][2]["decisions"]["shipping"]["grand_total_cents"], "1090")
        self.assertEqual(path.read_bytes(), saved)

    def test_proposed_requirement_blocks_even_when_component_cases_pass(self):
        orders = HOST.load_orders(self.path / "bulk-orders.json")
        path = self.path / "proposed-free-shipping.expect.json"; saved = path.read_bytes()
        expected, digest = HOST.load_expectations(path, orders)
        workflow = HOST.review(BINARY, self.baseline, self.manifest, orders)
        r = HOST.check_expectations(workflow, expected, digest, "order-hash")
        self.assertEqual(workflow["component_review"]["status"], "Pass")
        self.assertEqual(workflow["status"], "Complete")
        self.assertEqual(r["status"], "Fail")
        self.assertEqual(r["expectation"]["summary"]["fail"], 2)
        for row in r["expectation"]["cases"]:
            self.assertEqual(row["mismatch_paths"], ["/decisions/shipping/fee_cents", "/decisions/shipping/grand_total_cents"])
        self.assertEqual(path.read_bytes(), saved)

    def test_expectation_case_coverage_schema_and_duplicates_preflight_without_wisp(self):
        path = self.path / "bad.expect.json"
        original = json.loads((self.path / "observed.expect.json").read_text())
        variants = ["{}", "null", "[]", '{"version":1,"ver\\u0073ion":1,"orders":[]}', " " * 65537]
        for version in [True, 1.0, 0, "1"]:
            variants.append(json.dumps({**original, "version": version}))
        variants.append(json.dumps({**original, "extra": 1}))
        variants.append(json.dumps({**original, "orders": original["orders"][:-1]}))
        variants.append(json.dumps({**original, "orders": [original["orders"][0]] * 8}))
        for mutation in ["Unknown", "missing-output", "partial-decisions", "foreign-id", "unknown-member"]:
            value = copy.deepcopy(original)
            if mutation == "Unknown": value["orders"][0]["expect"]["status"] = "Unknown"
            elif mutation == "missing-output": del value["orders"][0]["expect"]["outputs"]
            elif mutation == "partial-decisions": del value["orders"][0]["expect"]["decisions"]["pricing"]
            elif mutation == "foreign-id": value["orders"][0]["id"] = "not-an-order"
            else: value["orders"][0]["expect"]["extra"] = 1
            variants.append(json.dumps(value))
        for text in variants:
            path.write_text(text)
            with mock.patch.object(HOST, "invoke", side_effect=AssertionError("No Wisp call during expectation validation")):
                with self.assertRaises((HOST.HostError, TypeError, ValueError)):
                    HOST.load_expectations(path, self.orders)

    def test_malformed_expectation_cli_fails_before_starting_cli(self):
        path = self.path / "bad.expect.json"; path.write_text("{}")
        result = subprocess.run([sys.executable, "-B", str(EXAMPLE / "run.py"), "--wisp", "nonexistent-wisp",
                                 "--orders", str(self.path / "orders.json"), "--expect", str(path)],
                                capture_output=True, text=True, timeout=15)
        self.assertEqual(result.returncode, 2)
        self.assertEqual(result.stdout, "")
        self.assertIn("expectations", result.stderr)
        self.assertNotIn("No such file", result.stderr)

    def test_expectations_cannot_turn_error_unknown_or_partial_gate_into_pass(self):
        expected, digest = HOST.load_expectations(self.path / "observed.expect.json", self.orders)
        workflow = HOST.plan(BINARY, self.manifest, self.orders)
        for state in ["Error", "Unknown"]:
            value = copy.deepcopy(workflow); value["status"] = state
            value["orders"][0]["status"] = state
            r = HOST.check_expectations(value, expected, digest, "hash")
            self.assertEqual(r["status"], state)
            self.assertEqual(r["expectation"]["cases"][0]["status"], state)
        # Even complete matching candidate expectations cannot override an
        # incomplete baseline in a composed observation.
        value = {"status": "Unknown", "phase": "observed", "component_review": {}, "after": workflow}
        r = HOST.check_expectations(value, expected, digest, "hash")
        self.assertEqual(r["status"], "Unknown")
        self.assertEqual(r["expectation"]["summary"]["pass"], 8)
        for state in ["Fail", "Error", "Unknown"]:
            value = {"status": state, "phase": "component_gate", "component_review": {}}
            r = HOST.check_expectations(value, expected, digest, "hash")
            self.assertEqual(r["status"], state)
            self.assertEqual(r["expectation"]["phase"], "not_evaluated")
            self.assertEqual(r["expectation"]["cases"], [])
            self.assertNotIn("summary", r["expectation"])

    def test_exact_data_not_numeric_string_coercion_and_output_matching(self):
        path = self.path / "opaque.expect.json"
        text = (self.path / "observed.expect.json").read_text()
        # Invalid JSON-number Int data must not be stringified into a match.
        path.write_text(text.replace('"grand_total_cents":"1000"', '"grand_total_cents":1000', 1))
        expected, digest = HOST.load_expectations(path, self.orders)
        workflow = HOST.plan(BINARY, self.manifest, self.orders)
        r = HOST.check_expectations(workflow, expected, digest, "hash")
        self.assertEqual(r["status"], "Fail")
        self.assertIn('/decisions/shipping/grand_total_cents', r["expectation"]["cases"][0]["mismatch_paths"])
        self.assertIn('"grand_total_cents":1000', HOST.transport_json(r))
        expected, digest = HOST.load_expectations(self.path / "observed.expect.json", self.orders)
        workflow["orders"][0]["evidence"][1]["report"]["output"] = "audit\n"
        r = HOST.check_expectations(workflow, expected, digest, "hash")
        self.assertEqual(r["status"], "Fail")
        self.assertEqual(r["expectation"]["cases"][0]["mismatch_paths"], ["/outputs/1/output"])

    def test_expectation_and_order_hashes_describe_retained_file_bytes(self):
        orders, orders_hash = HOST.load_orders(self.path / "orders.json", with_hash=True)
        expected, digest = HOST.load_expectations(self.path / "observed.expect.json", orders)
        self.assertEqual(orders_hash, hashlib.sha256((self.path / "orders.json").read_bytes()).hexdigest())
        saved = copy.deepcopy(expected)
        (self.path / "observed.expect.json").write_text("null")
        r = HOST.check_expectations(HOST.plan(BINARY, self.manifest, orders), expected, digest, orders_hash)
        self.assertEqual(r["status"], "Pass")
        self.assertEqual(r["expectation"]["expected_hash"], digest)
        self.assertEqual(expected, saved)

    def test_gate_cli_success_failure_and_bounded_mismatch_paths(self):
        command = [sys.executable, "-B", str(EXAMPLE / "run.py"), "--wisp", BINARY,
                   "--project", str(self.manifest)]
        p = subprocess.run([*command, "--expect", str(self.path / "observed.expect.json")], capture_output=True, text=True, timeout=60)
        self.assertEqual(p.returncode, 0, p.stderr)
        self.assertEqual(json.loads(p.stdout)["status"], "Pass")
        p = subprocess.run([*command, "--baseline", str(self.baseline), "--orders", str(self.path / "bulk-orders.json"),
                            "--expect", str(self.path / "proposed-free-shipping.expect.json")], capture_output=True, text=True, timeout=60)
        self.assertEqual(p.returncode, 1, p.stderr)
        self.assertEqual(json.loads(p.stdout)["expectation"]["summary"]["fail"], 2)
        paths = HOST.differences({f"x/{i}~": "left" for i in range(100)}, {})
        self.assertEqual(len(paths), 32)
        self.assertTrue(all('~1' in path and '~0' in path for path in paths))

    def test_expected_file_and_output_caps_are_exact_utf8_byte_bounds(self):
        source = (self.path / "observed.expect.json").read_bytes()
        path = self.path / "boundary.expect.json"
        padded = source + b" " * (65536 - len(source))
        path.write_bytes(padded)
        _, digest = HOST.load_expectations(path, self.orders)
        self.assertEqual(digest, hashlib.sha256(padded).hexdigest())
        path.write_bytes(padded + b" ")
        with self.assertRaises(HOST.HostError): HOST.load_expectations(path, self.orders)
        path.write_bytes(b"\xff")
        with self.assertRaises(UnicodeError): HOST.load_expectations(path, self.orders)
        value = json.loads(source)
        value["orders"][0]["expect"]["outputs"][0]["output"] = "é" * 4096
        path.write_text(json.dumps(value, ensure_ascii=False))
        HOST.load_expectations(path, self.orders)
        value["orders"][0]["expect"]["outputs"][0]["output"] += "é"
        path.write_text(json.dumps(value, ensure_ascii=False))
        with self.assertRaises(HOST.HostError): HOST.load_expectations(path, self.orders)

    def test_opaque_nesting_is_bounded_before_execution_and_safe_at_exact_limit(self):
        path = self.path / "nested.expect.json"
        original = json.loads((self.path / "observed.expect.json").read_text())
        command = [sys.executable, "-B", str(EXAMPLE / "run.py"), "--project", str(self.manifest),
                   "--orders", str(self.path / "orders.json"), "--expect", str(path)]
        for arrays in [59, 600]:
            value = copy.deepcopy(original); nested = "mismatch"
            for _ in range(arrays): nested = [nested]
            value["orders"][0]["expect"]["decisions"]["eligibility"]["reason"] = nested
            path.write_text(json.dumps(value))
            p = subprocess.run([*command, "--wisp", "nonexistent-wisp"], capture_output=True, text=True, timeout=15)
            self.assertEqual(p.returncode, 2)
            self.assertEqual(p.stdout, "")
            self.assertIn("nesting exceeds 64", p.stderr)
            self.assertNotIn("No such file", p.stderr)
        value = copy.deepcopy(original); nested = "mismatch"
        for _ in range(58): nested = [nested]
        value["orders"][0]["expect"]["decisions"]["eligibility"]["reason"] = nested
        path.write_text(json.dumps(value))
        expected, _ = HOST.load_expectations(path, self.orders)
        self.assertIn("standard-local", expected)
        p = subprocess.run([*command, "--wisp", BINARY], capture_output=True, text=True, timeout=60)
        self.assertEqual(p.returncode, 1, p.stderr)
        self.assertEqual(json.loads(p.stdout)["status"], "Fail")
        # The same host nesting guard applies before transporting runtime inputs.
        order = {**self.orders[0], "unit_cents": ["bad"]}; nested = order["unit_cents"]
        for _ in range(100): nested = [nested]
        order["unit_cents"] = nested
        orders_path = self.path / "nested-orders.json"; orders_path.write_text(json.dumps([order]))
        with self.assertRaises(HOST.HostError): HOST.load_orders(orders_path)

    def test_unicode_scalar_preflight_and_ascii_safe_report_output(self):
        path = self.path / "unicode.expect.json"
        original = json.loads((self.path / "observed.expect.json").read_text())
        command = [sys.executable, "-B", str(EXAMPLE / "run.py"), "--project", str(self.manifest),
                   "--orders", str(self.path / "orders.json"), "--expect", str(path)]
        for change_key in [False, True]:
            value = copy.deepcopy(original)
            if change_key: value["orders"][0]["expect"]["decisions"]["eligibility"]["\ud800"] = "bad"
            else: value["orders"][0]["expect"]["decisions"]["eligibility"]["reason"] = "\ud800"
            path.write_text(json.dumps(value))
            p = subprocess.run([*command, "--wisp", "nonexistent-wisp"], capture_output=True, text=True, timeout=15)
            self.assertEqual(p.returncode, 2)
            self.assertEqual(p.stdout, "")
            self.assertIn("Unicode scalars", p.stderr)
            self.assertNotIn("No such file", p.stderr)
        value = copy.deepcopy(original)
        value["orders"][0]["expect"]["decisions"]["eligibility"]["reason"] = "é😀"
        path.write_text(json.dumps(value))
        p = subprocess.run([*command, "--wisp", BINARY], capture_output=True, text=True, timeout=60,
                           env={**os.environ, "PYTHONIOENCODING": "ascii"})
        self.assertEqual(p.returncode, 1, p.stderr)
        self.assertEqual(json.loads(p.stdout)["expectation"]["cases"][0]["expected"]["decisions"]["eligibility"]["reason"], "é😀")
        self.assertTrue(p.stdout.isascii())
        value = {"zone": "é" * 1000}
        wire = HOST.transport_json(value)
        self.assertLess(len(wire.encode("utf-8")), 4096)
        self.assertEqual(json.loads(wire), value)
        self.assertTrue(HOST.transport_json(value, ascii_strings=True).isascii())

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
        original = HOST.ProjectClient._exchange
        for token in ["100", "1e400", "1e-400", "-0", "0.0", "1.0", "9" * 5000]:
            with self.subTest(token=token[:20]):
                order = {**self.orders[0], "id": "bad-number", "unit_cents": "NUMBER"}
                text = json.dumps([order, self.orders[0]]).replace('"NUMBER"', token)
                path.write_text(text)
                orders = HOST.load_orders(path)
                emitted = []
                def capture(client, payload):
                    emitted.append(payload.decode("utf-8"))
                    return original(client, payload)
                with mock.patch.object(HOST.ProjectClient, "_exchange", capture):
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
        expected, digest = HOST.load_expectations(self.path / "observed.expect.json", self.orders)
        gated = HOST.check_expectations(r, expected, digest, "hash")
        self.assertEqual(gated["status"], "Unknown")
        self.assertEqual(gated["expectation"]["summary"]["unknown"], 1)

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
        observed = json.loads((self.path / "observed.expect.json").read_text())["orders"][0]["expect"]
        path = self.path / "maximum.expect.json"
        path.write_text(json.dumps({"version": 1, "orders": [{"id": order["id"], "expect": observed} for order in orders]}))
        expected, digest = HOST.load_expectations(path, orders)
        gated = HOST.check_expectations(r, expected, digest, "hash")
        self.assertEqual(gated["status"], "Pass")
        self.assertEqual(gated["expectation"]["summary"]["pass"], 32)

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
        original = HOST.CLIENT.run_cli
        for name in ["project.json", "pricing.wisp", "pricing-cases.json"]:
            with self.subTest(name=name):
                path = self.path / name; saved = path.read_bytes(); changed = False
                def race(binary, args, *a, **kw):
                    nonlocal changed
                    value = original(binary, args, *a, **kw)
                    if args[:2] == ["project", "describe"] and not changed:
                        path.write_bytes(saved + b"\n"); changed = True
                    return value
                with mock.patch.object(HOST.CLIENT, "run_cli", side_effect=race):
                    with self.assertRaises(HOST.HostError):
                        HOST.plan(BINARY, self.manifest, self.orders)
                path.write_bytes(saved)

    def test_checked_review_revisions_are_required_before_composed_calls(self):
        original = HOST.invoke
        def race(binary, args, *a, **kw):
            value = original(binary, args, *a, **kw)
            if args[:2] == ["project", "review"]:
                path = self.path / "pricing.wisp"; path.write_bytes(path.read_bytes() + b"\n")
            return value
        with mock.patch.object(HOST, "invoke", side_effect=race), mock.patch.object(
                HOST.ProjectClient, "_exchange", side_effect=AssertionError("No session before revision checks")) as exchange:
            with self.assertRaises(HOST.HostError):
                HOST.review(BINARY, self.baseline, self.manifest, self.orders)
        exchange.assert_not_called()

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
