"""Optional interoperability smoke; run with the official mcp==2.3.0 client SDK."""
import argparse
import asyncio
import json
import pathlib
import sys

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

ROOT = pathlib.Path(__file__).resolve().parents[1]


async def smoke(binary, project=None, require_guard=False):
    command_args = ["-B", str(ROOT / "integrations" / "mcp" / "server.py"), "--wisp", binary]
    if project is not None: command_args += ["--project", str(project)]
    if require_guard: command_args += ["--require-project-guard"]
    params = StdioServerParameters(command=sys.executable, args=command_args)
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            initialized = await session.initialize()
            tools = await session.list_tools()
            assert len(tools.tools) == (9 if project is not None else 6)
            source = 'print("must not run"); fn identity(n: Int) -> Int { n } fn loop(n: Int) -> Int { loop(n) }'
            results = []
            for function, args, status in [("identity", ["9223372036854775807"], "Complete"),
                                           ("identity", [1], "Error"), ("loop", ["1"], "Unknown")]:
                result = await session.call_tool("wisp_invoke", arguments={"source": source, "function": function, "args": args})
                data = result.structured_content
                assert data["report"]["status"] == status
                assert data["report"]["output"] == ""
                assert result.is_error == (status != "Complete")
                assert json.loads(result.content[0].text) == data
                if status == "Complete": assert data["report"]["result"]["value"] == "9223372036854775807"
                results.append(status)
            project_status = None
            if project is not None:
                # The optional project smoke targets the shipped reservations demo.
                described = await session.call_tool("wisp_project_describe", arguments={})
                assert described.structured_content["bridge"]["execution"] == "initialization_metadata"
                guard = described.structured_content["bridge"]["call_guards"]["reservations"]
                assert described.structured_content["bridge"]["caller_guard_required"] == require_guard
                focused = await session.call_tool("wisp_project_focus", arguments={"policy": "reservations", "function": "decide", "budget": 2048, "expected": guard})
                context = focused.structured_content["report"]
                assert context["status"] == "Ready" and context["project"]["new_execution"] is False
                assert focused.structured_content["bridge"]["guard_status"] == "matched"
                assert context["report"]["agent_view"]["focus"] == "decide" and "usage" not in context["report"]
                assert len(context["report"]["agent_view"]["text"].encode()) <= 2048
                call = await session.call_tool("wisp_project_invoke", arguments={"id": "sdk-reservation", "policy": "reservations", "function": "decide",
                    "args": [{"quantity": "11", "pack_size": "5", "expires_at": "101"}, {"available": "11", "now": "100"}], "expected": guard})
                frame = call.structured_content["report"]
                assert call.structured_content["bridge"]["guard_status"] == "matched"
                assert frame["status"] == "Complete" and frame["adapter"]["request_id"] == "sdk-reservation"
                assert frame["report"]["result"]["value"] == {"accepted": True, "packs": "3", "reason": "reserved"}
                project_status = frame["status"]
                rejected = await session.call_tool("wisp_project_invoke", arguments={"id": "stale", "policy": "reservations", "function": "decide", "args": [],
                    "expected": {**guard, "source_revision": "0" * 64}})
                assert rejected.is_error and rejected.structured_content["report"] is None
                assert rejected.structured_content["bridge"]["guard_status"] == "rejected"
                assert rejected.structured_content["bridge"]["execution"] == "not_submitted"
                stale_context = await session.call_tool("wisp_project_focus", arguments={"policy": "reservations", "function": "decide", "expected": {**guard, "source_revision": "0" * 64}})
                assert stale_context.is_error and stale_context.structured_content["report"] is None
                assert stale_context.structured_content["bridge"]["execution"] == "not_submitted"
                if require_guard:
                    missing = await session.call_tool("wisp_project_invoke", arguments={"id": "missing", "policy": "reservations", "function": "decide", "args": []})
                    assert missing.is_error and missing.structured_content["report"] is None
                    assert missing.structured_content["bridge"]["guard_status"] == "rejected"
                    assert missing.structured_content["bridge"]["execution"] == "not_submitted"
            print(json.dumps({"sdk": "official Python mcp==2.3.0", "protocol": initialized.protocol_version,
                              "tools": len(tools.tools), "native_outcomes": results,
                              "saved_project": project_status,
                              "caller_guard_required": require_guard,
                              "i64": "exact decimal string", "top_level_execution": False,
                              "scope": "one local SDK interoperability smoke, not universal client compatibility"}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--wisp", default=str(ROOT / "target" / "debug" / "wisp"))
    parser.add_argument("--project", type=pathlib.Path, help="Optional reservations-demo manifest for saved-project interoperability")
    parser.add_argument("--require-project-guard", action="store_true")
    args = parser.parse_args()
    project = args.project.absolute() if args.project is not None else None
    if args.require_project_guard and project is None: parser.error("--require-project-guard requires --project")
    asyncio.run(asyncio.wait_for(smoke(str(pathlib.Path(args.wisp).resolve()), project=project, require_guard=args.require_project_guard), timeout=30))
