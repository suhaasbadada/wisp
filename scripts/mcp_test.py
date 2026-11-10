"""MCP stdio/native integration tests, without an external SDK dependency."""
import copy
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


def exchange(messages, binary=BINARY, manifest=None):
    output = io.BytesIO()
    code = HOST.serve(binary, io.BytesIO(b"".join((json.dumps(m, ensure_ascii=False) + "\n").encode() for m in messages)), output, manifest=manifest)
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

    def test_owner_configured_project_discovery_and_invocation_need_no_source(self):
        manifest = ROOT / "examples" / "policies" / "project.json"
        args = [{"quantity": "11", "pack_size": "5", "expires_at": "101"}, {"available": "11", "now": "100"}]
        _, rows = exchange([*initialize(), request(2, "tools/list"),
                            request(3, "tools/call", {"name": "wisp_project_describe", "arguments": {}}),
                            request(4, "tools/call", {"name": "wisp_project_invoke", "arguments": {
                                "id": "reservation", "policy": "reservations", "function": "decide", "args": args}})], manifest=manifest)
        self.assertEqual(len(rows[1]["result"]["tools"]), 8)
        described = rows[2]["result"]["structuredContent"]
        self.assertEqual(described["bridge"]["execution"], "initialization_metadata")
        self.assertFalse(described["report"]["project"]["new_execution"])
        called = rows[3]["result"]["structuredContent"]["report"]
        self.assertEqual(called["status"], "Complete")
        self.assertEqual(called["adapter"]["request_id"], "reservation")
        self.assertEqual(called["adapter"]["manifest_hash"], described["report"]["project"]["manifest_hash"])
        self.assertEqual(called["report"]["result"]["value"], {"accepted": True, "packs": "3", "reason": "reserved"})

    def test_project_tools_are_absent_without_explicit_owner_configuration(self):
        with mock.patch.object(HOST, "ProjectClient", side_effect=AssertionError("No project filesystem read")):
            _, rows = exchange([*initialize(), request(2, "tools/list"), request(3, "tools/call", {
                "name": "wisp_project_describe", "arguments": {}})])
        self.assertEqual(len(rows[1]["result"]["tools"]), 6)
        self.assertEqual(rows[2]["error"]["code"], -32602)
        _, rows = exchange([*initialize(), request(2, "tools/list")], manifest="nonexistent-project.json")
        self.assertEqual(rows[0]["error"]["code"], -32603)
        self.assertEqual(rows[1]["error"]["code"], -32000)

    def test_project_schema_and_unknown_targets_are_rejected_before_submission(self):
        server = HOST.Server(BINARY, manifest=ROOT / "examples" / "policies" / "project.json")
        server.handle(HOST.decode_json(json.dumps(initialize()[0]), input_numbers=True)); server.handle(initialize()[1])
        good = {"id": "one", "policy": "reservations", "function": "decide", "args": []}
        for change in [{"id": "é"}, {"policy": "unknown"}, {"function": "unknown"},
                       {"manifest": "/etc/passwd"}, {"source": "print(1);"}, {"args": {}}]:
            with mock.patch.object(server.project, "_exchange", side_effect=AssertionError("No native session")):
                result = server.call({"name": "wisp_project_invoke", "arguments": {**good, **change}})
            self.assertTrue(result["isError"])
            self.assertEqual(result["structuredContent"]["bridge"]["execution"], "not_submitted")

    def test_project_source_manifest_and_suite_drift_are_not_silently_adopted(self):
        example = ROOT / "examples" / "policies"
        for changed in ["project.json", "reservations-after.wisp", "cases.json"]:
            with tempfile.TemporaryDirectory(prefix="wisp-mcp-project-") as temp:
                folder = pathlib.Path(temp)
                for name in ["project.json", "reservations-after.wisp", "cases.json"]:
                    (folder / name).write_bytes((example / name).read_bytes())
                server = HOST.Server(BINARY, manifest=folder / "project.json")
                server.handle(HOST.decode_json(json.dumps(initialize()[0]), input_numbers=True)); server.handle(initialize()[1])
                old = server.project.description
                path = folder / changed; raw = path.read_bytes(); path.write_bytes(raw + b"\n")
                result = server.call({"name": "wisp_project_invoke", "arguments": {"id": "drift", "policy": "reservations", "function": "decide",
                    "args": [{"quantity": "1", "pack_size": "1", "expires_at": "101"}, {"available": "1", "now": "100"}]}})
                self.assertTrue(result["isError"])
                self.assertIsNone(result["structuredContent"]["report"])
                metadata = server.call({"name": "wisp_project_describe", "arguments": {}})
                self.assertEqual(metadata["structuredContent"]["report"], old)
                self.assertEqual(metadata["structuredContent"]["bridge"]["execution"], "initialization_metadata")

    def test_saved_and_inline_invocations_return_identical_core_evidence(self):
        example = ROOT / "examples" / "policies"
        source = (example / "reservations-after.wisp").read_text()
        args = [{"quantity": "11", "pack_size": "5", "expires_at": "101"}, {"available": "11", "now": "100"}]
        inline = request(2, "tools/call", {"name": "wisp_invoke", "arguments": {"source": source, "function": "decide", "args": args}})
        saved = request(3, "tools/call", {"name": "wisp_project_invoke", "arguments": {"id": "one", "policy": "reservations", "function": "decide", "args": args}})
        _, rows = exchange([*initialize(), inline, saved], manifest=example / "project.json")
        self.assertEqual(rows[1]["result"]["structuredContent"]["report"], rows[2]["result"]["structuredContent"]["report"]["report"])
        self.assertLess(len(json.dumps(saved).encode()), len(json.dumps(inline).encode()))

    def test_saved_project_error_rejection_unknown_and_continuation_are_data(self):
        manifest = ROOT / "examples" / "policies" / "project.json"
        messages = [*initialize()]
        for index, quantity in enumerate([1, "0", "1"], 2):
            messages.append(request(index, "tools/call", {"name": "wisp_project_invoke", "arguments": {
                "id": "order-" + str(index), "policy": "reservations", "function": "decide",
                "args": [{"quantity": quantity, "pack_size": "1", "expires_at": "101"}, {"available": "1", "now": "100"}]}}))
        _, rows = exchange(messages, manifest=manifest)
        results = [r["result"] for r in rows[1:]]
        self.assertEqual([r["structuredContent"]["report"]["status"] for r in results], ["Error", "Complete", "Complete"])
        self.assertEqual([r["isError"] for r in results], [True, False, False])
        self.assertFalse(results[1]["structuredContent"]["report"]["report"]["result"]["value"]["accepted"])
        self.assertTrue(results[2]["structuredContent"]["report"]["report"]["result"]["value"]["accepted"])
        with tempfile.TemporaryDirectory(prefix="wisp-mcp-project-limit-") as temp:
            folder = pathlib.Path(temp)
            (folder / "source.wisp").write_text('fn spin(n: Int) -> Int { spin(n) }')
            (folder / "cases.json").write_text('{}')
            (folder / "project.json").write_text(json.dumps({"version": 1, "policies": [{"id": "loop", "source": "source.wisp", "suite": "cases.json"}]}))
            _, rows = exchange([*initialize(), request(2, "tools/call", {"name": "wisp_project_invoke", "arguments": {
                "id": "limit", "policy": "loop", "function": "spin", "args": ["1"]}})], manifest=folder / "project.json")
            self.assertEqual(rows[1]["result"]["structuredContent"]["report"]["status"], "Unknown")
            self.assertTrue(rows[1]["result"]["isError"])

    def test_configured_project_compiler_must_match_source_tool_compiler(self):
        manifest = ROOT / "examples" / "policies" / "project.json"
        metadata = HOST.ProjectClient(manifest, binary=BINARY).description
        metadata = copy.deepcopy(metadata)
        metadata["project"]["policies"][0]["report"]["compiler"] = "different-compiler"
        project = mock.Mock(); project.description = metadata
        with mock.patch.object(HOST, "ProjectClient", return_value=project):
            _, rows = exchange([*initialize(), request(2, "tools/list")], manifest=manifest)
        self.assertEqual(rows[0]["error"]["code"], -32603)
        self.assertEqual(rows[1]["error"]["code"], -32000)

    def test_project_metadata_and_adapter_results_share_the_report_byte_cap(self):
        server = HOST.Server(BINARY)
        server.project = mock.Mock()
        server.project_targets = {"reservations": {"decide"}}
        oversized = {"status": "Complete", "data": "x" * (HOST.REPORT_BYTES + 1)}
        server.project.description = oversized
        server.project.call.return_value = oversized
        for name, args in [("wisp_project_describe", {}), ("wisp_project_invoke", {
                "id": "one", "policy": "reservations", "function": "decide", "args": []})]:
            result = server.call({"name": name, "arguments": args})
            self.assertTrue(result["isError"])
            self.assertIsNone(result["structuredContent"]["report"])
            self.assertEqual(result["structuredContent"]["bridge"]["execution"], "unresolved")

    def test_project_discovery_returns_defensive_call_guards(self):
        server = HOST.Server(BINARY, manifest=ROOT / "examples" / "policies" / "project.json")
        server.handle(HOST.decode_json(json.dumps(initialize()[0]), input_numbers=True)); server.handle(initialize()[1])
        result = server.call({"name": "wisp_project_describe", "arguments": {}})
        data = result["structuredContent"]
        self.assertEqual(json.loads(result["content"][0]["text"]), data)
        guard = data["bridge"]["call_guards"]["reservations"]
        row = data["report"]["project"]["policies"][0]
        self.assertEqual(guard, {"policy_id": "reservations", "manifest_hash": data["report"]["project"]["manifest_hash"],
                                 "source_revision": row["report"]["revision"], "suite_file_hash": row["suite_file_hash"],
                                 "compiler": row["report"]["compiler"]})
        guard["source_revision"] = "0" * 64
        next_result = server.call({"name": "wisp_project_describe", "arguments": {}})
        self.assertNotEqual(next_result["structuredContent"]["bridge"]["call_guards"]["reservations"]["source_revision"], "0" * 64)

    def test_guarded_and_unguarded_calls_have_identical_native_evidence(self):
        server = HOST.Server(BINARY, manifest=ROOT / "examples" / "policies" / "project.json")
        server.handle(HOST.decode_json(json.dumps(initialize()[0]), input_numbers=True)); server.handle(initialize()[1])
        args = {"id": "one", "policy": "reservations", "function": "decide", "args": [
            {"quantity": "11", "pack_size": "5", "expires_at": "101"}, {"available": "11", "now": "100"}]}
        ordinary = server.call({"name": "wisp_project_invoke", "arguments": args})
        guarded = server.call({"name": "wisp_project_invoke", "arguments": {**args, "expected": copy.deepcopy(server.project_guards["reservations"])}})
        self.assertEqual(ordinary["structuredContent"]["report"], guarded["structuredContent"]["report"])
        self.assertEqual(ordinary["structuredContent"]["bridge"]["guard_status"], "not_requested")
        self.assertEqual(guarded["structuredContent"]["bridge"]["guard_status"], "matched")

    def test_bad_guard_fields_fail_before_native_session_creation(self):
        server = HOST.Server(BINARY, manifest=ROOT / "examples" / "policies" / "project.json")
        server.handle(HOST.decode_json(json.dumps(initialize()[0]), input_numbers=True)); server.handle(initialize()[1])
        guard = server.project_guards["reservations"]
        variants = [{}, {**guard, "extra": 1}, {**guard, "source_revision": True}, {**guard, "source_revision": "short"},
                    {**guard, "source_revision": "0" * 64}, {**guard, "manifest_hash": "0" * 64},
                    {**guard, "suite_file_hash": "0" * 64}, {**guard, "compiler": "other"}, {**guard, "policy_id": "other"}]
        for expected in variants:
            with mock.patch.object(server.project, "_exchange", side_effect=AssertionError("No native session")) as exchange:
                result = server.call({"name": "wisp_project_invoke", "arguments": {
                    "id": "guard", "policy": "reservations", "function": "decide", "args": [], "expected": expected}})
            self.assertTrue(result["isError"])
            self.assertIsNone(result["structuredContent"]["report"])
            self.assertEqual(result["structuredContent"]["bridge"]["guard_status"], "rejected")
            self.assertEqual(result["structuredContent"]["bridge"]["execution"], "not_submitted")
            exchange.assert_not_called()

    def test_old_reasoning_guard_survives_reconnect_and_refuses_new_source(self):
        with tempfile.TemporaryDirectory(prefix="wisp-mcp-reconnect-") as temp:
            folder = pathlib.Path(temp)
            source = folder / "price.wisp"; source.write_text('fn price(n: Int) -> Int { n }')
            (folder / "cases.json").write_text('{}')
            manifest = folder / "project.json"
            manifest.write_text(json.dumps({"version": 1, "policies": [{"id": "pricing", "source": "price.wisp", "suite": "cases.json"}]}))
            def connect():
                server = HOST.Server(BINARY, manifest=manifest)
                server.handle(HOST.decode_json(json.dumps(initialize()[0]), input_numbers=True)); server.handle(initialize()[1])
                return server
            before = connect()
            old_guard = copy.deepcopy(before.project_guards["pricing"])
            source.write_text('fn price(n: Int) -> Int { n + 1 }')
            after = connect()
            args = {"id": "quote", "policy": "pricing", "function": "price", "args": ["1"]}
            with mock.patch.object(after.project, "_exchange", side_effect=AssertionError("Stale reasoning must not execute")):
                blocked = after.call({"name": "wisp_project_invoke", "arguments": {**args, "expected": old_guard}})
            self.assertEqual(blocked["structuredContent"]["bridge"]["guard_status"], "rejected")
            self.assertEqual(blocked["structuredContent"]["bridge"]["execution"], "not_submitted")
            # Negative control: server-only pins intentionally accept the new
            # session; the caller guard is what binds earlier reasoning.
            unguarded = after.call({"name": "wisp_project_invoke", "arguments": args})
            self.assertEqual(unguarded["structuredContent"]["report"]["report"]["result"]["value"], "2")
            self.assertEqual(unguarded["structuredContent"]["bridge"]["guard_status"], "not_requested")
            adopted = after.call({"name": "wisp_project_invoke", "arguments": {**args, "expected": copy.deepcopy(after.project_guards["pricing"])}})
            self.assertEqual(adopted["structuredContent"]["bridge"]["guard_status"], "matched")

    def test_caller_guard_does_not_bypass_readiness_drift_or_fabricate_error_success(self):
        example = ROOT / "examples" / "policies"
        with tempfile.TemporaryDirectory(prefix="wisp-mcp-guard-ready-") as temp:
            folder = pathlib.Path(temp)
            for name in ["project.json", "reservations-after.wisp", "cases.json"]: (folder / name).write_bytes((example / name).read_bytes())
            server = HOST.Server(BINARY, manifest=folder / "project.json")
            server.handle(HOST.decode_json(json.dumps(initialize()[0]), input_numbers=True)); server.handle(initialize()[1])
            args = {"id": "guarded", "policy": "reservations", "function": "decide", "args": [
                {"quantity": 1, "pack_size": "1", "expires_at": "101"}, {"available": "1", "now": "100"}],
                "expected": copy.deepcopy(server.project_guards["reservations"])}
            typed_error = server.call({"name": "wisp_project_invoke", "arguments": args})
            self.assertEqual(typed_error["structuredContent"]["bridge"]["guard_status"], "matched")
            self.assertEqual(typed_error["structuredContent"]["report"]["status"], "Error")
            self.assertTrue(typed_error["isError"])
            path = folder / "reservations-after.wisp"; path.write_bytes(path.read_bytes() + b"\n")
            drift = server.call({"name": "wisp_project_invoke", "arguments": args})
            self.assertTrue(drift["isError"])
            self.assertEqual(drift["structuredContent"]["bridge"]["guard_status"], "matched")
            self.assertEqual(drift["structuredContent"]["bridge"]["execution"], "unresolved")
            self.assertIsNone(drift["structuredContent"]["report"])

    def test_owner_can_require_caller_guards_without_mutating_other_sessions(self):
        manifest = ROOT / "examples" / "policies" / "project.json"
        strict = HOST.Server(BINARY, manifest=manifest, require_project_guard=True)
        strict.handle(HOST.decode_json(json.dumps(initialize()[0]), input_numbers=True)); strict.handle(initialize()[1])
        metadata = strict.call({"name": "wisp_project_describe", "arguments": {}})
        self.assertTrue(metadata["structuredContent"]["bridge"]["caller_guard_required"])
        self.assertIn("expected", strict.definitions()["wisp_project_invoke"]["inputSchema"]["required"])
        ordinary = HOST.Server(BINARY, manifest=manifest)
        ordinary.handle(HOST.decode_json(json.dumps(initialize()[0]), input_numbers=True)); ordinary.handle(initialize()[1])
        self.assertNotIn("expected", ordinary.definitions()["wisp_project_invoke"]["inputSchema"]["required"])
        args = {"id": "strict", "policy": "reservations", "function": "decide", "args": [
            {"quantity": "1", "pack_size": "1", "expires_at": "101"}, {"available": "1", "now": "100"}]}
        with mock.patch.object(strict.project, "_exchange", side_effect=AssertionError("No unguarded native session")):
            refused = strict.call({"name": "wisp_project_invoke", "arguments": args})
        self.assertTrue(refused["isError"])
        self.assertEqual(refused["structuredContent"]["bridge"]["guard_status"], "rejected")
        self.assertEqual(refused["structuredContent"]["bridge"]["execution"], "not_submitted")
        accepted = strict.call({"name": "wisp_project_invoke", "arguments": {
            **args, "expected": metadata["structuredContent"]["bridge"]["call_guards"]["reservations"]}})
        self.assertFalse(accepted["isError"])
        self.assertEqual(accepted["structuredContent"]["bridge"]["guard_status"], "matched")

    def test_caller_guard_enforcement_requires_an_owner_project(self):
        with self.assertRaises(HOST.ClientError): HOST.Server(BINARY, require_project_guard=True)
        p = subprocess.run([sys.executable, "-B", str(ENTRY), "--require-project-guard", "--wisp", "nonexistent-wisp"],
                           capture_output=True, text=True, timeout=10)
        self.assertEqual(p.returncode, 2)
        self.assertEqual(p.stdout, "")
        self.assertIn("requires --project", p.stderr)
        self.assertNotIn("unavailable", p.stderr)


if __name__ == "__main__":
    unittest.main()
