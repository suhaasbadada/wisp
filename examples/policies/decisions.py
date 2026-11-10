"""Bounded application integration: runtime decisions, not suite verification."""
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / "clients" / "python"))
from wisp_client import ProjectClient

manifest = pathlib.Path(__file__).resolve().with_name("project.json")
binary = sys.argv[1] if len(sys.argv) == 2 else "target/debug/wisp"
client = ProjectClient(manifest, binary=binary)
description = client.description
if description["status"] != "Ready":
    raise RuntimeError("Project interface is incomplete")
policy = next(p for p in description["project"]["policies"] if p["id"] == "reservations")
interface = policy["report"]["interface"]
expected = {"name": "decide", "parameters": [
    {"name": "order", "type": {"kind": "Record", "name": "Order"}},
    {"name": "depot", "type": {"kind": "Record", "name": "Depot"}},
], "return_type": {"kind": "Record", "name": "Decision"}}
if interface["contract_version"] != 1 or expected not in interface["functions"]:
    raise RuntimeError("Unsupported callable interface")
expected_records = {
    "Order": [("quantity", "Int"), ("pack_size", "Int"), ("expires_at", "Int")],
    "Depot": [("available", "Int"), ("now", "Int")],
    "Decision": [("accepted", "Bool"), ("packs", "Int"), ("reason", "String")],
}
records = {record["name"]: record["fields"] for record in interface["records"]}
for name, fields in expected_records.items():
    if records.get(name) != [{"name": field, "type": {"kind": kind}} for field, kind in fields]:
        raise RuntimeError("Unsupported record boundary")
requests = [
    {"id": "order-1", "policy": "reservations", "function": "decide",
     "args": [{"quantity": "11", "pack_size": "5", "expires_at": "101"},
              {"available": "11", "now": "100"}]},
    {"id": "order-2", "policy": "reservations", "function": "decide",
     "args": [{"quantity": "10", "pack_size": "5", "expires_at": "100"},
              {"available": "10", "now": "100"}]},
]
for request, response in zip(requests, client.call_batch(requests)):
    if (response["status"] != "Complete"
            or response["report"]["result"]["type"] != "Decision"):
        raise RuntimeError("Incomplete or mismatched decision; do not act on it")
    print(json.dumps({"id": request["id"],
                      "revision": response["adapter"]["source_revision"],
                      "decision": response["report"]["result"]["value"]}))
