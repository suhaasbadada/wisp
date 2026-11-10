"""Read-only order decision planner. All arithmetic/rules execute in Wisp."""
import argparse
import hashlib
import pathlib
import re
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "clients" / "python"))
import wisp_client as CLIENT
from wisp_client import (ClientError as HostError, JsonNumber, ProjectClient,
                         decode_json as decode, encode_json as transport_json,
                         validate_json as validate_tree)
FIELDS = {"id", "quantity", "unit_cents", "member", "pack_size", "expires_at", "available", "now", "zone"}
RECORDS = {
    "eligibility": {"Order": [("quantity", "Int"), ("pack_size", "Int"), ("expires_at", "Int")],
                    "Depot": [("available", "Int"), ("now", "Int")],
                    "Decision": [("accepted", "Bool"), ("packs", "Int"), ("reason", "String")]},
    "pricing": {"PriceInput": [("quantity", "Int"), ("unit_cents", "Int"), ("member", "Bool")],
                "Quote": [("accepted", "Bool"), ("subtotal_cents", "Int"), ("total_cents", "Int"), ("reason", "String")]},
    "shipping": {"ShippingInput": [("total_cents", "Int"), ("zone", "String")],
                 "Delivery": [("accepted", "Bool"), ("fee_cents", "Int"), ("grand_total_cents", "Int"), ("reason", "String")]},
}
PARAMETERS = {"eligibility": [("order", "Order"), ("depot", "Depot")],
              "pricing": [("input", "PriceInput")], "shipping": [("input", "ShippingInput")]}
RETURNS = {"eligibility": "Decision", "pricing": "Quote", "shipping": "Delivery"}


def invoke(binary, args, input_text=None, semantic_exit=False):
    # A bounded example workload, not a network service or a production sandbox.
    return CLIENT.run_cli(binary, args, input_text, semantic_exit)


def load_orders(path, with_hash=False):
    with open(path, "rb") as stream:
        raw = stream.read(65537)
    if len(raw) > 65536:
        raise HostError("Order input exceeds 65536 bytes")
    orders = decode(raw.decode("utf-8"), input_numbers=True)
    validate_tree(orders)
    if not isinstance(orders, list) or not 1 <= len(orders) <= 32:
        raise HostError("Expected 1–32 order objects")
    ids = set()
    for order in orders:
        if (not isinstance(order, dict) or set(order) != FIELDS
                or not isinstance(order["id"], str)
                or re.fullmatch(r"[A-Za-z0-9_-]{1,64}", order["id"]) is None
                or order["id"] in ids):
            raise HostError("Expected exact order fields and unique ASCII IDs")
        ids.add(order["id"])
    # Typed business fields deliberately remain Rust's responsibility.
    return (orders, hashlib.sha256(raw).hexdigest()) if with_hash else orders


def load_expectations(path, orders):
    with open(path, "rb") as stream:
        raw = stream.read(65537)
    if len(raw) > 65536:
        raise HostError("Expectation input exceeds 65536 bytes")
    data = decode(raw.decode("utf-8"), input_numbers=True)
    validate_tree(data)
    if (not isinstance(data, dict) or set(data) != {"version", "orders"}
            or not isinstance(data["version"], JsonNumber) or data["version"].token != "1"
            or not isinstance(data["orders"], list) or not 1 <= len(data["orders"]) <= 32):
        raise HostError("Expected strict version-1 workflow expectations")
    expected = {}
    stages = ["eligibility", "pricing", "shipping"]
    for case in data["orders"]:
        if (not isinstance(case, dict) or set(case) != {"id", "expect"}
                or not isinstance(case["id"], str)
                or re.fullmatch(r"[A-Za-z0-9_-]{1,64}", case["id"]) is None
                or case["id"] in expected or not isinstance(case["expect"], dict)):
            raise HostError("Expected unique workflow expectation IDs and objects")
        value = case["expect"]
        if (set(value) != {"status", "stage", "decisions", "outputs"}
                or not isinstance(value["status"], str) or value["status"] not in {"Accepted", "Rejected"}
                or not isinstance(value["stage"], str) or value["stage"] not in stages
                or (value["status"] == "Accepted" and value["stage"] != "shipping")):
            raise HostError("Expectations require a completed Accepted/Rejected workflow")
        prefix = stages[:stages.index(value["stage"]) + 1]
        if (not isinstance(value["decisions"], dict) or set(value["decisions"]) != set(prefix)
                or any(not isinstance(v, dict) for v in value["decisions"].values())
                or not isinstance(value["outputs"], list) or len(value["outputs"]) != len(prefix)):
            raise HostError("Expected every completed stage's decision and captured output")
        for stage, output in zip(prefix, value["outputs"]):
            if (not isinstance(output, dict) or set(output) != {"policy", "output"}
                    or output["policy"] != stage or not isinstance(output["output"], str)
                    or len(output["output"].encode("utf-8")) > 8192):
                raise HostError("Expected exact per-stage captured output strings")
        expected[case["id"]] = value
    if set(expected) != {order["id"] for order in orders}:
        raise HostError("Expectation IDs must exactly match input order IDs")
    return expected, hashlib.sha256(raw).hexdigest()


