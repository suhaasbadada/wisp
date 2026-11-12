"""Native and malformed-peer checks for the experimental source-local client."""
import copy
import json
import pathlib
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "clients" / "python"))
import wisp_client as CLIENT

BINARY = str(ROOT / "target" / "debug" / "wisp")
MANIFEST = ROOT / "examples" / "policies" / "project.json"
REQUEST = {"id": "sample", "policy": "reservations", "function": "decide",
           "args": [{"quantity": "4", "pack_size": "3", "expires_at": "101"},
                    {"available": "8", "now": "100"}]}


class PythonClient(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.description = json.loads(CLIENT.run_cli(BINARY, ["project", "describe", MANIFEST]))
        raw = CLIENT.run_cli(BINARY, ["project", "serve", MANIFEST], CLIENT.encode_json(REQUEST) + "\n")
        cls.ready, cls.response = [json.loads(line) for line in raw.split("\n")[:-1]]

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="wisp-client-")
        self.addCleanup(self.temp.cleanup)
        self.path = pathlib.Path(self.temp.name)

    def client(self, **kw):
        return CLIENT.ProjectClient(MANIFEST, binary=BINARY, **kw)

    def peer(self, body):
        """A local test executable, never language-controlled host execution."""
        path = self.path / "peer"
        path.write_text("#!" + sys.executable + "\nimport sys,json,time,pathlib,os\n"
                        + "if sys.argv[2]=='describe':\n print(" + repr(json.dumps(self.description)) + ");sys.exit(0)\n"
                        + body)
        path.chmod(0o700)
        return str(path)

    def test_native_complete_error_unknown_and_later_success_are_data(self):
        client = self.client()
        good = client.call_batch([REQUEST])[0]
        self.assertEqual(good["status"], "Complete")
        self.assertEqual(good["report"]["result"]["value"]["packs"], "2")
        bad = copy.deepcopy(REQUEST); bad["args"][0]["quantity"] = CLIENT.JsonNumber("1e400")
        peer = {**REQUEST, "id": "later"}
        frames = client.call_batch([bad, peer])
        self.assertEqual([r["status"] for r in frames], ["Error", "Complete"])
        self.assertEqual(frames[0]["report"]["diagnostics"][0]["code"], "E_INPUT_TYPE")
        self.assertFalse(frames[0]["adapter"]["new_execution"])
        # A real bounded recursive policy yields Unknown without a client error.
        (self.path / "loop.wisp").write_text('fn spin() -> Int { spin() }\n')
        (self.path / "cases.json").write_text('{}')
        manifest = self.path / "project.json"
        manifest.write_text(json.dumps({"version": 1, "policies": [
            {"id": "loop", "source": "loop.wisp", "suite": "cases.json"}]}))
        loop = CLIENT.ProjectClient(manifest, binary=BINARY)
        self.assertEqual(loop.call("loop", "spin", [], "loop")["status"], "Unknown")

    def test_defensive_metadata_and_request_preflight(self):
        client = self.client()
        public = client.description; public["project"]["policies"].clear()
        self.assertTrue(client.description["project"]["policies"])
        variants = [[], [REQUEST] * 33, [REQUEST, REQUEST], [{**REQUEST, "id": "é"}],
                    [{**REQUEST, "extra": 1}], [{**REQUEST, "function": "absent"}],
                    [{**REQUEST, "policy": "absent"}], [{**REQUEST, "args": ["\ud800"]}],
                    [{**REQUEST, "args": ["x" * 131073]}]]
        with mock.patch.object(client, "_exchange", side_effect=AssertionError("No session")):
            for requests in variants:
                with self.subTest(requests=str(requests)[:80]):
                    with self.assertRaises(CLIENT.ClientError): client.call_batch(requests)
        for timeout in [True, 0, 301, 1.5]:
            with self.assertRaises(CLIENT.ClientError): self.client(timeout=timeout)

    def test_native_list_interface_and_nested_list_result_boundary(self):
        (self.path / "rows.wisp").write_text(
            'record Row { values:[Int], text:String } fn echo(rows:[[Row]])->[[Row]] {rows}')
        (self.path / "cases.json").write_text('{}')
        manifest = self.path / "project.json"
        manifest.write_text(json.dumps({"version": 1, "policies": [
            {"id": "rows", "source": "rows.wisp", "suite": "cases.json"}]}))
        client = CLIENT.ProjectClient(manifest, binary=BINARY)
        value = [[{"values": ["1", "9223372036854775807"], "text": "界\0"}], []]
        response = client.call("rows", "echo", [value], "list-roundtrip")
        self.assertEqual(response["status"], "Complete")
        self.assertEqual(response["report"]["result"], {"type": "[[Row]]", "value": value})
        bad = client.call("rows", "echo", [[[dict(values=[True], text="x")]]], "bad-element")
        self.assertEqual(bad["status"], "Error")
        self.assertFalse(bad["report"]["invocation"]["new_execution"])
        self.assertEqual(bad["report"]["diagnostics"][0]["path"], "/args/0/0/0/values/0")

    def test_readiness_drift_prevents_any_request_write(self):
        ready = copy.deepcopy(self.ready); ready["adapter"]["manifest_hash"] = "0" * 64
        marker = self.path / "received"
        binary = self.peer("print(" + repr(json.dumps(ready)) + ",flush=True)\n"
                           + "data=sys.stdin.buffer.read()\npathlib.Path(" + repr(str(marker)) + ").write_bytes(data)\n")
        client = CLIENT.ProjectClient(MANIFEST, binary=binary)
        processes = []; original = subprocess.Popen
        def capture(*args, **kw):
            child = original(*args, **kw)
            child.communicate = mock.Mock(wraps=child.communicate)
            processes.append(child)
            return child
        with mock.patch.object(CLIENT.subprocess, "Popen", side_effect=capture):
            with self.assertRaisesRegex(CLIENT.ClientError, "changed"):
                client.call_batch([REQUEST])
        self.assertTrue(all(p.poll() is not None for p in processes))
        for process in processes:
            process.communicate.assert_not_called()
        self.assertFalse(marker.exists())

    def test_malformed_readiness_and_response_fail_closed(self):
        client = self.client()
        for raw in ["", "{}", "{}\n", json.dumps(self.response), json.dumps(self.response) + "\n{}\n"]:
            with mock.patch.object(client, "_exchange", return_value=raw):
                with self.assertRaises(CLIENT.ClientError): client.call_batch([REQUEST])
        variants = []
        for section, key, value in [("adapter", "request_id", "other"), ("adapter", "contract_version", True),
                                    ("adapter", "suite_file_hash", "0" * 64), ("report", "compiler", "other"),
                                    ("report", "status", "Unknown")]:
            response = copy.deepcopy(self.response); response[section][key] = value; variants.append(response)
        response = copy.deepcopy(self.response); response["report"]["invocation"]["target"] = "other"; variants.append(response)
        response = copy.deepcopy(self.response); response["report"]["result"]["type"] = "Int"; variants.append(response)
        for response in variants:
            with mock.patch.object(client, "_exchange", return_value=json.dumps(response) + "\n"):
                with self.assertRaises(CLIENT.ClientError): client.call_batch([REQUEST])
        for ready in [{}, {"status": "Error"}, {**self.ready, "adapter": []}]:
            binary = self.peer("print(" + repr(json.dumps(ready)) + ",flush=True)\ntime.sleep(10)\n")
            with self.assertRaises(CLIENT.ClientError):
                CLIENT.ProjectClient(MANIFEST, binary=binary, timeout=1).call_batch([REQUEST])

    def test_lf_only_framing_preserves_unicode_line_characters(self):
        response = copy.deepcopy(self.response)
        response["report"]["output"] = "a\u2028b\u0085c"
        body = ("print(" + repr(json.dumps(self.ready)) + ",flush=True)\n"
                + "sys.stdin.buffer.read()\nprint(" + repr(json.dumps(response, ensure_ascii=False)) + ",flush=True)\n")
        client = CLIENT.ProjectClient(MANIFEST, binary=self.peer(body))
        self.assertEqual(client.call_batch([REQUEST])[0]["report"]["output"], "a\u2028b\u0085c")

    def test_deadline_reaps_child_and_io_thread(self):
        for body in ["time.sleep(20)\n", "print(" + repr(json.dumps(self.ready)) + ",flush=True)\ntime.sleep(20)\n"]:
            client = CLIENT.ProjectClient(MANIFEST, binary=self.peer(body), timeout=1)
            children = []; original = subprocess.Popen
            def capture(*args, **kw):
                child = original(*args, **kw); children.append(child); return child
            threads = set(threading.enumerate()); start = time.monotonic()
            with mock.patch.object(CLIENT.subprocess, "Popen", side_effect=capture):
                with self.assertRaisesRegex(CLIENT.ClientError, "deadline"):
                    client.call_batch([REQUEST])
            self.assertLess(time.monotonic() - start, 5)
            self.assertTrue(all(p.poll() is not None for p in children))
            self.assertFalse(set(threading.enumerate()) - threads)

    def test_description_rejects_malformed_and_duplicate_identities(self):
        variants = [[], {}, {**self.description, "status": "Unknown"}]
        for key, value in [("contract_version", True), ("manifest_hash", "invalid")]:
            d = copy.deepcopy(self.description); d["project"][key] = value; variants.append(d)
        d = copy.deepcopy(self.description); d["project"]["policies"] *= 2; variants.append(d)
        d = copy.deepcopy(self.description)
        d["project"]["policies"][0]["report"]["interface"]["functions"][0]["return_type"] = {"kind": "Future"}
        variants.append(d)
        for description in variants:
            with mock.patch.object(CLIENT, "run_cli", return_value=json.dumps(description)):
                with self.assertRaises(CLIENT.ClientError): self.client()

    def test_lossless_json_and_duplicate_unicode_boundaries(self):
        raw = '{"huge":1e400,"negative":-0,"integer":9223372036854775808}'
        self.assertEqual(CLIENT.encode_json(CLIENT.decode_json(raw, input_numbers=True)), raw)
        for text in ['{"a":1,"\\u0061":2}', '[NaN]', '[Infinity]']:
            with self.assertRaises(CLIENT.ClientError): CLIENT.decode_json(text, input_numbers=True)
        for value in [{"\ud800": "x"}, ["\udfff"], {1: "not-a-string-key"}]:
            with self.assertRaises(CLIENT.ClientError): CLIENT.validate_json(value)
        number = CLIENT.JsonNumber("1"); number.token = '1}\n{"id":"injected"'
        with self.assertRaises(CLIENT.ClientError): CLIENT.encode_json(number)

    def test_unsupported_python_values_never_bypass_request_preflight(self):
        client = self.client()
        nested = "value"
        for _ in range(65): nested = (nested,)
        values = [nested, ({1: "coerced-key"},), {1: "key"}, ("tuple",),
                  {"a", "set"}, b"bytes", float("inf"), float("nan"), object()]
        with mock.patch.object(client, "_exchange", side_effect=AssertionError("No submission")) as exchange:
            for value in values:
                with self.subTest(kind=type(value).__name__):
                    with self.assertRaises(CLIENT.ClientError):
                        client.call_batch([{**REQUEST, "args": value}])
            exchange.assert_not_called()
        for value in [({1: "key"},), {1: "key"}, b"bytes"]:
            with self.assertRaises(CLIENT.ClientError): CLIENT.encode_json(value)


if __name__ == "__main__":
    unittest.main()
