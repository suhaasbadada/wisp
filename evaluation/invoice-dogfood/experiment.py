"""Independent Decimal oracle for the real native Wisp invoice program.

Run from any directory: python3 -B evaluation/invoice-dogfood/experiment.py
WISP_BIN may select the native CLI built by Cargo integration tests.
Only the host harness does file/process IO; every tested calculation is Wisp.
"""
from decimal import Decimal
import json
import os
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
BINARY = os.environ.get("WISP_BIN", str(ROOT / "target/debug/wisp"))
SOURCE = (ROOT / "examples/invoice-batch.wisp").read_text()
TEMP_ROOT = Path(tempfile.gettempdir())
OUT = Path(tempfile.mkdtemp(prefix="wisp-invoice-", dir=(
    TEMP_ROOT / "opencode" if (TEMP_ROOT / "opencode").is_dir() else TEMP_ROOT
)))


def oracle(rows, payment):
    # Work in Decimal, select invalid lines first, then aggregate valid products.
    # This is not a translation of Wisp's recursive state transition.
    decoded = [tuple(Decimal(row[key]) for key in
                     ("quantity", "unit_cents", "declared_cents")) for row in rows]
    valid = [row for row in decoded if all(value >= 0 for value in row)]
    computed = sum((quantity * unit for quantity, unit, _ in valid), Decimal(0))
    declared = sum((amount for _, _, amount in valid), Decimal(0))
    mismatches = sum(quantity * unit != amount for quantity, unit, amount in valid)
    invalid = len(decoded) - len(valid)
    mismatch_indices = [index for index, (quantity, unit, amount) in enumerate(decoded)
                        if all(value >= 0 for value in (quantity, unit, amount))
                        and quantity * unit != amount]
    invalid_indices = [index for index, row in enumerate(decoded)
                       if any(value < 0 for value in row)]
    paid = Decimal(payment)
    return dict(line_count=str(len(rows)), computed_cents=str(int(computed)),
                declared_cents=str(int(declared)), mismatched_lines=str(mismatches),
                first_mismatched_index=str(min(mismatch_indices, default=-1)),
                invalid_lines=str(invalid),
                first_invalid_index=str(min(invalid_indices, default=-1)), payment_cents=str(int(paid)),
                payment_difference_cents=str(int(computed - paid)),
                balanced=paid >= 0 and invalid == 0 and mismatches == 0 and computed == paid)


def invoke(name, args):
    request = dict(op="call", source=SOURCE, function="reconcile", args=args)
    raw = json.dumps(request)
    (OUT / (name + ".request.json")).write_text(raw)
    response = subprocess.run([BINARY, "--json"], input=raw, text=True,
                              capture_output=True, timeout=30, check=True)
    (OUT / (name + ".response.json")).write_text(response.stdout)
    return json.loads(response.stdout)


def row(quantity, unit, declared):
    return dict(quantity=str(quantity), unit_cents=str(unit), declared_cents=str(declared))


worked = [row(2, 250, 500), row(3, 100, 290), row(1, 700, 700)]
mixed = [row(-(i % 7 + 1) if i % 37 == 0 else i % 7 + 1,
             100 + i * 3, (i % 7 + 1) * (100 + i * 3) + (1 if i % 13 == 0 else 0))
         for i in range(200)]
cases = [("empty", [], "0"), ("worked-mismatch", worked, "1500"),
         ("balanced", [row(2, 250, 500), row(3, 100, 300), row(1, 700, 700)], "1500"),
         ("underpaid", [row(2, 250, 500)], "499"),
         ("overpaid", [row(2, 250, 500)], "501"),
         ("invalid", [row(-1, 250, 250), row(1, 100, 100)], "100"),
         ("zero-values", [row(0, 250, 0), row(1, 0, 0)], "0"),
         ("negative-payment", [row(1, 100, 100)], "-1"), ("mixed-200", mixed, "300000"),
         ("invalid-and-multiple-mismatches", [row(1, 100, 100), row(1, -100, 0),
                                             row(2, 100, 199), row(1, 100, 99),
                                             row(1, 100, -1)], "400"),
         ("last-mismatch", [row(1, 100, 100), row(2, 100, 199)], "300"),
         ("last-invalid", [row(1, 100, 100), row(1, 100, -1)], "100")]
observations = []
for name, rows, payment in cases:
    report = invoke(name, [rows, payment])
    assert report["status"] == "Complete", report
    assert report["result"] == {"type": "Reconciliation", "value": oracle(rows, payment)}, report
    assert report["output"] == "", report
    observations.append(dict(case=name, status=report["status"], usage=report["usage"]))

overflow = invoke("overflow", [[row(9223372036854775807, 2, 0)], "0"])
assert overflow["status"] == "Error" and overflow["diagnostics"][0]["code"] == "E_INT_OVERFLOW"
assert "result" not in overflow
malformed = [dict(item) for item in mixed]
malformed[-1]["quantity"] = 1
bad = invoke("malformed-last", [malformed, "0"])
assert bad["status"] == "Error" and bad["invocation"]["new_execution"] is False
assert bad["diagnostics"][0]["path"] == "/args/0/199/quantity" and "result" not in bad
summary = dict(artifact_directory=str(OUT), complete_cases=observations,
               independent_oracle="Python Decimal selection and aggregation",
               overflow_not_partial=True, malformed_last_prevents_execution=True)
(OUT / "summary.json").write_text(json.dumps(summary, indent=2))
print(json.dumps(summary, indent=2))
