"""Run against the real native Rust core. No product changes, network or Docker.

From repo root: python3 -B evaluation/loan-dogfood/experiment.py
Raw evidence is retained in a new external run directory on every invocation.
"""
import hashlib
from collections import Counter
import json
from pathlib import Path
import subprocess
import tempfile

from reference import simulate

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
WISP = ROOT / "target/debug/wisp"
TEMP_ROOT = Path(tempfile.gettempdir())
OUT = Path(tempfile.mkdtemp(prefix="wisp-loan-", dir=(
    TEMP_ROOT / "opencode" if (TEMP_ROOT / "opencode").is_dir() else TEMP_ROOT
)))


def command(label, *args):
    result = subprocess.run([str(WISP), *map(str, args)], capture_output=True,
                            text=True, timeout=30)
    (OUT / f"{label}.stdout.json").write_text(result.stdout)
    (OUT / f"{label}.stderr.txt").write_text(result.stderr)
    return result.returncode, json.loads(result.stdout)


def loan(principal=100000, annual_bps=1200, payment=9000, extra=0, months=12):
    return {key: str(value) for key, value in locals().items()}


def wire(value):
    return {key: item if isinstance(item, bool) else str(item) for key, item in value.items()}


def call(label, source, data):
    path = OUT / f"{label}.args.json"
    path.write_text(json.dumps([data]))
    return command(label, "call", source, "simulate", "--args-file", path)


source = HERE / "loan.wisp"
code, focus = command("focus", "focus", source, "interest")
assert code == 0 and focus["status"] == "Ready", focus
function = next(row for row in focus["graph"]["functions"] if row["name"] == "interest")
candidate = OUT / "rounded.wisp"
code, edit = command("edit", "edit", source, "interest", "--replacement-file",
                     HERE / "round-half-up.body", "--expected-revision", focus["revision"],
                     "--expected-body", function["body_hash"], "--out", candidate)
assert code == 0 and edit["status"] == "Ready", edit
old = source.read_bytes()
span = function["body_span"]
replacement = (HERE / "round-half-up.body").read_bytes()
assert candidate.read_bytes() == old[:span["start"]] + replacement + old[span["end"]:]

# Stale source/body guards must fail, not write an alternative candidate.
stale_path = OUT / "stale.wisp"
code, stale = command("stale-edit", "edit", source, "interest", "--replacement-file",
                      HERE / "round-half-up.body", "--expected-revision", "0" * 64,
                      "--expected-body", function["body_hash"], "--out", stale_path)
assert code == 1 and not stale_path.exists(), stale

inputs = [
    ("one-year", loan()),
    ("extra-principal", loan(extra=2000)),
    ("early-payoff-capped-payment", loan(principal=10000, payment=20000)),
    ("zero-interest", loan(annual_bps=0)),
    ("zero-principal", loan(principal=0)),
    ("zero-term", loan(months=0)),
    ("negative-amortization", loan(payment=500)),
    ("rounding-half-cent", loan(principal=50, annual_bps=1200, payment=1, months=1)),
    ("rounding-below-half-cent", loan(principal=49, annual_bps=1200, payment=1, months=1)),
    ("rounding-above-half-cent", loan(principal=51, annual_bps=1200, payment=1, months=1)),
    ("invalid-negative", loan(principal=-1)),
    ("invalid-rate", loan(annual_bps=10001)),
]
cases = [dict(id=name, args=[data], expect=dict(result=dict(type="Summary",
         value=wire(simulate(data))), output="")) for name, data in inputs]
suite_path = OUT / "cases.json"
suite_path.write_text(json.dumps(dict(version=1, target="simulate", cases=cases), indent=2))
review_code, review = command("review", "review", source, candidate, "--suite", suite_path)
assert review_code == 0 and review["status"] == "Pass", review
for row, (_, data) in zip(review["review"]["cases"], inputs, strict=True):
    assert row["before"]["result"]["value"] == wire(simulate(data, rounded=False))
    assert row["after"]["result"]["value"] == wire(simulate(data))

