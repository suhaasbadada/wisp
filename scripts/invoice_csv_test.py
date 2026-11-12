"""Finite CSV transport checks; native binary is supplied by Cargo integration."""
import contextlib
import copy
import importlib.util
import io
import json
import os
from pathlib import Path
import stat
import subprocess
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("invoice_csv", ROOT / "examples/invoice-csv/run.py")
adapter = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(adapter)
BINARY = os.environ["WISP_TEST_BINARY"]
HEADER = "quantity,unit_cents,declared_cents\n"
BASE = (ROOT / "examples/invoice-batch.wisp").read_text()


class InvoiceCSV(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="wisp-invoice-csv-")
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        self.csv = self.directory / "input.csv"
        self.source = self.directory / "source.wisp"
        self.out = self.directory / "args.json"
        self.csv.write_text(HEADER + "2,250,500\n3,100,290\n1,700,700\n")
        self.source.write_text(BASE)

    def options(self, *extra):
        return ["--csv", str(self.csv), "--payment-cents", "1500",
                "--source", str(self.source), "--binary", BINARY, *extra]

    def run_adapter(self, *extra):
        stdout, stderr = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            code = adapter.main(self.options(*extra))
        return code, json.loads(stdout.getvalue()) if stdout.getvalue() else None, stderr.getvalue()

    def ready(self):
        args = adapter.arguments(self.csv.read_text(), "1500")
        return adapter.exchange(BINARY, "validate-call", BASE, args)

    def test_baseline_ready_execution_and_preservation(self):
        before = (self.csv.read_bytes(), self.source.read_bytes())
        code, report, error = self.run_adapter()
        self.assertEqual((code, report["status"], report["output"], error), (0, "Ready", "", ""))
        self.assertNotIn("invocation", report)
        self.assertFalse(self.out.exists())
        code, report, _ = self.run_adapter("--execute", "--args-out", str(self.out))
        self.assertEqual((code, report["status"], report["output"]), (0, "Complete", ""))
        value = report["result"]["value"]
        for key, expected in {"computed_cents": "1500", "declared_cents": "1490",
                              "mismatched_lines": "1", "first_mismatched_index": "1",
                              "balanced": False}.items():
            self.assertEqual(value[key], expected)
        self.assertEqual(stat.S_IMODE(self.out.stat().st_mode), 0o600)
        raw = subprocess.run([BINARY, "call", str(self.source), "reconcile", "--args-file", str(self.out)],
                             capture_output=True, check=True, timeout=30)
        self.assertEqual(json.loads(raw.stdout)["result"], report["result"])
        self.assertEqual(before, (self.csv.read_bytes(), self.source.read_bytes()))
        self.assertEqual(adapter.digest(self.out.read_text()), self.ready()["input_validation"]["argument_hash"])

    def test_default_paths_from_arbitrary_cwd(self):
        process = subprocess.run(["python3", "-B", str(ROOT / "examples/invoice-csv/run.py"),
                                  "--csv", str(self.csv), "--payment-cents", "1500", "--binary", BINARY],
                                 cwd=self.directory, capture_output=True, timeout=30)
        self.assertEqual(process.returncode, 0, process.stderr)
        self.assertEqual(json.loads(process.stdout)["revision"], adapter.digest(BASE))

    def test_200_rows_and_last_mismatch(self):
        for declared, expected, mismatches, index in [("500", "100000", "0", "-1"),
                                                      ("490", "99990", "1", "199")]:
            self.csv.write_text(HEADER + "2,250,500\n" * 199 + f"2,250,{declared}\n")
            code, report, _ = self.run_adapter("--payment-cents", "100000", "--execute")
            self.assertEqual(code, 0)
            value = report["result"]["value"]
            self.assertEqual(value["computed_cents"], "100000")
            self.assertEqual(value["declared_cents"], expected)
            self.assertEqual(value["mismatched_lines"], mismatches)
            self.assertEqual(value["first_mismatched_index"], index)
            self.assertEqual(value["balanced"], declared == "500")

    def test_explicit_authored_candidate_owns_pricing(self):
        self.csv.write_text(HEADER + "9,100,900\n10,100,900\n")
        candidate = ROOT / "examples/invoice-rule-review/bulk-discount.wisp"
        code, report, _ = self.run_adapter("--source", str(candidate), "--payment-cents", "1800", "--execute")
        self.assertEqual(code, 0)
        self.assertEqual(report["result"]["value"]["computed_cents"], "1800")
        self.assertTrue(report["result"]["value"]["balanced"])

    def test_native_canonical_errors_and_exact_unquoting(self):
        for cell in [" 2", "01", "1e400", "=SUM(1)", "2\n"]:
            with self.subTest(cell=cell):
                stream = io.StringIO(newline="")
                writer = adapter.csv.writer(stream, lineterminator="\n")
                writer.writerow(adapter.HEADER)
                writer.writerow([cell, "250", "500"])
                self.csv.write_text(stream.getvalue())
                code, report, error = self.run_adapter("--execute", "--args-out", str(self.out))
                self.assertEqual((code, report["status"], error), (1, "Error", ""))
                self.assertEqual(report["diagnostics"][0]["path"], "/args/0/0/quantity")
                self.assertEqual(report["input_validation"]["new_execution"], False)
                self.assertNotIn("invocation", report)
                self.assertFalse(self.out.exists())
                args = json.loads(adapter.arguments(stream.getvalue(), "1500"))
                self.assertEqual(args[0][0]["quantity"], cell)
        self.csv.write_text(HEADER + '"2","250","500"\n')
        self.assertEqual(self.run_adapter()[1]["status"], "Ready")
        code, report, _ = self.run_adapter("--payment-cents", " 500")
        self.assertEqual(code, 1)
        self.assertEqual(report["diagnostics"][0]["path"], "/args/1")

    def test_empty_batch_and_runtime_statuses(self):
        self.csv.write_text(HEADER)
        self.assertEqual(self.run_adapter("--payment-cents", "0", "--execute")[1]["result"]["value"]["line_count"], "0")
        for body, status, exit_code in [("1/0", "Error", 1), ("reconcile(lines,payment_cents)", "Unknown", 3)]:
            self.source.write_text("record InvoiceLine { quantity:Int, unit_cents:Int, declared_cents:Int }\n"
                                   "fn reconcile(lines:[InvoiceLine],payment_cents:Int)->Int {" + body + "}\n"
                                   "print(1/0); probe n in 0..=0 {false}")
            self.assertEqual(self.run_adapter()[1]["status"], "Ready")
            code, report, _ = self.run_adapter("--execute", "--args-out", str(self.out))
            self.assertEqual((code, report["status"], report["output"]), (exit_code, status, ""))
            self.assertTrue(report["invocation"]["new_execution"])
            self.assertNotIn("result", report)
            self.assertEqual(json.loads(self.out.read_text()), [[], "1500"])
            self.out.unlink()

    def test_native_preflight_unknown_and_source_error_never_execute_or_write(self):
        self.csv.write_text(HEADER + "1,1,1\n" * 1025)
        code, report, _ = self.run_adapter("--execute", "--args-out", str(self.out))
        self.assertEqual((code, report["status"]), (3, "Unknown"))
        self.assertEqual(report["diagnostics"][0]["code"], "E_LIMIT_LIST_ELEMENTS")
        self.assertFalse(report["input_validation"]["new_execution"])
        self.assertFalse(self.out.exists())
        self.csv.write_text(HEADER)
        self.source.write_text("fn incomplete(")
        code, report, _ = self.run_adapter("--execute", "--args-out", str(self.out))
        self.assertEqual((code, report["status"]), (1, "Error"))
        self.assertNotIn("invocation", report)
        self.assertFalse(self.out.exists())

    def test_bad_csv_and_expansion_rejected_before_dispatch(self):
        bad = [b"", b"quantity,unit_cents\n", b"quantity,unit_cents,quantity\n",
               b"unit_cents,quantity,declared_cents\n", HEADER.encode() + b"\n",
               HEADER.encode() + b"1,2\n", HEADER.encode() + b"1,2,3,4\n",
               HEADER.encode() + b",2,3\n", HEADER.encode() + b'"1,2,3\n',
               HEADER.encode() + b'"1"oops,2,3\n', HEADER.encode() + b"\xff,2,3\n",
               b"\xef\xbb\xbf" + HEADER.encode(), HEADER.replace("\n", "\r\n").encode(),
               b"x" * 65537, (HEADER + "1,1,1\n" * 2000).encode()]
        for raw in bad:
            with self.subTest(size=len(raw), prefix=raw[:24]):
                self.csv.write_bytes(raw)
                with patch.object(adapter, "run_cli") as native:
                    code, report, error = self.run_adapter("--execute", "--args-out", str(self.out))
                    native.assert_not_called()
                self.assertEqual((code, report), (2, None))
                self.assertIn("host/transport failure", error)
                self.assertFalse(self.out.exists())

    def test_source_and_payment_bounds_before_dispatch(self):
        for raw in [b"\xff", b"\xef\xbb\xbf", b"\r", b"x" * 65537]:
            self.source.write_bytes(raw)
            with patch.object(adapter, "run_cli") as native:
                self.assertEqual(self.run_adapter()[0], 2)
                native.assert_not_called()
        self.source.write_text(BASE)
        with patch.object(adapter, "run_cli") as native:
            self.assertEqual(self.run_adapter("--payment-cents", "x" * 65536)[0], 2)
            native.assert_not_called()
        fifo = self.directory / "fifo"
        os.mkfifo(fifo)
        with patch.object(adapter, "run_cli") as native:
            self.assertEqual(self.run_adapter("--source", str(fifo))[0], 2)
            self.assertEqual(self.run_adapter("--csv", str(fifo))[0], 2)
            native.assert_not_called()

    def test_source_is_captured_once(self):
        original = adapter.run_cli
        requests = []

        def transport(binary, argv, input_text=None, **kwargs):
            requests.append(json.loads(input_text))
            if len(requests) == 1:
                self.source.write_text("changed after validation")
                self.csv.write_text("changed CSV")
            return original(binary, argv, input_text=input_text, **kwargs)

        with patch.object(adapter, "run_cli", side_effect=transport):
            self.assertEqual(self.run_adapter("--execute")[0], 0)
        self.assertEqual([r["op"] for r in requests], ["validate-call", "call"])
        self.assertEqual(requests[0]["source"], BASE)
        self.assertEqual(requests[0]["source"], requests[1]["source"])
        self.assertEqual(requests[0]["args"], requests[1]["args"])

    def test_malformed_peer_fails_closed(self):
        good = self.ready()
        mutations = [lambda r: r.update(status="Complete"), lambda r: r.update(revision="0" * 64),
                     lambda r: r.update(compiler="future"), lambda r: r.update(result={}),
                     lambda r: r.update(usage={}), lambda r: r.update(invocation={}),
                     lambda r: r.update(output="private"), lambda r: r.update(probes=[{}]),
                     lambda r: r.update(diagnostics=[{}]), lambda r: r.update(new_execution=True),
                     lambda r: r.update(args=["private"])]
        for key, value in [("argument_hash", "0" * 64), ("argument_count", True),
                           ("target", "other"), ("phase", "executed"),
                           ("contract_version", True), ("new_execution", True)]:
            mutations.append(lambda r, k=key, v=value: r["input_validation"].update({k: v}))
        peers = ['{"status":', '{"status":"Ready","status":"Ready"}', 'NaN', '[]']
        for mutate in mutations:
            report = copy.deepcopy(good)
            mutate(report)
            peers.append(json.dumps(report))
        for raw in peers:
            with self.subTest(raw=raw[:80]), patch.object(adapter, "run_cli", return_value=raw) as native:
                code, report, error = self.run_adapter("--execute", "--args-out", str(self.out))
                self.assertEqual((code, report), (2, None))
                self.assertNotIn("private", error)
                self.assertEqual(native.call_count, 1)
                self.assertFalse(self.out.exists())

    def test_output_exclusive_and_failed_write_never_unlinks_replacement(self):
        for target in [self.csv, self.source]:
            before = target.read_bytes()
            self.assertEqual(self.run_adapter("--execute", "--args-out", str(target))[0], 2)
            self.assertEqual(target.read_bytes(), before)
        self.out.write_bytes(b"old private data")
        self.assertEqual(self.run_adapter("--args-out", str(self.out))[0], 2)
        self.assertEqual(self.out.read_bytes(), b"old private data")
        link = self.directory / "link"
        link.symlink_to(self.out)
        self.assertEqual(self.run_adapter("--args-out", str(link))[0], 2)
        self.assertTrue(link.is_symlink())
        self.assertEqual(self.out.read_bytes(), b"old private data")
        with patch.object(adapter, "write_args", side_effect=OSError("private path")):
            code, report, error = self.run_adapter("--execute", "--args-out", str(self.directory / "new"))
            self.assertEqual((code, report), (2, None))
            self.assertNotIn("private path", error)

    def test_partial_write_clears_only_owned_descriptor(self):
        fdopen = os.fdopen
        moved = self.directory / "owned-inode"
        out = self.out

        class FailingWriter:
            def __init__(self, fd, *args, **kwargs):
                self.stream = fdopen(fd, *args, **kwargs)

            def __enter__(self):
                return self

            def __exit__(self, *unused):
                self.stream.close()

            def fileno(self):
                return self.stream.fileno()

            def write(self, data):
                self.stream.write(data[:2])
                out.rename(moved)
                out.write_bytes(b"replacement must survive")
                raise OSError("partial write")

        with patch.object(adapter.os, "fdopen", FailingWriter):
            with self.assertRaises(OSError):
                adapter.write_args(out, "[[],\"0\"]")
        self.assertEqual(out.read_bytes(), b"replacement must survive")
        self.assertEqual(moved.read_bytes(), b"")

    def test_usage_and_transport_failures_are_generic(self):
        with patch.object(adapter, "run_cli", side_effect=adapter.ClientError("private native output")):
            code, report, error = self.run_adapter()
            self.assertEqual((code, report), (2, None))
            self.assertNotIn("private native output", error)
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            self.assertEqual(adapter.main(["--private-bad-option"]), 2)
        self.assertNotIn("private-bad-option", stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
