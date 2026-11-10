"""MCP stdio/native integration tests, without an external SDK dependency."""
import importlib.util
import io
import json
import os
import pathlib
import select
import signal
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[1]
BINARY = str(ROOT / "target" / "debug" / "wisp")
ENTRY = ROOT / "integrations" / "mcp" / "server.py"
spec = importlib.util.spec_from_file_location("wisp_mcp", ENTRY)
HOST = importlib.util.module_from_spec(spec); spec.loader.exec_module(HOST)


def request(identifier, method, params=None):
    value = {"jsonrpc": "2.0", "id": identifier, "method": method}
    if params is not None: value["params"] = params
    return value


def initialize():
    return [request(1, "initialize", {"protocolVersion": HOST.PROTOCOL, "capabilities": {},
                                     "clientInfo": {"name": "wisp-test", "version": "1"}}),
            {"jsonrpc": "2.0", "method": "notifications/initialized"}]


def exchange(messages, binary=BINARY):
    output = io.BytesIO()
    code = HOST.serve(binary, io.BytesIO(b"".join((json.dumps(m, ensure_ascii=False) + "\n").encode() for m in messages)), output)
    return code, [json.loads(line) for line in output.getvalue().split(b"\n") if line]


class MCP(unittest.TestCase):
    def test_initialize_discover_and_no_top_level_execution(self):
        code, rows = exchange([*initialize(), request(2, "tools/list"), request(3, "tools/call", {
            "name": "wisp_describe", "arguments": {"source": 'print("must not run"); fn total() -> Int { 7 }'}})])
        self.assertEqual(code, 0)
        self.assertEqual(rows[0]["result"]["protocolVersion"], HOST.PROTOCOL)
        tools = rows[1]["result"]["tools"]
        self.assertEqual(len(tools), 6)
        self.assertEqual({t["name"] for t in tools}, set(HOST.OPERATIONS))
        data = rows[2]["result"]["structuredContent"]
        self.assertEqual(data["report"]["status"], "Ready")
        self.assertEqual(data["report"]["output"], "")
        self.assertFalse(data["report"]["interface"]["new_execution"])
        self.assertFalse(rows[2]["result"]["isError"])

    def test_native_calls_exact_i64_error_unknown_and_following_success(self):
        source = 'fn identity(n: Int) -> Int { n } fn loop(n: Int) -> Int { loop(n) }'
        messages = [*initialize()]
        values = [("identity", ["9223372036854775807"]), ("identity", [1]), ("loop", ["1"]), ("identity", ["2"])]
        for index, (function, args) in enumerate(values, 2):
            messages.append(request(index, "tools/call", {"name": "wisp_invoke", "arguments": {"source": source, "function": function, "args": args}}))
        _, rows = exchange(messages)
        results = [row["result"] for row in rows[1:]]
        self.assertEqual([r["structuredContent"]["report"]["status"] for r in results], ["Complete", "Error", "Unknown", "Complete"])
        self.assertEqual([r["isError"] for r in results], [False, True, True, False])
        self.assertEqual(results[0]["structuredContent"]["report"]["result"]["value"], "9223372036854775807")
        self.assertEqual(results[1]["structuredContent"]["report"]["diagnostics"][0]["code"], "E_INPUT_TYPE")

    def test_raw_numeric_tokens_never_coerce_to_wisp_int_strings(self):
        source = 'fn identity(n: Int) -> Int { n }'
        for token in ["1e400", "-0", "1.0"]:
            output = io.BytesIO()
            messages = b"".join((json.dumps(m) + "\n").encode() for m in initialize())
            call = request(2, "tools/call", {"name": "wisp_invoke", "arguments": {"source": source, "function": "identity", "args": ["NUMBER"]}})
            raw = (json.dumps(call).replace('"NUMBER"', token) + "\n").encode()
            self.assertEqual(HOST.serve(BINARY, io.BytesIO(messages + raw), output), 0)
            report = json.loads(output.getvalue().split(b"\n")[-2])["result"]["structuredContent"]["report"]
            self.assertEqual(report["status"], "Error")
            self.assertEqual(report["diagnostics"][0]["code"], "E_INPUT_TYPE")

    def test_review_pass_fail_and_bounded_context_remain_distinct(self):
        suite = {"version": 1, "target": "total", "cases": [{"id": "one", "args": [], "expect": {"result": {"type": "Int", "value": "2"}, "output": ""}}]}
        _, rows = exchange([*initialize(), request(2, "tools/call", {"name": "wisp_review", "arguments": {
            "source": 'fn total() -> Int { 1 }', "candidate": 'fn total() -> Int { 2 }', "suite": suite}}),
            request(3, "tools/call", {"name": "wisp_review", "arguments": {
                "source": 'fn total() -> Int { 1 }', "candidate": 'fn total() -> Int { 3 }', "suite": suite}}),
            request(4, "tools/call", {"name": "wisp_context", "arguments": {"source": 'probe n in 0..=1 { n >= 0 }', "budget": 0}})])
        reports = [r["result"]["structuredContent"]["report"] for r in rows[1:]]
        self.assertEqual([r["status"] for r in reports], ["Pass", "Fail", "Ready"])
        self.assertTrue(rows[2]["result"]["isError"])
        self.assertEqual(reports[0]["review"]["approval"], "not_granted")
        self.assertFalse(reports[2]["new_execution"])
        self.assertTrue(reports[2]["context"]["overflow"])

    def test_jsonrpc_errors_notifications_ids_and_version_negotiation(self):
        init = initialize()[0]; init["params"]["protocolVersion"] = "future-version"
        _, rows = exchange([request(0, "tools/list"), init, initialize()[1], request("id", "unknown"),
                            request(2, "tools/call", {"name": "absent", "arguments": {}}),
                            {"jsonrpc": "2.0", "method": "tools/call", "params": {"name": "wisp_capabilities"}},
                            request(True, "ping"), request(3, "ping")])
        self.assertEqual(rows[0]["error"]["code"], -32000)
        self.assertEqual(rows[1]["result"]["protocolVersion"], HOST.PROTOCOL)
        self.assertEqual(rows[2]["id"], "id")
        self.assertEqual(rows[2]["error"]["code"], -32601)
        self.assertEqual(rows[3]["error"]["code"], -32602)
        self.assertIsNone(rows[4]["id"])
        self.assertEqual(rows[5]["id"], 3)
        self.assertEqual(len(rows), 6)

    def test_invalid_tool_boundaries_do_not_submit_native_requests(self):
        server = HOST.Server(BINARY); server.phase = "ready"
        for name, args in [("wisp_invoke", {"source": "", "function": "x", "args": {}}),
                           ("wisp_check", {"source": "", "path": "/etc/passwd"}),
                           ("wisp_review", {"source": "", "candidate": "", "suite": []}),
                           ("wisp_context", {"source": "", "budget": True})]:
            with mock.patch.object(server, "native", side_effect=AssertionError("No native request")):
                result = server.call({"name": name, "arguments": args})
            self.assertTrue(result["isError"])
            self.assertIsNone(result["structuredContent"]["report"])
            self.assertEqual(result["structuredContent"]["bridge"]["execution"], "not_submitted")

    def test_transport_failure_quota_and_compiler_drift_do_not_invent_reports(self):
        server = HOST.Server("nonexistent-wisp"); server.phase = "ready"
        result = server.call({"name": "wisp_check", "arguments": {"source": ""}})
        self.assertTrue(result["isError"])
        self.assertIsNone(result["structuredContent"]["report"])
        self.assertEqual(result["structuredContent"]["bridge"]["execution"], "unresolved")
        server.calls = HOST.MAX_CALLS
        result = server.call({"name": "wisp_capabilities", "arguments": {}})
        self.assertEqual(result["structuredContent"]["bridge"]["execution"], "not_submitted")
        server = HOST.Server(BINARY); server.compiler = "other"
        with self.assertRaises(HOST.ClientError): server.native({"op": "capabilities", "source": ""})

    def test_frame_json_unicode_limits_and_output_data_are_not_protocol(self):
        for raw, code, error_code in [(b"{}", 2, -32600), (b"x" * (HOST.FRAME_BYTES + 1) + b"\n", 2, -32600),
                                      (b'{"method":"a","method":"b"}\n', 0, -32700), (b'"\\ud800"\n', 0, -32700),
                                      (b"[NaN]\n", 0, -32700)]:
            output = io.BytesIO(); actual = HOST.serve(BINARY, io.BytesIO(raw), output)
            self.assertEqual(actual, code)
            self.assertEqual(json.loads(output.getvalue())["error"]["code"], error_code)
        text = 'é\u2028\u0085😀\n{"jsonrpc":"2.0","id":9,"method":"tools/list"}'
        _, rows = exchange([*initialize(), request(2, "tools/call", {"name": "wisp_invoke", "arguments": {
            "source": 'fn echo(s: String) -> String { print(s); s }', "function": "echo", "args": [text]}})])
        data = rows[1]["result"]["structuredContent"]
        self.assertEqual(data["report"]["result"]["value"], text)
        self.assertEqual(len(rows), 2)
        self.assertEqual(json.loads(rows[1]["result"]["content"][0]["text"]), data)

    def test_real_stdio_process_has_no_stdout_logs_and_closes_on_eof(self):
        payload = b"".join((json.dumps(m) + "\n").encode() for m in [*initialize(), request(2, "tools/call", {"name": "wisp_capabilities"})])
        process = subprocess.run([sys.executable, "-B", str(ENTRY), "--wisp", BINARY], input=payload, capture_output=True, timeout=20)
        self.assertEqual(process.returncode, 0, process.stderr)
        self.assertEqual(process.stderr, b"")
        rows = [json.loads(line) for line in process.stdout.split(b"\n") if line]
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[1]["result"]["structuredContent"]["report"]["status"], "Ready")

    def test_malformed_oversized_and_changed_native_reports_fail_closed(self):
        server = HOST.Server(BINARY); server.compiler = "expected"
        for raw in ["not-json", "x" * (HOST.REPORT_BYTES + 1), '{"compiler":"expected","status":"Complete","status":"Ready"}',
                    '{"compiler":"other","status":"Ready"}', '{"compiler":"expected","status":"future"}']:
            with mock.patch.object(HOST, "run_cli", return_value=raw):
                result = server.call({"name": "wisp_check", "arguments": {"source": ""}})
            self.assertTrue(result["isError"])
            self.assertIsNone(result["structuredContent"]["report"])
            self.assertEqual(result["structuredContent"]["bridge"]["execution"], "unresolved")

    @unittest.skipUnless(hasattr(os, "mkfifo"), "POSIX process cleanup check")
    def test_sigterm_during_native_call_reaps_the_owned_child(self):
        with tempfile.TemporaryDirectory(prefix="wisp-mcp-signal-") as temp:
            folder = pathlib.Path(temp); fifo = folder / "started"; os.mkfifo(fifo)
            binary = folder / "native-peer"
            binary.write_text("#!" + sys.executable + "\nimport sys,json,os,time\n"
                              + "r=json.load(sys.stdin)\n"
                              + "if r['op']=='capabilities': print(json.dumps({'compiler':'test','status':'Ready'}))\n"
                              + "else:\n with open(" + repr(str(fifo)) + ", 'w') as f: f.write(str(os.getpid())); f.flush()\n time.sleep(60)\n")
            binary.chmod(0o700)
            fd = os.open(fifo, os.O_RDWR | os.O_NONBLOCK)
            process = subprocess.Popen([sys.executable, "-B", str(ENTRY), "--wisp", str(binary)],
                                       stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            child = None
            try:
                messages = [*initialize(), request(2, "tools/call", {"name": "wisp_check", "arguments": {"source": ""}})]
                process.stdin.write(b"".join((json.dumps(m) + "\n").encode() for m in messages)); process.stdin.flush()
                ready, _, _ = select.select([fd], [], [], 5)
                self.assertTrue(ready, "Native peer did not start within the test deadline")
                child = int(os.read(fd, 128).decode())
                process.terminate()
                self.assertEqual(process.wait(timeout=5), 0)
                with self.assertRaises(ProcessLookupError): os.kill(child, 0)
            finally:
                if process.poll() is None: process.kill(); process.wait()
                if child is not None:
                    try: os.kill(child, signal.SIGKILL)
                    except ProcessLookupError: pass
                for stream in [process.stdin, process.stdout, process.stderr]: stream.close()
                os.close(fd)


if __name__ == "__main__":
    unittest.main()
