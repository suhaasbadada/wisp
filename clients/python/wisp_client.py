"""Experimental standard-library client for checked, pinned native Wisp projects."""
import copy
import json
import math
import queue
import re
import subprocess
import threading


class ClientError(Exception):
    """Transport/protocol/configuration failure, not a policy Error/Unknown."""


class JsonNumber:
    """Retain an input JSON number without float loss or Int-string coercion."""
    def __init__(self, token):
        if re.fullmatch(r"-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?", token) is None:
            raise ClientError("Invalid JSON number token")
        self.token = token


def _unique(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise ClientError("Duplicate JSON member")
        value[key] = item
    return value


def _non_json_number(_):
    raise ClientError("Non-JSON number")


def decode_json(text, input_numbers=False):
    options = {"parse_int": JsonNumber, "parse_float": JsonNumber} if input_numbers else {}
    return json.loads(text, object_pairs_hook=_unique, parse_constant=_non_json_number, **options)


def validate_json(value):
    stack = [(value, 0)]
    while stack:
        item, depth = stack.pop()
        if isinstance(item, str):
            try:
                item.encode("utf-8")
            except UnicodeError as error:
                raise ClientError("JSON strings must contain valid Unicode scalars") from error
        elif isinstance(item, (dict, list)):
            if depth >= 64:
                raise ClientError("Host JSON nesting exceeds 64 containers")
            if isinstance(item, dict):
                if any(not isinstance(k, str) for k in item):
                    raise ClientError("JSON object keys must be strings")
                stack.extend((k, depth + 1) for k in item)
                stack.extend((v, depth + 1) for v in item.values())
            else:
                stack.extend((v, depth + 1) for v in item)
        elif isinstance(item, JsonNumber):
            JsonNumber(item.token)
        elif isinstance(item, float):
            _require(math.isfinite(item), "Non-JSON number")
        elif item is not None and not isinstance(item, (int, bool)):
            raise ClientError("Unsupported Python value; JSON arrays must be lists")


def encode_json(value, ascii_strings=False):
    if isinstance(value, JsonNumber):
        # Tokens are public Python objects; recheck before emitting raw syntax.
        JsonNumber(value.token)
        return value.token
    if isinstance(value, dict):
        _require(all(isinstance(k, str) for k in value), "JSON object keys must be strings")
        return "{" + ",".join(json.dumps(k, ensure_ascii=ascii_strings) + ":" + encode_json(v, ascii_strings) for k, v in value.items()) + "}"
    if isinstance(value, list):
        return "[" + ",".join(encode_json(v, ascii_strings) for v in value) + "]"
    _require(value is None or isinstance(value, (str, int, float, bool)),
             "Unsupported Python value; JSON arrays must be lists")
    return json.dumps(value, ensure_ascii=ascii_strings, allow_nan=False)


def run_cli(binary, args, input_text=None, semantic_exit=False, timeout=15):
    try:
        process = subprocess.run([str(binary), *map(str, args)], input=input_text,
                                 text=True, encoding="utf-8", capture_output=True,
                                 timeout=timeout, check=False)
    except (OSError, UnicodeError, subprocess.TimeoutExpired) as error:
        raise ClientError("Wisp transport failed or exceeded its deadline") from error
    if process.returncode not in ({0, 1, 3} if semantic_exit else {0}):
        raise ClientError("Wisp command did not complete normally; inspect it separately")
    return process.stdout


def _require(condition, message):
    if not condition:
        raise ClientError(message)


def _version(value):
    return type(value) is int and value == 1


def _hash(value):
    return isinstance(value, str) and re.fullmatch(r"[0-9a-f]{64}", value) is not None


def _id(value):
    return isinstance(value, str) and re.fullmatch(r"[A-Za-z0-9_-]{1,64}", value) is not None


def _index(items, key):
    _require(isinstance(items, list), "Expected a metadata list")
    result = {}
    for item in items:
        _require(isinstance(item, dict) and isinstance(item.get(key), str) and item[key], "Expected named metadata objects")
        _require(item[key] not in result, "Duplicate metadata identity")
        result[item[key]] = item
    return result


def _type(value, records):
    _require(isinstance(value, dict), "Unsupported type descriptor")
    kind = value.get("kind")
    _require(kind in ["Int", "Bool", "String", "Unit", "Record"], "Unsupported type kind")
    if kind == "Record":
        _require(isinstance(value.get("name"), str) and value["name"] in records, "Unknown record descriptor")
        return value["name"]
    return kind


class ProjectClient:
    """Check interfaces once; validate readiness before submitting each batch.

    A batch is a fresh native session, not a cache or persistent process. Policy
    Error/Unknown are returned as data. ClientError never implies zero execution
    after requests were submitted; callers own action/retry/idempotency policy.
    """
    def __init__(self, manifest, binary="wisp", timeout=15):
        _require(type(timeout) is int and 1 <= timeout <= 300, "Timeout must be 1–300 seconds")
        self._manifest = str(manifest)
        self._binary = str(binary)
        self._timeout = timeout
        try:
            description = decode_json(run_cli(self._binary, ["project", "describe", self._manifest], timeout=timeout))
            validate_json(description)
            _require(isinstance(description, dict) and description.get("status") == "Ready", "Project interface is incomplete")
            project = description["project"]
            _require(_version(project["contract_version"]) and project["mode"] == "describe"
                     and project["phase"] == "described" and project["new_execution"] is False
                     and project["approval"] == "not_granted" and _hash(project["manifest_hash"]), "Unsupported project description")
            policies = _index(project["policies"], "id")
            _require(1 <= len(policies) <= 8 and all(_id(name) for name in policies), "Unsupported policy IDs")
            functions = {}
            for name, policy in policies.items():
                report = policy["report"]
                interface = report["interface"]
                _require(report["status"] == "Ready" and _hash(report["revision"])
                         and _hash(policy["suite_file_hash"]) and isinstance(report["compiler"], str)
                         and report["compiler"] and _version(interface["contract_version"])
                         and interface["phase"] == "described" and interface["new_execution"] is False,
                         "Unsupported checked policy description")
                records = _index(interface["records"], "name")
                for record in records.values():
                    for field in _index(record["fields"], "name").values():
                        _type(field["type"], records)
                functions[name] = _index(interface["functions"], "name")
                for function in functions[name].values():
                    for parameter in _index(function["parameters"], "name").values():
                        _type(parameter["type"], records)
                    _type(function["return_type"], records)
            self._description = copy.deepcopy(description)
            self._policies = copy.deepcopy(policies)
            self._functions = copy.deepcopy(functions)
            self._manifest_hash = project["manifest_hash"]
        except ClientError:
            raise
        except (ValueError, KeyError, TypeError, AttributeError, RecursionError) as error:
            raise ClientError("Malformed project description") from error

    @property
    def description(self):
        return copy.deepcopy(self._description)

    def _ready(self, ready):
        validate_json(ready)
        _require(isinstance(ready, dict) and ready.get("status") == "Ready", "Missing adapter readiness")
        adapter = ready["adapter"]
        _require(_version(adapter["contract_version"]) and adapter["phase"] == "ready"
                 and adapter["new_execution"] is False and adapter["approval"] == "not_granted"
                 and adapter["manifest_hash"] == self._manifest_hash, "Project changed or adapter is incompatible")
        pinned = _index(adapter["policies"], "id")
        _require(set(pinned) == set(self._policies), "Pinned policy IDs differ from discovery")
        for name, policy in self._policies.items():
            _require(pinned[name]["source_revision"] == policy["report"]["revision"]
                     and pinned[name]["suite_file_hash"] == policy["suite_file_hash"], "Project files changed after discovery")

    def _exchange(self, payload):
        # One worker owns all pipe IO. The caller enforces one deadline including
        # readiness and kills/waits its own child on any failure. Readiness is
        # checked BEFORE writing requests, not retroactively after communicate.
        try:
            process = subprocess.Popen([self._binary, "project", "serve", self._manifest],
                                       stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                       stderr=subprocess.PIPE, bufsize=0)
        except OSError as error:
            raise ClientError("Could not start the native adapter") from error
        completed = queue.Queue(maxsize=1)

        def exchange():
            try:
                header = process.stdout.readline(65537)
                _require(len(header) <= 65536 and header.endswith(b"\n"), "Invalid or oversized readiness frame")
                self._ready(decode_json(header.decode("utf-8")))
                output, _ = process.communicate(payload)
                _require(process.returncode == 0, "Adapter transport did not complete normally")
                completed.put((True, output.decode("utf-8")))
            except Exception as error:
                completed.put((False, error))

        worker = threading.Thread(target=exchange, daemon=True)
        worker.start()
        try:
            try:
                success, value = completed.get(timeout=self._timeout)
            except queue.Empty as error:
                raise ClientError("Adapter deadline exceeded; unreceived decisions are unresolved") from error
            if not success:
                if isinstance(value, ClientError):
                    raise value
                raise ClientError("Malformed adapter exchange") from value
            return value
        finally:
            if process.poll() is None:
                process.kill()
            process.wait(timeout=2)
            worker.join(timeout=2)
            _require(not worker.is_alive(), "Adapter IO cleanup did not finish")
            for stream in [process.stdin, process.stdout, process.stderr]:
                if stream is not None:
                    try:
                        stream.close()
                    except OSError:
                        pass

    def call_batch(self, requests):
        try:
            _require(isinstance(requests, list) and 1 <= len(requests) <= 32, "Batch requires 1–32 explicit requests")
            validate_json(requests)
            expected = []
            lines = []
            ids = set()
            for request in requests:
                _require(isinstance(request, dict) and set(request) == {"id", "policy", "function", "args"}, "Expected exact call envelope")
                _require(_id(request["id"]) and request["id"] not in ids and _id(request["policy"]), "Expected unique ASCII request IDs and policy IDs")
                ids.add(request["id"])
                _require(request["policy"] in self._policies and isinstance(request["function"], str)
                         and request["function"] in self._functions[request["policy"]], "Unknown described policy/function")
                line = encode_json(request).encode("utf-8")
                _require(len(line) <= 131072, "Adapter request line exceeds 131072 bytes")
                lines.append(line + b"\n")
                expected.append({key: request[key] for key in ["id", "policy", "function"]})
            output = self._exchange(b"".join(lines))
            _require(output.endswith("\n"), "Truncated adapter response")
            # JSONL means LF only; Unicode U+2028/U+0085 inside data is not framing.
            frames = [decode_json(line) for line in output.split("\n")[:-1]]
            _require(len(frames) == len(expected), "Missing or extra adapter response")
            for request, response in zip(expected, frames):
                validate_json(response)
                _require(isinstance(response, dict), "Expected adapter response object")
                adapter = response["adapter"]
                report = response["report"]
                policy = self._policies[request["policy"]]
                _require(_version(adapter["contract_version"]) and adapter["phase"] == "response"
                         and adapter["approval"] == "not_granted" and adapter["request_id"] == request["id"]
                         and adapter["policy_id"] == request["policy"] and adapter["manifest_hash"] == self._manifest_hash
                         and adapter["source_revision"] == policy["report"]["revision"]
                         and adapter["suite_file_hash"] == policy["suite_file_hash"], "Unmatched adapter response identity")
                _require(isinstance(report, dict) and report["compiler"] == policy["report"]["compiler"]
                         and report["revision"] == policy["report"]["revision"]
                         and report["status"] == response["status"] and response["status"] in ["Complete", "Error", "Unknown"]
                         and report["probes"] == [] and isinstance(report["output"], str)
                         and isinstance(report["diagnostics"], list), "Unexpected core call report")
                invocation = report["invocation"]
                _require(type(invocation["new_execution"]) is bool and type(adapter["new_execution"]) is bool
                         and invocation["new_execution"] == adapter["new_execution"]
                         and invocation["target"] == request["function"], "Unexpected invocation marker")
                if invocation["new_execution"]:
                    _require(_hash(invocation["execution_key"]), "Missing invocation identity")
                if response["status"] == "Complete":
                    target = self._functions[request["policy"]][request["function"]]["return_type"]
                    name = target["name"] if target["kind"] == "Record" else target["kind"]
                    _require(invocation["new_execution"] and report["result"]["type"] == name
                             and "value" in report["result"], "Unexpected completed result boundary")
                else:
                    _require("result" not in report, "Incomplete call must not fabricate a result")
            return frames
        except ClientError:
            raise
        except (OSError, ValueError, KeyError, TypeError, AttributeError, RecursionError, subprocess.TimeoutExpired) as error:
            raise ClientError("Invalid request or malformed adapter report") from error

    def call(self, policy, function, args, request_id):
        return self.call_batch([{"id": request_id, "policy": policy, "function": function, "args": args}])[0]
