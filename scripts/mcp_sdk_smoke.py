"""Optional interoperability smoke; run with the official mcp==2.3.0 client SDK."""
import argparse
import asyncio
import json
import pathlib
import sys

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

ROOT = pathlib.Path(__file__).resolve().parents[1]


async def smoke(binary, project=None):
    command_args = ["-B", str(ROOT / "integrations" / "mcp" / "server.py"), "--wisp", binary]
    if project is not None: command_args += ["--project", str(project)]
    params = StdioServerParameters(command=sys.executable, args=command_args)
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            initialized = await session.initialize()
            tools = await session.list_tools()
            assert len(tools.tools) == (8 if project is not None else 6)
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
                call = await session.call_tool("wisp_project_invoke", arguments={"id": "sdk-reservation", "policy": "reservations", "function": "decide",
                    "args": [{"quantity": "11", "pack_size": "5", "expires_at": "101"}, {"available": "11", "now": "100"}]})
                frame = call.structured_content["report"]
                assert frame["status"] == "Complete" and frame["adapter"]["request_id"] == "sdk-reservation"
                assert frame["report"]["result"]["value"] == {"accepted": True, "packs": "3", "reason": "reserved"}
                project_status = frame["status"]
            print(json.dumps({"sdk": "official Python mcp==2.3.0", "protocol": initialized.protocol_version,
                              "tools": len(tools.tools), "native_outcomes": results,
                              "saved_project": project_status,
                              "i64": "exact decimal string", "top_level_execution": False,
                              "scope": "one local SDK interoperability smoke, not universal client compatibility"}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--wisp", default=str(ROOT / "target" / "debug" / "wisp"))
    parser.add_argument("--project", type=pathlib.Path, help="Optional reservations-demo manifest for saved-project interoperability")
    args = parser.parse_args()
    project = args.project.absolute() if args.project is not None else None
    asyncio.run(asyncio.wait_for(smoke(str(pathlib.Path(args.wisp).resolve()), project=project), timeout=30))
