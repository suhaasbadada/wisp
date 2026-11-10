"""Bounded application integration: runtime decisions, not suite verification."""
import json
import pathlib
import subprocess
import sys

manifest = pathlib.Path(__file__).resolve().with_name("project.json")
binary = sys.argv[1] if len(sys.argv) == 2 else "target/debug/wisp"
requests = [
    {"id": "order-1", "policy": "reservations", "function": "decide",
     "args": [{"quantity": "11", "pack_size": "5", "expires_at": "101"},
              {"available": "11", "now": "100"}]},
    {"id": "order-2", "policy": "reservations", "function": "decide",
     "args": [{"quantity": "10", "pack_size": "5", "expires_at": "100"},
              {"available": "10", "now": "100"}]},
]
process = subprocess.run(
    [binary, "project", "serve", str(manifest)],
    input="".join(json.dumps(request) + "\n" for request in requests),
    text=True, capture_output=True, timeout=15, check=True,
)
frames = [json.loads(line) for line in process.stdout.splitlines()]
if len(frames) != len(requests) + 1 or frames[0]["adapter"]["phase"] != "ready":
    raise RuntimeError("Missing adapter readiness/response")
for request, response in zip(requests, frames[1:]):
    if (response["adapter"]["request_id"] != request["id"]
            or response["adapter"]["policy_id"] != request["policy"]
            or response["status"] != "Complete"
            or response["report"]["result"]["type"] != "Decision"
            or response["adapter"]["manifest_hash"] != frames[0]["adapter"]["manifest_hash"]
            or response["adapter"]["source_revision"] != frames[0]["adapter"]["policies"][0]["source_revision"]):
        raise RuntimeError("Incomplete or mismatched decision; do not act on it")
    print(json.dumps({"id": request["id"],
                      "revision": response["adapter"]["source_revision"],
                      "decision": response["report"]["result"]["value"]}))
