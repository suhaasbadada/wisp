"""Read-only order decision planner. All arithmetic/rules execute in Wisp."""
import argparse
import json
import pathlib
import re
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
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


class HostError(Exception):
    pass


class JsonNumber:
    """An input number token, never a canonical Wisp Int string or Python float."""
    def __init__(self, token):
        if re.fullmatch(r"-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?", token) is None:
            raise HostError("Invalid JSON number token")
        self.token = token


def unique(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise HostError("Duplicate JSON member")
        value[key] = item
    return value


def non_json_number(_):
    raise HostError("Non-JSON number")


def decode(text, input_numbers=False):
    options = {"parse_int": JsonNumber, "parse_float": JsonNumber} if input_numbers else {}
    return json.loads(text, object_pairs_hook=unique, parse_constant=non_json_number, **options)


def transport_json(value):
    # JSON transport only: emit validated numeric lexemes as numbers, including
    # huge exponents/integers and -0. Never coerce them into accepted Int strings.
    if isinstance(value, JsonNumber):
        return value.token
    if isinstance(value, dict):
        return "{" + ",".join(json.dumps(k, ensure_ascii=False) + ":" + transport_json(v) for k, v in value.items()) + "}"
    if isinstance(value, list):
        return "[" + ",".join(transport_json(v) for v in value) + "]"
    return json.dumps(value, ensure_ascii=False, allow_nan=False)


def invoke(binary, args, input_text=None, semantic_exit=False):
    # A bounded example workload, not a network service or a production sandbox.
    process = subprocess.run([binary, *args], input=input_text, text=True,
                             capture_output=True, timeout=15, check=False)
    if process.returncode not in ({0, 1, 3} if semantic_exit else {0}):
        raise HostError("Wisp command did not complete normally; inspect it separately")
    return process.stdout


def load_orders(path):
    with open(path, "rb") as stream:
        raw = stream.read(65537)
    if len(raw) > 65536:
        raise HostError("Order input exceeds 65536 bytes")
    orders = decode(raw.decode("utf-8"), input_numbers=True)
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
    return orders


def discover(binary, manifest):
    description = decode(invoke(binary, ["project", "describe", str(manifest)]))
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


def call_batch(binary, manifest, description, policies, requests):
    if not requests:
        return []
    raw = invoke(binary, ["project", "serve", str(manifest)],
                 "".join(transport_json(q) + "\n" for q in requests))
    frames = [decode(line) for line in raw.splitlines()]
    if len(frames) != len(requests) + 1:
        raise HostError("Missing adapter readiness/response")
    ready = frames[0]
    if (ready["status"] != "Ready" or ready["adapter"]["contract_version"] != 1
            or ready["adapter"]["phase"] != "ready"
            or ready["adapter"]["manifest_hash"] != description["project"]["manifest_hash"]):
        raise HostError("Project changed after discovery or adapter is incompatible")
    pinned = {p["id"]: p for p in ready["adapter"]["policies"]}
    if set(pinned) != set(policies):
        raise HostError("Pinned policy IDs differ from discovery")
    for name, policy in policies.items():
        if (pinned[name]["source_revision"] != policy["report"]["revision"]
                or pinned[name]["suite_file_hash"] != policy["suite_file_hash"]):
            raise HostError("Project files changed after discovery")
    responses = frames[1:]
    for request, response in zip(requests, responses):
        adapter = response["adapter"]
        report = response.get("report")
        policy = policies[request["policy"]]
        if (adapter["contract_version"] != 1 or adapter["phase"] != "response"
                or adapter.get("request_id") != request["id"]
                or adapter.get("policy_id") != request["policy"]
                or adapter["manifest_hash"] != description["project"]["manifest_hash"]
                or adapter.get("source_revision") != policy["report"]["revision"]
                or adapter.get("suite_file_hash") != policy["suite_file_hash"]
                or not isinstance(report, dict)
                or report.get("compiler") != policy["report"]["compiler"]
                or report.get("revision") != policy["report"]["revision"]
                or report.get("status") != response["status"]
                or response["status"] not in {"Complete", "Error", "Unknown"}):
            raise HostError("Unmatched or incompatible decision evidence")
        if response["status"] == "Complete" and (
                report["result"]["type"] != RETURNS[request["policy"]]
                or report["invocation"]["new_execution"] is not True):
            raise HostError("Unexpected completed result boundary")
    return responses


def prepare(binary, manifest, expected_snapshot=None):
    description, policies = discover(binary, manifest)
    snapshots = [{"id": name, "revision": policy["report"]["revision"],
                  "suite_file_hash": policy["suite_file_hash"]} for name, policy in sorted(policies.items())]
    if expected_snapshot is not None and (
            description["project"]["manifest_hash"], snapshots) != expected_snapshot:
        raise HostError("Project changed between component review and discovery")
    return description, policies, snapshots


def plan(binary, manifest, orders, prepared=None):
    description, policies, snapshots = prepared if prepared is not None else prepare(binary, manifest)
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
        responses = call_batch(binary, manifest, description, policies, requests)
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
    args = parser.parse_args()
    try:
        orders = load_orders(args.orders)
        report = (review(args.wisp, args.baseline, args.project, orders) if args.baseline
                  else plan(args.wisp, args.project, orders))
    except (HostError, OSError, ValueError, KeyError, TypeError, StopIteration, RecursionError, subprocess.TimeoutExpired) as error:
        print(f"Host error: {error}", file=sys.stderr)
        return 2
    print(json.dumps(report, ensure_ascii=False, allow_nan=False))
    return 1 if report["status"] in {"Error", "Fail"} else 3 if report["status"] == "Unknown" else 0


if __name__ == "__main__":
    sys.exit(main())
