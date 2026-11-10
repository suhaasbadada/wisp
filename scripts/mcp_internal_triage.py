"""Read-only internal CI triage through the official MCP client and guarded tools."""
import argparse
import asyncio
import importlib.util
import pathlib
import sys

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("internal_ci_facts", ROOT / "examples" / "release-triage" / "run.py")
host = importlib.util.module_from_spec(spec); spec.loader.exec_module(host)


async def triage(binary, evidence, budget):
    data, digest = host.load(evidence)
    host.require(type(budget) is int and 0 <= budget <= 65536, "Context budget must be 0–65536")
    params = StdioServerParameters(command=sys.executable, args=["-B", str(ROOT / "integrations" / "mcp" / "server.py"),
        "--wisp", binary, "--project", str(ROOT / "examples" / "release-triage" / "project.json"), "--require-project-guard"])
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            initialized = await session.initialize()
            described = await session.call_tool("wisp_project_describe", arguments={})
            host.require(not described.is_error, "Project discovery failed")
            guard = described.structured_content["bridge"]["call_guards"]["release"]
            focused = await session.call_tool("wisp_project_focus", arguments={"policy": "release", "function": "decide", "budget": budget, "expected": guard})
            host.require(not focused.is_error and focused.structured_content["bridge"]["guard_status"] == "matched", "Guarded focus failed")
            focus = focused.structured_content["report"]
            host.require(focus["project"]["new_execution"] is False and "usage" not in focus["report"], "Focus must not execute policy code")
            view = focus["report"]["agent_view"]
            verified = await session.call_tool("wisp_project_verify", arguments={"policy": "release", "expected": guard})
            verification = verified.structured_content["report"]
            host.require(not verified.is_error and verification["status"] == "Pass", "Saved finite-suite verification did not pass")
            called = await session.call_tool("wisp_project_invoke", arguments={"id": "internal-release-triage", "policy": "release",
                "function": "decide", "args": [host.facts(data)], "expected": guard})
            frame = called.structured_content["report"]
            host.require(isinstance(frame, dict) and called.structured_content["bridge"]["guard_status"] == "matched", "Guarded invocation failed")
            decision = frame["report"]["result"]["value"] if frame["status"] == "Complete" else None
            code = host.report_exit({"status": frame["status"], "decision": decision})
            return {"sdk": "official Python mcp==2.3.0", "protocol": initialized.protocol_version,
                    "scope": "internal read-only saved CI evidence; not live CI/deployment/approval or model-reasoning measurement",
                    "evidence_revision": data["revision"], "evidence_hash": digest, "snapshot": guard,
                    "context": {"focus": view["focus"], "budget_bytes": view["budget_bytes"], "used_bytes": view["used_bytes"],
                                "overflow": view["overflow"], "omitted": view["omitted"], "uncertainty": view["uncertainty"]},
                    "context_new_execution": focus["project"]["new_execution"],
                    "verification": {"status": verification["status"], "new_execution": verification["project"]["new_execution"],
                                     "summary": verification["report"]["review"]["summary"], "approval": "not_granted"},
                    "status": frame["status"], "decision": decision,
                    "invocation_new_execution": frame["report"]["invocation"]["new_execution"],
                    "approval": "not_granted", "side_effects": "none"}, code


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--wisp", default=str(ROOT / "target" / "debug" / "wisp"))
    parser.add_argument("--evidence", type=pathlib.Path, default=ROOT / "examples" / "release-triage" / "pr16-merge.json")
    parser.add_argument("--budget", type=int, default=4096)
    args = parser.parse_args()
    try:
        report, code = asyncio.run(asyncio.wait_for(triage(str(pathlib.Path(args.wisp).resolve()), args.evidence, args.budget), timeout=60))
        print(host.encode_json(report, ascii_strings=True), flush=True)
        return code
    except (Exception, KeyboardInterrupt):
        # SDK exception groups can include nested transport errors. Do not expose
        # client environment/process stderr or treat them as native success.
        try: sys.stdout.close()
        except OSError: pass
        print("Internal MCP triage failed; inspect the trusted local setup separately", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
