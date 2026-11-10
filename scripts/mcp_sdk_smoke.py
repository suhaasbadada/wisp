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
            assert len(tools.tools) == (13 if project is not None else 7)
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
            checked = await session.call_tool("wisp_check", arguments={"source": source})
            check = checked.structured_content["report"]
            assert not checked.is_error and check["status"] == "Ready"
            assert json.loads(checked.content[0].text) == checked.structured_content
            function = next(f for f in check["graph"]["functions"] if f["name"] == "identity")
            edit_args = {"source": source, "function": "identity", "expected_revision": check["revision"],
                         "expected_body_hash": function["body_hash"], "replacement": "{ n + 1 }"}
            prepared = await session.call_tool("wisp_prepare_edit", arguments=edit_args)
            preparation = prepared.structured_content["report"]
            assert json.loads(prepared.content[0].text) == prepared.structured_content
            assert not prepared.is_error and preparation["status"] == "Ready"
            assert preparation["new_execution"] is False and preparation["output"] == "" and preparation["probes"] == []
            assert "usage" not in preparation and "review" not in preparation
            assert prepared.structured_content["bridge"]["approval"] == "not_granted"
            candidate = preparation["edit"]["source"]
            assert candidate != source and "{ n }" in source and "{ n + 1 }" in candidate
            suite = {"version": 1, "target": "identity", "cases": [{"id": "one", "args": ["1"],
                     "expect": {"result": {"type": "Int", "value": "2"}, "output": ""}}]}
            reviewed = await session.call_tool("wisp_review", arguments={"source": source, "candidate": candidate, "suite": suite})
            review = reviewed.structured_content["report"]
            assert json.loads(reviewed.content[0].text) == reviewed.structured_content
            assert not reviewed.is_error and review["status"] == "Pass"
            assert review["output"] == "" and review["review"]["approval"] == "not_granted"
            case = review["review"]["cases"][0]
            assert case["before"]["result"]["value"] == "1" and case["after"]["result"]["value"] == "2"
            assert case["before"]["output"] == "" and case["after"]["output"] == ""
            assert case["comparison"] == "Changed" and case["expectation"] == "Pass"
            stale_edit = await session.call_tool("wisp_prepare_edit", arguments={**edit_args, "expected_body_hash": "0" * 64})
            refusal = stale_edit.structured_content["report"]
            assert json.loads(stale_edit.content[0].text) == stale_edit.structured_content
            assert stale_edit.is_error and refusal["status"] == "Error"
            assert refusal["diagnostics"][0]["code"] == "E_EDIT_CONFLICT" and refusal["new_execution"] is False
            assert "edit" not in refusal and stale_edit.structured_content["bridge"]["approval"] == "not_granted"
            project_status = None
            saved_edit_status = None
            saved_candidate_status = None
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
                body_hash = next(f["body_hash"] for f in context["report"]["graph"]["functions"] if f["name"] == "decide")
                saved_edit = await session.call_tool("wisp_project_prepare_edit", arguments={"policy": "reservations", "function": "decide",
                    "expected_body_hash": body_hash, "replacement": '{ new Decision { accepted: false, packs: 0, reason: "proposal_only" } }', "expected": guard})
                proposed = saved_edit.structured_content["report"]
                assert not saved_edit.is_error and proposed["status"] == "Ready"
                assert proposed["project"]["new_execution"] is False and proposed["report"]["new_execution"] is False
                assert proposed["report"]["edit"]["base_body_hash"] == body_hash
                assert proposed["project"]["source_revision"] == guard["source_revision"]
                assert "proposal_only" in proposed["report"]["edit"]["source"]
                saved_edit_status = proposed["status"]
                candidate_review = await session.call_tool("wisp_project_review_candidate", arguments={"policy": "reservations",
                    "candidate": proposed["report"]["edit"]["source"], "expected_candidate_revision": proposed["report"]["edit"]["candidate_revision"], "expected": guard})
                candidate_evidence = candidate_review.structured_content["report"]
                assert candidate_review.is_error and candidate_evidence["status"] == "Fail"
                assert candidate_evidence["project"]["candidate_revision"] == proposed["report"]["edit"]["candidate_revision"]
                assert candidate_evidence["report"]["review"]["summary"]["expectation_fail"] == 7
                assert candidate_evidence["report"]["review"]["baseline_revision"] == guard["source_revision"]
                assert candidate_evidence["report"]["review"]["approval"] == "not_granted"
                saved_candidate_status = candidate_evidence["status"]
                verified = await session.call_tool("wisp_project_verify", arguments={"policy": "reservations", "expected": guard})
                verification = verified.structured_content["report"]
                assert not verified.is_error and verification["status"] == "Pass"
                assert verification["project"]["new_execution"] is True
                assert verification["report"]["review"]["summary"]["expectation_pass"] == 7
                assert verification["project"]["approval"] == "not_granted"
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
                stale_suite = await session.call_tool("wisp_project_verify", arguments={"policy": "reservations", "expected": {**guard, "suite_file_hash": "0" * 64}})
                assert stale_suite.is_error and stale_suite.structured_content["report"] is None
                assert stale_suite.structured_content["bridge"]["execution"] == "not_submitted"
                if require_guard:
                    missing = await session.call_tool("wisp_project_invoke", arguments={"id": "missing", "policy": "reservations", "function": "decide", "args": []})
                    assert missing.is_error and missing.structured_content["report"] is None
                    assert missing.structured_content["bridge"]["guard_status"] == "rejected"
                    assert missing.structured_content["bridge"]["execution"] == "not_submitted"
            print(json.dumps({"sdk": "official Python mcp==2.3.0", "protocol": initialized.protocol_version,
                              "tools": len(tools.tools), "native_outcomes": results,
                              "edit_preparation": preparation["status"], "finite_edit_review": review["status"],
                              "stale_edit": refusal["status"],
                              "saved_project": project_status,
                              "saved_edit_preparation": saved_edit_status,
                              "saved_candidate_review": saved_candidate_status,
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
