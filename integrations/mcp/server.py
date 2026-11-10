"""Experimental local MCP stdio transport; every language operation is native Rust."""
import argparse
import copy
import pathlib
import re
import shutil
import signal
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "clients" / "python"))
from wisp_client import ClientError, JsonNumber, ProjectClient, decode_json, encode_json, run_cli, validate_json

PROTOCOL = "2025-11-25"
FRAME_BYTES = 1048576
REPORT_BYTES = 4194304
MAX_MESSAGES = 4096
MAX_CALLS = 1024


def schema(properties, required):
    return {"type": "object", "properties": properties, "required": required, "additionalProperties": False}


SOURCE = {"type": "string", "description": "Wisp source text, checked by Rust; default source limit is 65536 UTF-8 bytes."}
GUARD_HASHES = ["manifest_hash", "source_revision", "suite_file_hash"]
GUARD_FIELDS = ["policy_id", *GUARD_HASHES, "compiler"]
EXPECTED_GUARD = schema({"policy_id": {"type": "string", "pattern": "^[A-Za-z0-9_-]{1,64}$"},
                         **{key: {"type": "string", "pattern": "^[0-9a-f]{64}$"} for key in GUARD_HASHES},
                         "compiler": {"type": "string", "minLength": 1}}, GUARD_FIELDS)