# Calls are checked independently against Decimal, not inferred from review status.
observations = []
for name, data in inputs:
    exit_code, report = call(name, candidate, data)
    observations.append(dict(case=name, exit=exit_code, status=report["status"],
                             diagnostics=report.get("diagnostics", [])))
    assert exit_code == 0 and report["status"] == "Complete", report
    assert report["result"] == dict(type="Summary", value=wire(simulate(data))), report

long_data = loan(principal=30000000, annual_bps=600, payment=179865, months=360)
code, long_report = call("thirty-year", candidate, long_data)
assert long_report["status"] in ("Complete", "Unknown"), long_report
python_long = simulate(long_data)
if long_report["status"] == "Complete":
    assert long_report["result"]["value"] == wire(python_long)
if focus["compiler"] in ("wisp-0.1.0-semantics-6", "wisp-0.1.0-semantics-7"):
    assert code == 0 and long_report["status"] == "Complete", long_report

# Try a genuinely shallower Wisp algorithm before attributing linear-stack failure
# to all Wisp implementations. Keep the same runtime, limits and monthly arithmetic.
balanced_base = OUT / "balanced-base.wisp"
balanced_base.write_text(candidate.read_text() + "\n" + (HERE / "balanced-helper.wisp").read_text())
exit_code, balanced_focus = command("balanced-focus", "focus", balanced_base, "amortize")
assert exit_code == 0, balanced_focus
fn = next(row for row in balanced_focus["graph"]["functions"] if row["name"] == "amortize")
balanced = OUT / "balanced.wisp"
exit_code, balanced_edit = command("balanced-edit", "edit", balanced_base, "amortize",
    "--replacement-file", HERE / "balanced-amortize.body", "--expected-revision",
    balanced_focus["revision"], "--expected-body", fn["body_hash"], "--out", balanced)
assert exit_code == 0 and balanced_edit["status"] == "Ready", balanced_edit
exit_code, balanced_review = command("balanced-review", "review", candidate, balanced, "--suite", suite_path)
assert exit_code == 0 and balanced_review["status"] == "Pass", balanced_review
assert all(row["comparison"] == "Unchanged" for row in balanced_review["review"]["cases"])
_, balanced_long = call("balanced-thirty-year", balanced, long_data)
assert balanced_long["status"] in ("Complete", "Unknown"), balanced_long
if balanced_long["status"] == "Complete":
    assert balanced_long["result"]["value"] == wire(python_long)

# Explore the unchanged language's practical recurrence limit, not an unlimited claim.
completed = []
first_interruption = None
for months in range(1, 41):
    data = loan(months=months, payment=500)
    exit_code, report = call(f"depth-{months}", candidate, data)
    if report["status"] != "Complete":
        first_interruption = dict(months=months, status=report["status"],
                                  diagnostics=report.get("diagnostics", []))
        break
    assert report["result"]["value"] == wire(simulate(data))
    completed.append(months)

# Independent accounting checks on the Python reference.
for _, data in inputs:
    result = simulate(data)
    if result["valid"]:
        assert int(data["principal"]) + result["total_interest"] - result["total_paid"] == result["balance"]
        assert result["balance"] >= 0

summary = dict(
    artifact_directory=str(OUT), compiler=focus["compiler"],
    source_sha256=hashlib.sha256(old).hexdigest(),
    review_status=review["status"], review_exit=review_code,
    comparisons=dict(Counter(row["comparison"] for row in review["review"]["cases"])),
    calls=observations,
    guarded_body_edit="Ready; exact outside-body preservation checked",
    stale_edit_rejected=stale["status"],
    first_recurrence_interruption_in_1_to_40=first_interruption,
    largest_completed_months_in_1_to_40=max(completed, default=0),
    thirty_year_wisp=dict(status=long_report["status"], diagnostics=long_report.get("diagnostics", [])),
    thirty_year_usage=long_report.get("usage"),
    thirty_year_python=python_long,
    balanced_short_review=balanced_review["status"],
    balanced_thirty_year=dict(status=balanced_long["status"],
        diagnostics=balanced_long.get("diagnostics", []), usage=balanced_long.get("usage")),
)
(OUT / "summary.json").write_text(json.dumps(summary, indent=2))
print(json.dumps(summary, indent=2))
