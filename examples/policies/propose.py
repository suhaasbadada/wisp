"""Read-only, caller-pinned body proposal and finite saved-suite review.

Stdout is one JSON record, not approval or an applied edit. The text budget
only bounds Agent View text, not the graph, full candidate or case evidence.
Client failure after submission does not imply zero execution. No retry occurs.
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "clients" / "python"))
from wisp_client import ClientError, ProjectClient, decode_json, encode_json, validate_json


def require(condition):
    if not condition:
        raise ClientError("Invalid proposal input or metadata")


def arguments(argv):
    required = {"--project", "--policy", "--function", "--expected-guard-file", "--replacement-file"}
    allowed = required | {"--budget", "--wisp"}
    result = {"--budget": "4096", "--wisp": str(ROOT / "target/debug/wisp")}
    seen = set()
    require(len(argv) % 2 == 0)
    for index in range(0, len(argv), 2):
        key, value = argv[index:index + 2]
        require(key in allowed and key not in seen and bool(value) and not value.startswith("--"))
        seen.add(key)
        result[key] = value
    require(required <= seen)
    require(re.fullmatch(r"[A-Za-z0-9_-]{1,64}", result["--policy"]) is not None)
    require(re.fullmatch(r"[0-9]{1,5}", result["--budget"]) is not None)
    result["--budget"] = int(result["--budget"])
    require(result["--budget"] <= 65536)
    validate_json(result)
    return result


def read_text(path, limit):
    with pathlib.Path(path).open("rb") as stream:
        raw = stream.read(limit + 1)
    require(len(raw) <= limit)
    return raw.decode("utf-8")


def load_guard(path):
    guard = decode_json(read_text(path, 16384))
    validate_json(guard)
    require(isinstance(guard, dict) and set(guard) == {
        "policy_id", "manifest_hash", "source_revision", "suite_file_hash", "compiler"})
    require(isinstance(guard["policy_id"], str)
            and re.fullmatch(r"[A-Za-z0-9_-]{1,64}", guard["policy_id"]) is not None)
    for key in ["manifest_hash", "source_revision", "suite_file_hash"]:
        require(isinstance(guard[key], str) and re.fullmatch(r"[0-9a-f]{64}", guard[key]) is not None)
    require(isinstance(guard["compiler"], str) and bool(guard["compiler"]))
    return guard


def propose(args):
    guard = load_guard(args["--expected-guard-file"])
    policy_id, function = args["--policy"], args["--function"]
    require(guard["policy_id"] == policy_id)
    client = ProjectClient(args["--project"], binary=args["--wisp"])
    project = client.description["project"]
    policies = [policy for policy in project["policies"] if policy["id"] == policy_id]
    require(len(policies) == 1)
    policy = policies[0]
    # Compare authored pins BEFORE focus, preparation, or replacement-file IO.
    require(guard["manifest_hash"] == project["manifest_hash"]
            and guard["source_revision"] == policy["report"]["revision"]
            and guard["suite_file_hash"] == policy["suite_file_hash"]
            and guard["compiler"] == policy["report"]["compiler"])
    context = client.focus(policy_id, function, budget=args["--budget"])
    result = {"contract_version": 1, "mode": "proposal", "status": context["status"],
              "phase": "context_rejected", "approval": "not_granted", "applied": False,
              "policy_id": policy_id, "function": function, "expected_guard": guard,
              "context": context, "preparation": None, "review": None}
    if context["status"] != "Ready":
        return result
    # Native graph only: no Python source parsing or independently derived body.
    functions = [item for item in context["report"]["graph"]["functions"] if item["name"] == function]
    require(len(functions) == 1)
    body_hash = functions[0]["body_hash"]
    require(isinstance(body_hash, str) and re.fullmatch(r"[0-9a-f]{64}", body_hash) is not None)
    replacement = read_text(args["--replacement-file"], 65536)
    preparation = client.prepare_edit(policy_id, function, body_hash, replacement)
    result.update(status=preparation["status"], phase="preparation_rejected", preparation=preparation)
    if preparation["status"] != "Ready":
        return result
    edit = preparation["report"]["edit"]
    review = client.review_candidate(policy_id, edit["source"], edit["candidate_revision"])
    result.update(status=review["status"], phase="reviewed", review=review)
    return result


def main(argv=None):
    try:
        result = propose(arguments(sys.argv[1:] if argv is None else argv))
        code = {"Pass": 0, "Fail": 1, "Error": 1, "Unknown": 3}[result["status"]]
        print(encode_json(result, ascii_strings=True), flush=True)
        return code
    except (ClientError, OSError, ValueError, TypeError, KeyError, AttributeError, RecursionError) as error:
        # No captured native output, paths, guard contents or environment values.
        # A lost review response is unresolved, not evidence of zero execution.
        if isinstance(error, BrokenPipeError):
            try:
                sys.stdout.close()
            except OSError:
                pass
        print("Proposal host error; outcome unresolved (execution may have occurred).", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
