"""One read-only operator entry point for explicit capture or saved evidence."""
import argparse
import importlib.util
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("wisp_release_capture", HERE / "capture.py")
capture_host = importlib.util.module_from_spec(spec)
spec.loader.exec_module(capture_host)
triage = capture_host.triage
from wisp_client import ClientError, encode_json


def observe(raw, binary, mode):
    triage.require(mode in {"saved", "github-explicit-attempt"}, "Unsupported collection mode")
    data, digest = triage.decode_evidence(raw)
    report = triage.triage(data, digest, binary)
    code = triage.report_exit(report)
    return {"contract_version": 1, "kind": "wisp-workflow-observation", "status": report["status"],
            "approval": "not_granted", "side_effects": "none",
            "collection": {"mode": mode, "snapshot_json": raw.decode("utf-8"), "snapshot_hash": digest,
                           "api_get_invocations": 6 if mode == "github-explicit-attempt" else 0,
                           "repository_mutations": False}, "triage": report}, code


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--evidence", type=pathlib.Path)
    source.add_argument("--revision")
    for name in ["checks-run", "checks-attempt", "pages-run", "pages-attempt"]:
        parser.add_argument("--" + name, type=int)
    parser.add_argument("--wisp", default="target/debug/wisp")
    args = parser.parse_args()
    selected = [args.checks_run, args.checks_attempt, args.pages_run, args.pages_attempt]
    if args.evidence is not None and any(value is not None for value in selected):
        parser.error("Saved evidence cannot be combined with GitHub run/attempt selection")
    if args.revision is not None and any(value is None for value in selected):
        parser.error("Explicit GitHub capture requires both run IDs and both attempts")
    try:
        if args.evidence is not None:
            with open(args.evidence, "rb") as stream:
                raw = stream.read(65537)
            mode = "saved"
        else:
            raw = capture_host.capture(args.revision, *selected).encode("utf-8")
            mode = "github-explicit-attempt"
        receipt, code = observe(raw, args.wisp, mode)
        print(encode_json(receipt, ascii_strings=True), flush=True)
        return code
    except (ClientError, OSError, ValueError, TypeError, KeyError, RecursionError) as error:
        if isinstance(error, BrokenPipeError):
            try: sys.stdout.close()
            except OSError: pass
        print("Observation host error: " + str(error), file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