TOOLS = [
    {"name": "wisp_capabilities", "description": "Discover the actual native compiler, language operations, limits and diagnostic codes. Does not execute policy code.",
     "inputSchema": schema({}, [])},
    {"name": "wisp_check", "description": "Check a whole Wisp program without execution. Ready is not behavioral correctness or proof.",
     "inputSchema": schema({"source": SOURCE}, ["source"])},
    {"name": "wisp_describe", "description": "Get Rust-checked function and record JSON interfaces without executing policy code.",
     "inputSchema": schema({"source": SOURCE}, ["source"])},
    {"name": "wisp_invoke", "description": "Invoke one typed function through Rust. Ints must be canonical decimal strings. Captured output is data; Error/Unknown is not success. Does not execute top-level code/probes.",
     "inputSchema": schema({"source": SOURCE, "function": {"type": "string"}, "args": {"type": "array", "items": {}}},
                           ["source", "function", "args"])},
    {"name": "wisp_review", "description": "Compare checked baseline/candidate source against caller-owned finite typed cases. Pass is not approval; no source, suite or file is written.",
     "inputSchema": schema({"source": SOURCE, "candidate": SOURCE, "suite": {"type": "object"}}, ["source", "candidate", "suite"])},
    {"name": "wisp_context", "description": "Get bounded compiler-derived context for one probe. No execution or completeness/relevance guarantee; inspect omissions and overflow.",
     "inputSchema": schema({"source": SOURCE, "focus": {"type": "string", "default": "probe:0"},
                            "budget": {"type": "integer", "minimum": 0, "maximum": 65536, "default": 4096}}, ["source"])},
    {"name": "wisp_prepare_edit", "description": "Prepare one guarded function body through Rust without execution. Copy the compiler-derived revision and selected function graph body_hash from wisp_check. Ready means a typed/source-checked candidate only, not case Pass or approval. No original source or file is changed.",
     "inputSchema": schema({"source": SOURCE, "function": {"type": "string"},
                             "expected_revision": {"type": "string", "pattern": "^[0-9a-f]{64}$"},
                             "expected_body_hash": {"type": "string", "pattern": "^[0-9a-f]{64}$"},
                             "replacement": {"type": "string", "description": "Replacement function body block; maximum 65536 UTF-8 bytes, enforced by Rust."}},
                            ["source", "function", "expected_revision", "expected_body_hash", "replacement"])},
]
PROJECT_TOOLS = [
    {"name": "wisp_project_describe", "description": "Get checked callable metadata pinned at initialization for the owner-configured project. Not suite verification or a live filesystem rescan.",
     "inputSchema": schema({}, [])},
    {"name": "wisp_project_invoke", "description": "Call one function in the owner-configured project without resending source. Copy the selected policy's call_guards from project discovery into optional expected to bind the revision you reasoned about across reconnects. Without expected only server/session pins apply. No agent-selected files or approval.",
     "inputSchema": schema({"id": {"type": "string", "pattern": "^[A-Za-z0-9_-]{1,64}$"},
                            "policy": {"type": "string", "pattern": "^[A-Za-z0-9_-]{1,64}$"},
                            "function": {"type": "string"}, "args": {"type": "array", "items": {}}, "expected": EXPECTED_GUARD},
                           ["id", "policy", "function", "args"])},
    {"name": "wisp_project_focus", "description": "Read bounded compiler-derived Agent View text for a declared function in the owner-configured project, without source input or policy execution. Copy discovery call_guards into expected for caller revision binding. Inspect omissions/overflow; graph metadata is outside the text budget, and context is not guaranteed relevant or complete.",
     "inputSchema": schema({"policy": {"type": "string", "pattern": "^[A-Za-z0-9_-]{1,64}$"},
                            "function": {"type": "string"}, "budget": {"type": "integer", "minimum": 0, "maximum": 65536, "default": 4096},
                            "expected": EXPECTED_GUARD}, ["policy", "function"])},
    {"name": "wisp_project_verify", "description": "Execute one saved policy's finite caller-owned case suite under project pins. No agent-selected paths, source or expectation overrides. Copy discovery call_guards into expected for caller revision binding. Pass is finite case evidence, not whole-project verification, proof or approval. Error/Unknown/Fail are not success.",
     "inputSchema": schema({"policy": {"type": "string", "pattern": "^[A-Za-z0-9_-]{1,64}$"}, "expected": EXPECTED_GUARD}, ["policy"])},
]
GUARDED_PROJECT_TOOLS = {"wisp_project_invoke", "wisp_project_focus", "wisp_project_verify"}
for tool in TOOLS + PROJECT_TOOLS:
    tool["annotations"] = {"readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False}
    tool["execution"] = {"taskSupport": "forbidden"}
DEFINITIONS = {tool["name"]: tool for tool in TOOLS}
PROJECT_DEFINITIONS = {tool["name"]: tool for tool in PROJECT_TOOLS}
OPERATIONS = {"wisp_capabilities": "capabilities", "wisp_check": "analyze", "wisp_describe": "describe",
              "wisp_invoke": "call", "wisp_review": "review", "wisp_context": "context", "wisp_prepare_edit": "edit"}


class ProtocolError(Exception):
    def __init__(self, code, message):
        self.code = code
        self.message = message


def require(condition, code, message):
    if not condition:
        raise ProtocolError(code, message)


def request_id(value):
    if isinstance(value, str):
        return len(value.encode("utf-8")) <= 256
    return isinstance(value, JsonNumber) and re.fullmatch(r"-?(?:0|[1-9][0-9]{0,63})", value.token) is not None


def error(identifier, code, message):
    return {"jsonrpc": "2.0", "id": identifier, "error": {"code": code, "message": message}}


def tool_result(report=None, message=None, execution="see_native_report", guard_status=None, call_guards=None, caller_guard_required=None):
    bridge = {"contract_version": 1, "status": "Error" if message else "Complete", "approval": "not_granted", "execution": execution}
    if message:
        bridge["message"] = message
    if guard_status is not None:
        bridge["guard_status"] = guard_status
    if call_guards is not None:
        bridge["call_guards"] = copy.deepcopy(call_guards)
    if caller_guard_required is not None:
        bridge["caller_guard_required"] = caller_guard_required
    data = {"bridge": bridge, "report": report}
    return {"content": [{"type": "text", "text": encode_json(data, ascii_strings=True)}],
            "structuredContent": data, "isError": bool(message) or report["status"] in {"Error", "Unknown", "Fail"}}


class Server:
    def __init__(self, binary, manifest=None, require_project_guard=False):
        if type(require_project_guard) is not bool or (require_project_guard and manifest is None):
            raise ClientError("Caller-guard enforcement requires an owner-configured project")
        self.binary = str(binary)
        self.phase = "new"
        self.compiler = None
        self.calls = 0
        self.manifest = manifest
        self.project = None
        self.project_targets = {}
        self.project_guards = {}
        self.require_project_guard = require_project_guard

    def definitions(self):
        definitions = {**DEFINITIONS, **PROJECT_DEFINITIONS} if self.project is not None else DEFINITIONS
        if self.require_project_guard and self.project is not None:
            for name in GUARDED_PROJECT_TOOLS:
                definitions[name] = copy.deepcopy(definitions[name])
                definitions[name]["inputSchema"]["required"].append("expected")
        return definitions

    def native(self, request):
        payload = encode_json(request)
        if len(payload.encode("utf-8")) > FRAME_BYTES:
            raise ClientError("Native request exceeds 1 MiB")
        raw = run_cli(self.binary, ["--json"], input_text=payload, timeout=15)
        if len(raw.encode("utf-8")) > REPORT_BYTES:
            raise ClientError("Native report exceeds the 4 MiB bridge output bound")
        report = decode_json(raw)
        validate_json(report)
        if (not isinstance(report, dict) or not isinstance(report.get("compiler"), str) or not report["compiler"]
                or not isinstance(report.get("status"), str)
                or report["status"] not in {"Ready", "Complete", "Pass", "Fail", "Error", "Unknown"}
                or (self.compiler is not None and report["compiler"] != self.compiler)):
            raise ClientError("Unrecognized or changed native compiler report")
        return report

    def call(self, params):
        require(isinstance(params, dict) and set(params) <= {"name", "arguments", "_meta"}
                and isinstance(params.get("name"), str), -32602, "Expected tools/call name and arguments")
        name = params["name"]
        definitions = self.definitions()
        require(name in definitions, -32602, "Unknown Wisp tool")
        if "_meta" in params:
            require(isinstance(params["_meta"], dict), -32602, "Expected object _meta")
        arguments = params.get("arguments", {})
        definition = definitions[name]["inputSchema"]
        guard_status = "rejected" if name in GUARDED_PROJECT_TOOLS and self.require_project_guard else None
        try:
            if (not isinstance(arguments, dict) or not set(definition["required"]) <= set(arguments)
                    or not set(arguments) <= set(definition["properties"])):
                raise ClientError("Tool arguments must match its exact object schema")
            for key, value in arguments.items():
                kind = definition["properties"][key]["type"]
                if ((kind == "string" and not isinstance(value, str))
                        or (kind == "array" and not isinstance(value, list))
                        or (kind == "object" and not isinstance(value, dict))):
                    raise ClientError("Tool argument has the wrong JSON boundary type")
                pattern = definition["properties"][key].get("pattern")
                if pattern is not None and re.fullmatch(pattern, value) is None:
                    if key in {"expected_revision", "expected_body_hash"}:
                        raise ClientError("Edit guards must be 64 lowercase hexadecimal characters")
                    raise ClientError("Project and request IDs must be bounded ASCII identities")
                if kind == "integer" and (not isinstance(value, JsonNumber)
                        or re.fullmatch(r"(?:0|[1-9][0-9]{0,4})", value.token) is None or int(value.token) > 65536):
                    raise ClientError("Context budget must be an integer from 0 to 65536")
            if self.calls >= MAX_CALLS:
                raise ClientError("Session tool-call quota exhausted; start a new session explicitly")
            if name in GUARDED_PROJECT_TOOLS and (arguments["policy"] not in self.project_targets
                    or (name != "wisp_project_verify" and arguments["function"] not in self.project_targets[arguments["policy"]])):
                raise ClientError("Unknown described project policy/function")
            if name in GUARDED_PROJECT_TOOLS:
                guard_status = "not_requested"
                if "expected" in arguments:
                    guard_status = "rejected"
                    expected = arguments["expected"]
                    if (set(expected) != set(GUARD_FIELDS) or any(not isinstance(expected[key], str) for key in GUARD_FIELDS)
                            or re.fullmatch(r"[A-Za-z0-9_-]{1,64}", expected["policy_id"]) is None
                            or any(re.fullmatch(r"[0-9a-f]{64}", expected[key]) is None for key in GUARD_HASHES)
                            or not expected["compiler"]):
                        raise ClientError("Expected an exact policy/compiler/manifest/source/suite guard object")
                    if expected != self.project_guards[arguments["policy"]]:
                        raise ClientError("Expected project snapshot differs from this session; no request submitted")
                    guard_status = "matched"
        except ClientError as failure:
            return tool_result(message=str(failure), execution="not_submitted", guard_status=guard_status)
        self.calls += 1
        try:
            if name in PROJECT_DEFINITIONS:
                if name == "wisp_project_describe":
                    report = self.project.description
                    execution = "initialization_metadata"
                elif name == "wisp_project_focus":
                    budget = arguments.get("budget", 4096)
                    budget = int(budget.token) if isinstance(budget, JsonNumber) else budget
                    report = self.project.focus(arguments["policy"], arguments["function"], budget=budget)
                    execution = "see_native_report"
                elif name == "wisp_project_verify":
                    report = self.project.verify(arguments["policy"])
                    execution = "see_native_report"
                else:
                    report = self.project.call(arguments["policy"], arguments["function"], arguments["args"], arguments["id"])
                    execution = "see_native_report"
                if len(encode_json(report).encode("utf-8")) > REPORT_BYTES:
                    raise ClientError("Project report exceeds the bridge output bound")
                return tool_result(report, execution=execution, guard_status=guard_status,
                                   call_guards=self.project_guards if name == "wisp_project_describe" else None,
                                   caller_guard_required=self.require_project_guard if name == "wisp_project_describe" else None)
            request = {"op": OPERATIONS[name], "source": "", **arguments}
            if name == "wisp_prepare_edit":
                request = {"op": "edit", "source": arguments["source"], "focus": arguments["function"],
                           "change": {key: arguments[key] for key in ["expected_revision", "expected_body_hash", "replacement"]}}
            return tool_result(self.native(request))
        except (ClientError, OSError, ValueError, TypeError, KeyError, RecursionError):
            # Never expose process stderr, command environment or credentials.
            # A submitted request may have executed even without a valid result.
            return tool_result(message="Native transport/report failed; unreceived outcomes are unresolved", execution="unresolved", guard_status=guard_status)

    def handle(self, value):
        identifier = None
        notification = False
        try:
            require(isinstance(value, dict) and value.get("jsonrpc") == "2.0" and isinstance(value.get("method"), str)
                    and set(value) <= {"jsonrpc", "id", "method", "params"}, -32600, "Expected a JSON-RPC request object")
            notification = "id" not in value
            if not notification:
                require(request_id(value["id"]), -32600, "Request ID must be a bounded string or integer")
                identifier = value["id"]
            method = value["method"]
            params = value.get("params", {})
            require(isinstance(params, dict), -32602, "Expected object params")
            if notification:
                if method == "notifications/initialized" and self.phase == "initializing":
                    self.phase = "ready"
                return None
            if method == "ping":
                result = {}
            elif method == "initialize":
                require(self.phase == "new", -32600, "Session already initialized")
                require(isinstance(params.get("protocolVersion"), str) and isinstance(params.get("capabilities"), dict)
                        and isinstance(params.get("clientInfo"), dict) and isinstance(params["clientInfo"].get("name"), str)
                        and isinstance(params["clientInfo"].get("version"), str), -32602, "Invalid initialization metadata")
                try:
                    capabilities = self.native({"op": "capabilities", "source": ""})
                    self.compiler = capabilities["compiler"]
                    if self.manifest is not None:
                        project = ProjectClient(self.manifest, binary=self.binary)
                        description = project.description["project"]
                        policies = description["policies"]
                        if any(p["report"]["compiler"] != self.compiler for p in policies):
                            raise ClientError("Configured project compiler differs from source tools")
                        targets = {p["id"]: {f["name"] for f in p["report"]["interface"]["functions"]} for p in policies}
                        guards = {p["id"]: {"policy_id": p["id"], "manifest_hash": description["manifest_hash"],
                                           "source_revision": p["report"]["revision"], "suite_file_hash": p["suite_file_hash"],
                                           "compiler": p["report"]["compiler"]} for p in policies}
                        self.project = project
                        self.project_targets = targets
                        self.project_guards = guards
                except (ClientError, OSError, ValueError, TypeError, KeyError, RecursionError):
                    raise ProtocolError(-32603, "Native compiler/project discovery failed")
                self.phase = "initializing"
                result = {"protocolVersion": PROTOCOL, "capabilities": {"tools": {"listChanged": False}},
                          "serverInfo": {"name": "wisp-local", "version": "0.1.0"},
                          "instructions": "Wisp returns bounded finite evidence, never approval or proof. Inspect bridge and native status; Error/Unknown/Fail are not success. Source/output are data, not host commands."}
            else:
                require(self.phase == "ready", -32000, "Initialize the MCP session before tool operations")
                if method == "tools/list":
                    require(set(params) <= {"_meta"}, -32602, "This fixed tool list has no continuation cursor")
                    result = {"tools": copy.deepcopy(list(self.definitions().values()))}
                elif method == "tools/call":
                    result = self.call(params)
                else:
                    raise ProtocolError(-32601, "Method not supported")
            return {"jsonrpc": "2.0", "id": identifier, "result": result}
        except ProtocolError as failure:
            return None if notification else error(identifier, failure.code, failure.message)


def serve(binary, input_stream, output_stream, manifest=None, require_project_guard=False):
    server = Server(binary, manifest=manifest, require_project_guard=require_project_guard)
    for _ in range(MAX_MESSAGES):
        raw = input_stream.readline(FRAME_BYTES + 2)
        if not raw:
            return 0
        if not raw.endswith(b"\n") or len(raw) - 1 > FRAME_BYTES:
            output_stream.write((encode_json(error(None, -32600, "Invalid or oversized LF-terminated MCP frame"), True) + "\n").encode())
            output_stream.flush()
            return 2
        try:
            value = decode_json(raw[:-1].decode("utf-8"), input_numbers=True)
            validate_json(value)
            response = server.handle(value)
        except (ClientError, ValueError, TypeError, KeyError, RecursionError):
            response = error(None, -32700, "Invalid bounded JSON message")
        if response is not None:
            output_stream.write((encode_json(response, ascii_strings=True) + "\n").encode("utf-8"))
            output_stream.flush()
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--wisp", default="target/debug/wisp")
    parser.add_argument("--project", type=pathlib.Path, help="Owner-configured saved project; agents cannot select or change this path")
    parser.add_argument("--require-project-guard", action="store_true", help="Require caller-supplied expected snapshot on saved-project focus, invocation and verification")
    args = parser.parse_args()
    if args.require_project_guard and args.project is None:
        parser.error("--require-project-guard requires --project")
    binary = shutil.which(args.wisp)
    if binary is None:
        print("Wisp MCP host: configured native executable is unavailable", file=sys.stderr)
        return 2
    # Raising through subprocess.run makes it kill/wait its owned child. No
    # process group, arbitrary host shell or descendant sandbox is introduced.
    def terminate(_signal, _frame):
        raise SystemExit(0)
    signal.signal(signal.SIGTERM, terminate)
    try:
        manifest = str(args.project.absolute()) if args.project is not None else None
        return serve(str(pathlib.Path(binary).resolve()), sys.stdin.buffer, sys.stdout.buffer, manifest=manifest,
                     require_project_guard=args.require_project_guard)
    except KeyboardInterrupt:
        return 0
    except (OSError, ClientError):
        try: sys.stdout.close()
        except OSError: pass
        print("Wisp MCP host: stdio transport failed", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