def observed_order(row):
    return {"status": row["status"], "stage": row["stage"], "decisions": row["decisions"],
            "outputs": [{"policy": e["adapter"]["policy_id"], "output": e["report"]["output"]}
                        for e in row["evidence"]]}


def differences(expected, observed, path="", found=None):
    found = [] if found is None else found
    if len(found) >= 32 or expected == observed:
        return found
    if isinstance(expected, dict) and isinstance(observed, dict):
        for key in sorted(set(expected) | set(observed)):
            child = path + "/" + key.replace("~", "~0").replace("/", "~1")
            if key not in expected or key not in observed:
                if len(found) < 32:
                    found.append(child)
            else:
                differences(expected[key], observed[key], child, found)
    elif isinstance(expected, list) and isinstance(observed, list) and len(expected) == len(observed):
        for index, (left, right) in enumerate(zip(expected, observed)):
            differences(left, right, path + f"/{index}", found)
    else:
        found.append(path or "/")
    return found


def check_expectations(workflow, expected, expected_hash, orders_hash):
    gate = {"contract_version": 1, "phase": "not_evaluated", "document": "candidate" if "component_review" in workflow else "plan",
            "expected_hash": expected_hash, "orders_hash": orders_hash, "new_execution": False,
            "scope": "exact completed status/stage/typed decisions/captured output; finite inputs, not approval", "cases": []}
    result = {"status": workflow["status"], "approval": "not_granted", "side_effects": "none",
              "expectation": gate, "workflow": workflow}
    if workflow.get("phase") == "component_gate":
        return result
    plan_result = workflow["after"] if workflow.get("phase") == "observed" else workflow
    rows = plan_result["orders"]
    if len(rows) != len(expected) or {r["id"] for r in rows} != set(expected):
        raise HostError("Observed order IDs do not match expectation inputs")
    cases = []
    for row in rows:
        observation = observed_order(row)
        paths = differences(expected[row["id"]], observation)
        verdict = row["status"] if row["status"] in {"Error", "Unknown"} else "Fail" if paths else "Pass"
        cases.append({"id": row["id"], "status": verdict, "expected": expected[row["id"]],
                      "observed": observation, "mismatch_paths": paths})
    gate["phase"] = "checked"
    gate["cases"] = cases
    gate["summary"] = {"total": len(cases), **{name.lower(): sum(c["status"] == name for c in cases)
                                              for name in ["Pass", "Fail", "Error", "Unknown"]}}
    verdicts = {c["status"] for c in cases} | {workflow["status"]}
    result["status"] = "Error" if "Error" in verdicts else "Unknown" if "Unknown" in verdicts else "Fail" if "Fail" in verdicts else "Pass"
    return result


