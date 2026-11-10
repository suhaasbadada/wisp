"""Official SDK regression checks for saved-policy failures and stale reasoning."""
import argparse
import asyncio
import contextlib
import json
import pathlib
import sys
import tempfile

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

ROOT = pathlib.Path(__file__).resolve().parents[1]


def data(result):
    value = result.structured_content
    assert json.loads(result.content[0].text) == value
    assert value["bridge"]["approval"] == "not_granted"
    return value


def fixture(folder, body="n", count=1):
    folder.mkdir()
    (folder / "source.wisp").write_text('fn f(n:Int)->Int{' + body + '} print("must not run");', encoding="utf-8")
    suite = {"version": 1, "target": "f", "cases": [{"id": str(i), "args": ["2"], "expect": {
        "result": {"type": "Int", "value": "2"}, "output": ""}} for i in range(count)]}
    (folder / "cases.json").write_text(json.dumps(suite), encoding="utf-8")
    manifest = folder / "project.json"
    manifest.write_text('{"version":1,"policies":[{"id":"p","source":"source.wisp","suite":"cases.json"}]}', encoding="utf-8")
    return manifest


@contextlib.asynccontextmanager
async def connect(binary, manifest):
    params = StdioServerParameters(command=sys.executable, args=["-B", str(ROOT / "integrations" / "mcp" / "server.py"),
        "--wisp", binary, "--project", str(manifest), "--require-project-guard"])
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            described = await session.call_tool("wisp_project_describe", arguments={})
            assert not described.is_error
            metadata = data(described)
            assert metadata["bridge"]["caller_guard_required"] is True
            yield session, metadata["bridge"]["call_guards"]["p"]


def arguments():
    return {"wisp_project_focus": {"policy": "p", "function": "f", "budget": 64},
            "wisp_project_verify": {"policy": "p"},
            "wisp_project_prepare_edit": {"policy": "p", "function": "f", "expected_body_hash": "0" * 64, "replacement": "{ n }"},
            "wisp_project_invoke": {"id": "sdk", "policy": "p", "function": "f", "args": ["2"]}}


async def failures(binary):
    outcomes = []
    with tempfile.TemporaryDirectory(prefix="wisp-sdk-failures-") as directory:
        root = pathlib.Path(directory)
        matrix = [("pass_control", "n", 1, "Pass", True), ("unmet_expectation", "n+1", 1, "Fail", True),
                  ("runtime_error", "n/0", 1, "Error", True), ("call_depth", "f(n)", 1, "Unknown", True),
                  ("invalid_suite", "n", 1, "Error", False), ("case_bound", "n", 17, "Unknown", False)]
        for name, body, count, status, executed in matrix:
            manifest = fixture(root / name, body, count)
            if name == "invalid_suite":
                manifest.with_name("cases.json").write_text("null", encoding="utf-8")
            async with connect(binary, manifest) as (session, guard):
                result = await session.call_tool("wisp_project_verify", arguments={"policy": "p", "expected": guard})
                value = data(result); outer = value["report"]; report = outer["report"]; review = report["review"]
                assert result.is_error == (status != "Pass")
                assert value["bridge"]["status"] == "Complete" and value["bridge"]["guard_status"] == "matched"
                assert outer["status"] == report["status"] == status
                assert outer["project"]["new_execution"] is executed and review["new_execution"] is executed
                assert outer["project"]["approval"] == review["approval"] == "not_granted"
                assert outer["output"] == report["output"] == "" and report["probes"] == []
                assert review["phase"] == ("executed" if executed else "preflight")
                if executed:
                    assert review["summary"]["attempted_invocations"] == 2
                    if status == "Fail": assert review["cases"][0]["expectation"] == "Fail"
                    for case in review["cases"]:
                        expected_cell_status = "Complete" if status in {"Pass", "Fail"} else status
                        assert case["before"]["status"] == case["after"]["status"] == expected_cell_status
                        assert case["before"]["output"] == case["after"]["output"] == ""
                else:
                    assert review["cases"] == [] and "summary" not in review
                outcomes.append({"fixture": name, "native_status": status, "is_error": result.is_error,
                                 "new_execution": executed, "phase": review["phase"], "approval": "not_granted"})

        manifest = fixture(root / "reconnect")
        async with connect(binary, manifest) as (session, old_guard):
            # Every strict saved operation refuses omission before submission.
            for name, args in arguments().items():
                result = await session.call_tool(name, arguments=args)
                value = data(result)
                assert result.is_error and value["report"] is None
                assert value["bridge"]["guard_status"] == "rejected" and value["bridge"]["execution"] == "not_submitted"
            passed = await session.call_tool("wisp_project_verify", arguments={"policy": "p", "expected": old_guard})
            assert not passed.is_error and data(passed)["report"]["status"] == "Pass"
        source = manifest.with_name("source.wisp")
        source.write_text('fn f(n:Int)->Int{n+1} print("must not run");', encoding="utf-8")
        async with connect(binary, manifest) as (session, fresh_guard):
            assert old_guard["source_revision"] != fresh_guard["source_revision"]
            for name, args in arguments().items():
                stale = await session.call_tool(name, arguments={**args, "expected": old_guard})
                value = data(stale)
                assert stale.is_error and value["report"] is None
                assert value["bridge"]["guard_status"] == "rejected" and value["bridge"]["execution"] == "not_submitted"
            # Deliberate adoption is not approval: invocation completes with a
            # changed answer while the unchanged saved requirement now fails.
            invoked = await session.call_tool("wisp_project_invoke", arguments={**arguments()["wisp_project_invoke"], "expected": fresh_guard})
            invocation = data(invoked)["report"]
            assert not invoked.is_error and invocation["status"] == "Complete"
            assert invocation["report"]["result"]["value"] == "3" and invocation["report"]["output"] == ""
            verified = await session.call_tool("wisp_project_verify", arguments={"policy": "p", "expected": fresh_guard})
            assert verified.is_error and data(verified)["report"]["status"] == "Fail"

            # Matching the initialization guard does not bypass live disk drift.
            suite = manifest.with_name("cases.json")
            suite.write_bytes(suite.read_bytes() + b"\n")
            for name, args in arguments().items():
                drift = await session.call_tool(name, arguments={**args, "expected": fresh_guard})
                value = data(drift)
                assert drift.is_error and value["report"] is None
                assert value["bridge"]["status"] == "Error" and value["bridge"]["guard_status"] == "matched"
                assert value["bridge"]["execution"] == "unresolved"
    return {"sdk": "official Python mcp==2.3.0", "scope": "authored SDK regressions, not universal compatibility or reasoning proof",
            "saved_verification": outcomes, "strict_missing_guard_tools": len(arguments()), "reconnect_old_guard_tools": len(arguments()),
            "fresh_guard_invocation": "Complete", "fresh_guard_verification": "Fail", "same_session_drift_tools": len(arguments()),
            "approval": "not_granted"}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--wisp", default=str(ROOT / "target" / "debug" / "wisp"))
    args = parser.parse_args()
    result = asyncio.run(asyncio.wait_for(failures(str(pathlib.Path(args.wisp).resolve())), timeout=90))
    print(json.dumps(result))
