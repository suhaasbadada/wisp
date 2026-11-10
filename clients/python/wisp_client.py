"""Experimental standard-library client for checked, pinned native Wisp projects."""
import copy
import hashlib
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
    import time

    # Count wire bytes before decoding. Each reader retains at most its cap and
    # reads only one extra byte to detect overflow, independently of stdin IO.
    deadline = time.monotonic() + timeout
    process = None
    workers = []
    started_workers = []
    completed = queue.Queue(maxsize=3)

    def collect(stream, limit, slot):
        # Fixed capacity avoids bytearray growth over-allocation beyond the cap.
        data = bytearray(limit)
        used = 0
        try:
            while True:
                chunk = stream.read(min(65536, limit - used + 1))
                if not chunk:
                    del data[used:]
                    slot.append(data)
                    completed.put((True, None))
                    return
                if used + len(chunk) > limit:
                    completed.put((False, None))
                    return
                data[used:used + len(chunk)] = chunk
                used += len(chunk)
        except (OSError, ValueError):
            completed.put((False, None))

    def write_input(payload):
        try:
            remaining = memoryview(payload)
            while remaining:
                written = process.stdin.write(remaining[:65536])
                remaining = remaining[written:]
            process.stdin.close()
            completed.put((True, None))
        except BrokenPipeError:
            # Like communicate(), an early child exit may leave unused input.
            completed.put((True, None))
        except (OSError, ValueError):
            completed.put((False, None))

    try:
        payload = input_text.encode("utf-8") if input_text is not None else None
        process = subprocess.Popen([str(binary), *map(str, args)],
                                   stdin=subprocess.PIPE if payload is not None else None,
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE, bufsize=0)
        output = []
        for stream, limit in [(process.stdout, 4194304), (process.stderr, 65536)]:
            # Dedicated result slots preserve stdout/stderr identity regardless
            # of completion order; the queue carries only completion/failure.
            slot = []
            output.append(slot)

            workers.append(threading.Thread(target=collect, args=(stream, limit, slot), daemon=True))
        if payload is not None:
            workers.append(threading.Thread(target=write_input, args=(payload,), daemon=True))
        for worker in workers:
            worker.start()
            started_workers.append(worker)
        for _ in workers:
            success, _ = completed.get(timeout=max(0, deadline - time.monotonic()))
            if not success:
                raise ClientError("Wisp transport failed or exceeded its collection limit")
        process.wait(timeout=max(0, deadline - time.monotonic()))
        if process.returncode not in ({0, 1, 3} if semantic_exit else {0}):
            raise ClientError("Wisp command did not complete normally; inspect it separately")
        output[1][0].decode("utf-8")  # Preserve strict decoding of stderr too.
        return output[0][0].decode("utf-8")
    except (OSError, UnicodeError, subprocess.TimeoutExpired, queue.Empty, RuntimeError):
        raise ClientError("Wisp transport failed or exceeded its deadline") from None
    finally:
        if process is not None:
            try:
                if process.poll() is None:
                    process.kill()
                process.wait(timeout=2)
                cleanup_deadline = time.monotonic() + 2
                for worker in started_workers:
                    worker.join(timeout=max(0, cleanup_deadline - time.monotonic()))
                if any(worker.is_alive() for worker in started_workers):
                    raise ClientError("Wisp transport IO cleanup did not finish")
            except (OSError, subprocess.TimeoutExpired, RuntimeError):
                raise ClientError("Wisp transport IO cleanup did not finish") from None
            finally:
                for stream in [process.stdin, process.stdout, process.stderr]:
                    if stream is not None:
                        stream.close()


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

    def _pins(self, adapter):
        _require(isinstance(adapter, dict) and _version(adapter["contract_version"])
                 and adapter["approval"] == "not_granted"
                 and adapter["manifest_hash"] == self._manifest_hash, "Project changed or adapter is incompatible")
        pinned = _index(adapter["policies"], "id")
        _require(set(pinned) == set(self._policies), "Pinned policy IDs differ from discovery")
        for name, policy in self._policies.items():
            _require(pinned[name]["source_revision"] == policy["report"]["revision"]
                     and pinned[name]["suite_file_hash"] == policy["suite_file_hash"], "Project files changed after discovery")

    def _ready(self, ready):
        validate_json(ready)
        _require(isinstance(ready, dict) and ready.get("status") == "Ready", "Missing adapter readiness")
        adapter = ready["adapter"]
        _require(isinstance(adapter, dict) and adapter["phase"] == "ready" and adapter["new_execution"] is False,
                 "Project changed or adapter is incompatible")
        self._pins(adapter)

    def focus(self, policy, function, budget=4096):
        """Read bounded Agent View text from a guarded native project snapshot.

        This analyzes retained source without evaluation. The text budget does
        not cover the surrounding graph/identity metadata or guarantee relevance.
        """
        try:
            _require(_id(policy) and policy in self._policies and isinstance(function, str)
                     and function in self._functions[policy], "Unknown described policy/function")
            _require(type(budget) is int and 0 <= budget <= 65536, "Focus budget must be 0–65536 bytes")
            described = self._policies[policy]
            raw = run_cli(self._binary, ["project", "focus", self._manifest, policy, function, "--budget", str(budget),
                                        "--expected-manifest", self._manifest_hash,
                                        "--expected-revision", described["report"]["revision"],
                                        "--expected-suite", described["suite_file_hash"],
                                        "--expected-compiler", described["report"]["compiler"]], semantic_exit=True, timeout=self._timeout)
            _require(len(raw.encode("utf-8")) <= 4194304, "Focus report exceeds 4 MiB")
            response = decode_json(raw); validate_json(response)
            _require(isinstance(response, dict), "Expected native project focus report")
            project = response["project"]; report = response["report"]
            self._pins(project)
            _require(project["mode"] == "focus" and project["phase"] == "focused"
                     and project["new_execution"] is False and project["guard_status"] == "matched"
                     and project["policy_id"] == policy and project["source_revision"] == described["report"]["revision"]
                     and project["suite_file_hash"] == described["suite_file_hash"], "Unmatched project focus snapshot")
            _require(isinstance(report, dict) and response["status"] == report["status"]
                     and report["status"] in ["Ready", "Error", "Unknown"]
                     and report["compiler"] == described["report"]["compiler"]
                     and report["revision"] == described["report"]["revision"]
                     and isinstance(report["diagnostics"], list)
                     and report["probes"] == [] and report["output"] == "" and "usage" not in report
                     and "invocation" not in report and "result" not in report
                     and response["output"] == "" and response["diagnostics"] == [], "Unexpected non-executing focus report")
            if report["status"] == "Ready":
                view = report["agent_view"]
                _require(view["focus"] == function and type(view["budget_bytes"]) is int and view["budget_bytes"] == budget
                         and type(view["used_bytes"]) is int and isinstance(view["text"], str)
                         and type(view["required_bytes"]) is int and view["required_bytes"] >= view["used_bytes"]
                         and type(view["overflow"]) is bool and view["overflow"] == (view["required_bytes"] > budget)
                         and view["overflow"] == (view["used_bytes"] < view["required_bytes"])
                         and len(view["text"].encode("utf-8")) == view["used_bytes"] <= budget,
                         "Unexpected Agent View text budget")
            return response
        except ClientError:
            raise
        except (OSError, ValueError, KeyError, TypeError, AttributeError, RecursionError) as error:
            raise ClientError("Invalid focus request or malformed native focus report") from error

    def verify(self, policy):
        """Execute one saved policy's finite caller-owned suite under pinned guards.

        This is not whole-project verification or approval. A lost/malformed
        response can follow execution; callers must not infer zero execution.
        """
        try:
            _require(_id(policy) and policy in self._policies, "Unknown described policy")
            described = self._policies[policy]
            raw = run_cli(self._binary, ["project", "verify-policy", self._manifest, policy,
                                        "--expected-manifest", self._manifest_hash,
                                        "--expected-revision", described["report"]["revision"],
                                        "--expected-suite", described["suite_file_hash"],
                                        "--expected-compiler", described["report"]["compiler"]], semantic_exit=True, timeout=self._timeout)
            response = decode_json(raw); validate_json(response)
            _require(isinstance(response, dict), "Expected native saved-policy verification report")
            project = response["project"]; report = response["report"]
            self._pins(project)
            _require(project["mode"] == "verify-policy" and project["phase"] == "verified"
                     and project["guard_status"] == "matched" and project["policy_id"] == policy
                     and project["source_revision"] == described["report"]["revision"]
                     and project["suite_file_hash"] == described["suite_file_hash"], "Unmatched saved-policy snapshot")
            _require(isinstance(report, dict) and response["status"] == report["status"]
                     and report["status"] in ["Pass", "Fail", "Error", "Unknown"]
                     and report["compiler"] == described["report"]["compiler"]
                     and report["revision"] == described["report"]["revision"]
                     and report["probes"] == [] and report["output"] == "" and "usage" not in report
                     and "invocation" not in report and "result" not in report
                     and response["output"] == "" and response["diagnostics"] == []
                     and isinstance(report["diagnostics"], list), "Unexpected saved-policy verification report")
            review = report["review"]
            _require(_version(review["contract_version"]) and review["approval"] == "not_granted"
                     and review["baseline_revision"] == described["report"]["revision"]
                     and review["candidate_revision"] == described["report"]["revision"]
                     and _hash(review["suite_hash"]) and _hash(review["query_key"])
                     and type(review["new_execution"]) is bool and type(project["new_execution"]) is bool
                     and project["new_execution"] == review["new_execution"]
                     and isinstance(review["cases"], list), "Unrecognized saved-suite evidence")
            if review["phase"] == "preflight":
                _require(report["status"] in ["Error", "Unknown"] and not review["new_execution"]
                         and review["cases"] == [] and "summary" not in review, "Invalid verification preflight")
            else:
                summary = review["summary"]
                _require(review["phase"] == "executed" and review["new_execution"]
                         and type(summary["total"]) is int and 1 <= summary["total"] <= 16
                         and summary["total"] == len(review["cases"])
                         and type(summary["attempted_invocations"]) is int
                         and summary["attempted_invocations"] == 2 * summary["total"], "Invalid finite-suite execution ledger")
                if report["status"] == "Pass":
                    _require(type(summary["expectation_pass"]) is int and summary["expectation_pass"] == summary["total"]
                             and all(isinstance(case, dict) and case["expectation"] == "Pass" for case in review["cases"]),
                             "Pass requires passing finite expectations")
            return response
        except ClientError:
            raise
        except (OSError, ValueError, KeyError, TypeError, AttributeError, RecursionError) as error:
            raise ClientError("Invalid verification request or malformed native verification report") from error

    def prepare_edit(self, policy, function, expected_body_hash, replacement):
        """Prepare a guarded saved body without applying or executing it.

        The full proposed source is returned; it is not case verification or
        approval. No path/source override or persistent write is performed.
        """
        try:
            _require(_id(policy) and policy in self._policies and isinstance(function, str)
                     and function in self._functions[policy], "Unknown described policy/function")
            _require(_hash(expected_body_hash) and isinstance(replacement, str), "Expected body hash and replacement text")
            validate_json(replacement)
            replacement_bytes = replacement.encode("utf-8")
            _require(len(replacement_bytes) <= 65536, "Replacement exceeds 65536 UTF-8 bytes")
            described = self._policies[policy]
            raw = run_cli(self._binary, ["project", "prepare-edit", self._manifest, policy, function,
                "--expected-body", expected_body_hash, "--replacement-file", "-",
                "--expected-manifest", self._manifest_hash, "--expected-revision", described["report"]["revision"],
                "--expected-suite", described["suite_file_hash"], "--expected-compiler", described["report"]["compiler"]],
                input_text=replacement, semantic_exit=True, timeout=self._timeout)
            response = decode_json(raw); validate_json(response)
            project = response["project"]; report = response["report"]
            self._pins(project)
            _require(project["mode"] == "prepare-edit" and project["phase"] == "prepared"
                     and project["guard_status"] == "matched" and project["new_execution"] is False
                     and project["policy_id"] == policy and project["source_revision"] == described["report"]["revision"]
                     and project["suite_file_hash"] == described["suite_file_hash"], "Unmatched saved edit snapshot")
            _require(isinstance(report, dict) and response["status"] == report["status"]
                     and report["status"] in ["Ready", "Error", "Unknown"]
                     and report["compiler"] == described["report"]["compiler"] and report["revision"] == described["report"]["revision"]
                     and report["new_execution"] is False and report["output"] == "" and report["probes"] == []
                     and all(key not in report for key in ["usage", "review", "invocation", "result"])
                     and response["output"] == "" and response["diagnostics"] == []
                     and isinstance(report["diagnostics"], list), "Unexpected non-executing edit report")
            edit = report.get("edit", {})
            if report["status"] == "Ready":
                _require(_version(edit["version"]) and edit["state"] == "prepared" and edit["target"] == function
                         and edit["base_revision"] == described["report"]["revision"]
                         and edit["base_body_hash"] == expected_body_hash and isinstance(edit["source"], str), "Unrecognized prepared candidate")
                candidate = edit["source"].encode("utf-8")
                _require(len(candidate) <= 65536 and edit["candidate_revision"] == hashlib.sha256(candidate).hexdigest(),
                         "Prepared candidate identity differs")
                for key in ["candidate_body_span", "insertion_range"]:
                    span = edit[key]
                    _require(type(span["start"]) is int and type(span["end"]) is int
                             and 0 <= span["start"] <= span["end"] <= len(candidate), "Invalid candidate byte range")
                body = edit["candidate_body_span"]; insertion = edit["insertion_range"]
                _require(edit["candidate_body_hash"] == hashlib.sha256(candidate[body["start"]:body["end"]]).hexdigest()
                         and insertion["start"] <= body["start"] <= body["end"] <= insertion["end"]
                         and candidate[insertion["start"]:insertion["end"]] == replacement_bytes,
                         "Prepared body or replacement differs")
                _require(all(edit["preservation"][key] is True for key in
                             ["checked", "prefix", "suffix", "signature", "records", "other_functions", "top_level_statements"]),
                         "Missing native preservation audit")
                probes = edit["preservation"]["probes"]
                _require(isinstance(probes, list) and all(isinstance(p, dict) and type(p["index"]) is int and p["index"] == index
                         and _hash(p["predicate_key"]) and p["text_preserved"] is True and p["domain_preserved"] is True
                         for index, p in enumerate(probes)), "Invalid native probe preservation audit")
            else:
                _require(isinstance(edit, dict) and "source" not in edit, "Rejected edit must not expose an accepted candidate")
            return response
        except ClientError:
            raise
        except (OSError, ValueError, KeyError, TypeError, AttributeError, RecursionError) as error:
            raise ClientError("Invalid edit request or malformed native preparation report") from error

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