def discover(client):
    description = client.description
    if description["status"] != "Ready":
        raise HostError("Project interface is incomplete")
    policies = {p["id"]: p for p in description["project"]["policies"]}
    if set(policies) != set(RECORDS):
        raise HostError("This host requires eligibility, pricing and shipping policies")
    for name, policy in policies.items():
        interface = policy["report"]["interface"]
        expected = {"name": "decide", "parameters": [
            {"name": field, "type": {"kind": "Record", "name": record}}
            for field, record in PARAMETERS[name]],
            "return_type": {"kind": "Record", "name": RETURNS[name]}}
        if interface["contract_version"] != 1 or expected not in interface["functions"]:
            raise HostError("Unsupported callable boundary")
        records = {r["name"]: r["fields"] for r in interface["records"]}
        for record, fields in RECORDS[name].items():
            if records.get(record) != [{"name": field, "type": {"kind": kind}} for field, kind in fields]:
                raise HostError("Unsupported record boundary")
    return description, policies


def prepare(binary, manifest, expected_snapshot=None):
    client = ProjectClient(manifest, binary=binary)
    description, policies = discover(client)
    snapshots = [{"id": name, "revision": policy["report"]["revision"],
                  "suite_file_hash": policy["suite_file_hash"]} for name, policy in sorted(policies.items())]
    if expected_snapshot is not None and (
            description["project"]["manifest_hash"], snapshots) != expected_snapshot:
        raise HostError("Project changed between component review and discovery")
    return description, policies, snapshots, client


def plan(binary, manifest, orders, prepared=None):
    description, policies, snapshots, client = prepared if prepared is not None else prepare(binary, manifest)
    rows = [{"id": order["id"], "status": "Pending", "stage": "eligibility",
             "decisions": {}, "evidence": []} for order in orders]
    for stage in ["eligibility", "pricing", "shipping"]:
        pending = [i for i, row in enumerate(rows) if row["status"] == "Pending"]
        requests = []
        for i in pending:
            order = orders[i]
            if stage == "eligibility":
                args = [{k: order[k] for k in ["quantity", "pack_size", "expires_at"]},
                        {k: order[k] for k in ["available", "now"]}]
            elif stage == "pricing":
                args = [{k: order[k] for k in ["quantity", "unit_cents", "member"]}]
            else:
                args = [{"total_cents": rows[i]["decisions"]["pricing"]["total_cents"],
                         "zone": order["zone"]}]
            requests.append({"id": f"{stage}-{i}", "policy": stage, "function": "decide", "args": args})
        responses = client.call_batch(requests) if requests else []
        for i, response in zip(pending, responses):
            row = rows[i]
            row["stage"] = stage
            row["evidence"].append(response)
            if response["status"] != "Complete":
                row["status"] = response["status"]
                row.pop("reason", None)
                continue
            decision = response["report"]["result"]["value"]
            row["decisions"][stage] = decision
            row["reason"] = decision["reason"]
            if decision["accepted"] is False:
                row["status"] = "Rejected"
            elif decision["accepted"] is not True:
                raise HostError("Expected a typed Bool decision")
            elif stage == "shipping":
                row["status"] = "Accepted"
    if any(row["status"] == "Pending" for row in rows):
        raise HostError("Workflow ended with unresolved orders")
    status = "Error" if any(r["status"] == "Error" for r in rows) else "Unknown" if any(r["status"] == "Unknown" for r in rows) else "Complete"
    return {"status": status, "approval": "not_granted", "side_effects": "none",
            "manifest_hash": description["project"]["manifest_hash"],
            "policies": snapshots,
            "summary": {"total": len(rows),
                        **{s.lower(): sum(r["status"] == s for r in rows) for s in ["Accepted", "Rejected", "Error", "Unknown"]},
                        "submitted_requests": sum(len(r["evidence"]) for r in rows),
                        "attempted_invocations": sum(e["report"]["invocation"]["new_execution"] is True for r in rows for e in r["evidence"])},
            "orders": rows}


