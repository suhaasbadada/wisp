"""CSV framing only; the trusted Rust CLI owns all language/business checks."""
import argparse
import csv
import hashlib
import io
import os
from pathlib import Path
import stat
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "clients" / "python"))
from wisp_client import ClientError, decode_json, encode_json, run_cli, validate_json

CAP = 65536
COMPILER = "wisp-0.1.0-semantics-7"
HEADER = ["quantity", "unit_cents", "declared_cents"]
FORBIDDEN = {"result", "usage", "invocation", "execution_key", "__encoded_call_value"}


def require(condition):
    if not condition:
        raise ClientError("Invalid input or native report")


def read_file(path):
    # NONBLOCK prevents a substituted FIFO from blocking before fstat. Opened
    # descriptors, not a second pathname read, own each immutable snapshot.
    require(stat.S_ISREG(os.stat(path).st_mode))
    fd = os.open(path, os.O_RDONLY | os.O_NONBLOCK)
    with os.fdopen(fd, "rb", buffering=0) as stream:
        require(stat.S_ISREG(os.fstat(stream.fileno()).st_mode))
        raw = bytearray()
        while len(raw) <= CAP:
            chunk = stream.read(CAP + 1 - len(raw))
            if not chunk:
                break
            raw.extend(chunk)
    require(len(raw) <= CAP and not raw.startswith(b"\xef\xbb\xbf") and b"\r" not in raw)
    return raw.decode("utf-8")


def arguments(text, payment):
    # Build incrementally: many tiny CSV rows must not cause an unbounded JSON
    # expansion before the cap is checked. Cells are never stripped or coerced.
    reader = csv.reader(io.StringIO(text, newline=""), strict=True)
    require(next(reader, None) == HEADER)
    tail = "]," + encode_json(payment) + "]"
    size = len(("[" + "[" + tail).encode("utf-8"))
    require(size <= CAP)
    rows = []
    for cells in reader:
        require(len(cells) == 3 and all(cell != "" for cell in cells))
        row = encode_json(dict(zip(HEADER, cells)))
        size += len(row.encode("utf-8")) + (1 if rows else 0)
        require(size <= CAP)
        rows.append(row)
    return "[[" + ",".join(rows) + tail


def digest(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def exchange(binary, op, source, args):
    # Keep args as an exact raw value fragment; reserializing a parsed array
    # could silently change the identity covered by native argument_hash.
    request = ('{"op":' + encode_json(op) + ',"source":' + encode_json(source)
               + ',"function":"reconcile","args":' + args + '}')
    require(len(request.encode("utf-8")) <= 1048576)
    report = decode_json(run_cli(binary, ["--json"], input_text=request, timeout=30))
    validate_json(report)
    require(isinstance(report, dict) and report.get("compiler") == COMPILER
            and report.get("revision") == digest(source)
            and isinstance(report.get("diagnostics"), list)
            and report.get("probes") == [] and isinstance(report.get("output"), str))
    return report


def validation(report, args):
    require(report.get("status") in ["Ready", "Error", "Unknown"]
            and report["output"] == "" and not FORBIDDEN.intersection(report)
            and "new_execution" not in report)
    marker = report.get("input_validation")
    require(isinstance(marker, dict) and type(marker.get("contract_version")) is int
            and marker["contract_version"] == 1 and marker.get("new_execution") is False
            and marker.get("target") == "reconcile" and not FORBIDDEN.intersection(marker))
    if report["status"] == "Ready":
        require(set(report) == {"agent_view", "compiler", "diagnostics", "graph",
                               "input_validation", "limits", "output", "probes",
                               "revision", "status", "syntax_limits"}
                and marker == {"contract_version": 1, "phase": "validated",
                          "new_execution": False, "target": "reconcile",
                          "argument_count": 2, "argument_hash": digest(args)}
                and type(marker.get("argument_count")) is int
                and report["diagnostics"] == [])
    else:
        require(marker.get("phase") == "preflight" and report["diagnostics"]
                and "argument_hash" not in marker and "argument_count" not in marker)


def invocation(report):
    require(report.get("status") in ["Complete", "Error", "Unknown"]
            and "input_validation" not in report and "__encoded_call_value" not in report)
    marker = report.get("invocation")
    require(isinstance(marker, dict) and marker.get("target") == "reconcile"
            and type(marker.get("new_execution")) is bool)
    if marker["new_execution"]:
        key = marker.get("execution_key")
        require(isinstance(key, str) and len(key) == 64
                and all(c in "0123456789abcdef" for c in key)
                and isinstance(report.get("usage"), dict))
    else:
        require("execution_key" not in marker and "usage" not in report)
    if report["status"] == "Complete":
        require(marker["new_execution"] and report["diagnostics"] == []
                and isinstance(report.get("result"), dict)
                and isinstance(report["result"].get("type"), str)
                and "value" in report["result"])
    else:
        require("result" not in report and report["diagnostics"])


def write_args(path, args):
    # O_EXCL refuses existing files AND symlinks; no parent creation, no chmod
    # on existing data. On failed writes clear only our open inode, never unlink
    # a pathname that another process could have replaced in the meantime.
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "wb", buffering=0) as stream:
        try:
            remaining = memoryview(args.encode("utf-8"))
            while remaining:
                written = stream.write(remaining)
                if not written:
                    raise OSError("Incomplete arguments write")
                remaining = remaining[written:]
        except OSError:
            os.ftruncate(stream.fileno(), 0)
            raise


class Parser(argparse.ArgumentParser):
    def error(self, message):
        raise ClientError("Invalid command line")


def main(argv=None):
    parser = Parser(description=__doc__)
    parser.add_argument("--csv", required=True)
    parser.add_argument("--payment-cents", required=True)
    parser.add_argument("--source", default=ROOT / "examples" / "invoice-batch.wisp")
    parser.add_argument("--binary", default=ROOT / "target" / "debug" / "wisp")
    parser.add_argument("--execute", action="store_true")
    parser.add_argument("--args-out")
    try:
        options = parser.parse_args(argv)
        args = arguments(read_file(options.csv), options.payment_cents)
        source = read_file(options.source)
        report = exchange(options.binary, "validate-call", source, args)
        validation(report, args)
        if report["status"] == "Ready":
            if options.args_out is not None:
                write_args(options.args_out, args)
            if options.execute:
                report = exchange(options.binary, "call", source, args)
                invocation(report)
        sys.stdout.write(encode_json(report) + "\n")
        return {"Ready": 0, "Complete": 0, "Error": 1, "Unknown": 3}[report["status"]]
    except (ClientError, OSError, ValueError, UnicodeError, csv.Error,
            TypeError, KeyError, RecursionError):
        sys.stderr.write("Invoice CSV host/transport failure; inspect inputs and trusted CLI separately.\n")
        return 2


if __name__ == "__main__":
    sys.exit(main())
