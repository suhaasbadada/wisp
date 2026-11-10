"""Optional interoperability smoke; run with the official mcp==2.3.0 client SDK."""
import argparse
import asyncio
import json
import pathlib
import sys

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

ROOT = pathlib.Path(__file__).resolve().parents[1]


async def smoke(binary):
    params = StdioServerParameters(command=sys.executable, args=["-B", str(ROOT / "integrations" / "mcp" / "server.py"), "--wisp", binary])
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            initialized = await session.initialize()
            tools = await session.list_tools()
            assert len(tools.tools) == 6
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
            print(json.dumps({"sdk": "official Python mcp==2.3.0", "protocol": initialized.protocol_version,
                              "tools": len(tools.tools), "native_outcomes": results,
                              "i64": "exact decimal string", "top_level_execution": False,
                              "scope": "one local SDK interoperability smoke, not universal client compatibility"}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--wisp", default=str(ROOT / "target" / "debug" / "wisp"))
    args = parser.parse_args()
    asyncio.run(asyncio.wait_for(smoke(str(pathlib.Path(args.wisp).resolve())), timeout=30))