def review(binary, baseline, candidate, orders):
    component = decode(invoke(binary, ["project", "review", str(baseline), str(candidate)], semantic_exit=True))
    if component["status"] != "Pass":
        return {"status": component["status"], "phase": "component_gate", "approval": "not_granted",
                "side_effects": "none", "application_invocations": 0, "component_review": component}
    def snapshot(side):
        return (component["project"][f"{side}_manifest_hash"],
                [{"id": row["id"], "revision": row["report"]["review"][f"{side}_revision"],
                  "suite_file_hash": row["suite_file_hash"]} for row in component["project"]["policies"]])
    prepared_before = prepare(binary, baseline, snapshot("baseline"))
    prepared_after = prepare(binary, candidate, snapshot("candidate"))
    before = plan(binary, baseline, orders, prepared_before)
    after = plan(binary, candidate, orders, prepared_after)
    # Pin the composed observations to the exact revisions whose unchanged
    # specifications passed review. A drift here is a host failure, not approval.
    for side, report in [("baseline", before), ("candidate", after)]:
        expected = [{"id": row["id"], "revision": row["report"]["review"][f"{side}_revision"],
                     "suite_file_hash": row["suite_file_hash"]} for row in component["project"]["policies"]]
        if (report["manifest_hash"] != component["project"][f"{side}_manifest_hash"]
                or report["policies"] != expected):
            raise HostError("Project changed between component review and composed observations")
    changes = []
    def outputs(row):
        return [(e["adapter"]["policy_id"], e["report"]["output"]) for e in row["evidence"]]
    for b, a in zip(before["orders"], after["orders"]):
        if b["status"] in {"Error", "Unknown"} or a["status"] in {"Error", "Unknown"}:
            comparison = "Unavailable"
        else:
            same_decisions = all(b[k] == a[k] for k in ["status", "stage", "decisions"])
            comparison = "Unchanged" if same_decisions and outputs(b) == outputs(a) else "Changed"
        changes.append({"id": a["id"], "comparison": comparison,
                        "before_status": b["status"], "after_status": a["status"]})
    status = "Error" if "Error" in {before["status"], after["status"]} else "Unknown" if "Unknown" in {before["status"], after["status"]} else "Complete"
    return {"status": status, "phase": "observed", "approval": "not_granted", "side_effects": "none",
            "component_review": component, "before": before, "after": after, "changes": changes,
            "application_invocations": before["summary"]["attempted_invocations"] + after["summary"]["attempted_invocations"],
            "summary": {name.lower(): sum(row["comparison"] == name for row in changes)
                        for name in ["Changed", "Unchanged", "Unavailable"]}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--wisp", default="target/debug/wisp")
    parser.add_argument("--project", type=pathlib.Path, default=HERE / "project.json")
    parser.add_argument("--orders", type=pathlib.Path, default=HERE / "orders.json")
    parser.add_argument("--baseline", type=pathlib.Path, help="Review unchanged component specifications, then observe both workflows")
    parser.add_argument("--expect", type=pathlib.Path, help="Caller-owned exact composed expectations; never rewritten")
    args = parser.parse_args()
    try:
        orders, orders_hash = load_orders(args.orders, with_hash=True)
        expected, expected_hash = load_expectations(args.expect, orders) if args.expect else (None, None)
        report = (review(args.wisp, args.baseline, args.project, orders) if args.baseline
                  else plan(args.wisp, args.project, orders))
        report["orders_hash"] = orders_hash
        if expected is not None:
            report = check_expectations(report, expected, expected_hash, orders_hash)
        serialized = transport_json(report, ascii_strings=True)
        print(serialized, flush=True)
    except (HostError, OSError, ValueError, KeyError, TypeError, StopIteration, RecursionError, subprocess.TimeoutExpired) as error:
        if isinstance(error, BrokenPipeError):
            try:
                sys.stdout.close()
            except OSError:
                pass
        print(f"Host error: {error}", file=sys.stderr)
        return 2
    return 1 if report["status"] in {"Error", "Fail"} else 3 if report["status"] == "Unknown" else 0


if __name__ == "__main__":
    sys.exit(main())
