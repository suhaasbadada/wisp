# Run a fixed-rate loan example

Open the public [language playground](https://suhaasbadada.github.io/wisp/#playground),
select **Loan repayment (360 months)**, then select **Run**. Selection loads and
checks the source; it does not execute it. The standalone source is
[`examples/loan.wisp`](../examples/loan.wisp); its top-level `print` produces:

```text
Summary { months_elapsed: 360, balance: 144, total_paid: 64751400, total_interest: 34751544, valid: true }
```

All money is integer **cents**. This is a 30,000,000-cent principal at 600 nominal
annual basis points (6%), paying 179,865 cents monthly for at most 360 months.
Monthly interest rounds half up to a cent using
`(balance * annual_bps + 60000) / 120000`. Each payment, including extra, is
capped at the balance plus that month's interest. The final 144-cent balance is
expected: this rounded payment does not quite clear the loan in 360 months.

## Change data without changing source

In **Invoke a typed function**, explicitly choose **simulate** and supply this
JSON array of arguments (Int values are decimal strings):

```json
[{"principal":"30000000","annual_bps":"600","payment":"179865","extra":"0","months":"360"}]
```

Select **Invoke**. It returns a typed `Summary`. Unlike Run, Invoke executes only
the selected function: the sample's top-level print does not run, so Output has
no captured function output. To add 20,000 cents each month, use:

```json
[{"principal":"30000000","annual_bps":"600","payment":"179865","extra":"20000","months":"360"}]
```

Invoke now returns `months_elapsed: 279`, `balance: 0`, `total_paid: 55634157`,
`total_interest: 25634157`, `valid: true` (integer fields are strings in the typed
JSON result). Editing code or refreshing metadata does not reset your arguments.
Selecting any example explicitly replaces the editor and resets arguments;
save your edits/inputs first. Choose `simulate` again if necessary.

## Native CLI

From a repository checkout with Rust installed:

```sh
cargo run -- check examples/loan.wisp
cargo run -- examples/loan.wisp
cargo run -- call examples/loan.wisp simulate --args-file - <<'JSON'
[{"principal":"30000000","annual_bps":"600","payment":"179865","extra":"20000","months":"360"}]
JSON
```

The browser uses the Rust core compiled to WASM; the CLI uses the same Rust
implementation. JSON is typed data, not source. Explicit CLI file/stdin reading
does not grant filesystem or network permissions to the language.

## Model and limits

`valid` means only that principal, payment, extra and months are nonnegative and
annual rate is between 0 and 10,000 basis points inclusive. Invalid inputs return
a zeroed summary with `valid: false`. It is **not loan approval, an affordability
assessment, or a promise of payoff**: payments below interest can produce a
growing balance with `valid: true`. Zero months performs no payments.

This illustrative fixed-rate model omits dates, fees, taxes and variable rates;
it is not financial advice or a lender's contractual calculation. The example
completes within the default 100,000 fuel and 1 MiB logical-allocation budgets;
large values can overflow (Error) and long runs can exhaust limits (Unknown).
There is no guarantee that all loans fit. Complete is one execution, not a proof.

See the [language/resource contract](Language.md), [CLI contract](CLI.md) and
[historical loan experiment](../evaluation/loan-dogfood/REPORT.md). The historical
floor-interest source remains unchanged; this runnable example uses half-up rounding.
