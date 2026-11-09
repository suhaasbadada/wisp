# Language contract (first playable)

Wisp is experimental. The Rust lexer/parser/checker/interpreter is the only
implementation; no host process, filesystem, network, JavaScript evaluation,
mutation, imports, collections, records, loops or implicit conversions exist.

```wisp
fn bill(snacks: Int) -> Int {
    if snacks >= 10 { snacks * 80 } else { snacks * 100 }
}
print(bill(9));
probe n in 1..=11 { bill(n + 1) >= bill(n) }
```

The first failure is `n=9`. Replacing the first branch with
`900 + (snacks - 9) * 80` clears exactly 11 adjacent comparisons. This is finite
evidence, not a proof, an intent check, or automatic repair.

## Grammar and typing

- ASCII identifiers, decimal signed i64 literals (including minimum i64), Bool
  `true`/`false`, UTF-8 strings with `\n`, `\r`, `\t`, `\"`, `\\` escapes,
  whitespace and `//` comments. Non-ASCII identifiers are deferred.
- Top level: `fn name(param: Int, ...) -> Int { ... }`, statements, and
  `probe variable in signed_literal..=signed_literal { Bool_expression }`.
  Types in signatures are `Int`, `Bool`, `String`; there is no `return` keyword.
- Statements: `let name = expression;`, `print(expression);`, `expression;`.
  Print is captured output, not a callable function. It adds one newline. Strings
  print raw; Int decimal, Bool lowercase, internal Unit `()`.
- Blocks have lexical scopes and an optional final expression without semicolon;
  otherwise their type is internal Unit. A binding cannot shadow an existing
  binding in its scope or a parent scope. Parameters are immutable. Function
  calls resolve global functions, not values; functions cannot capture top-level
  bindings. Top-level bindings are visible to subsequent top-level statements,
  not to probes. Functions can call later definitions and recurse.
- `if condition { ... } else { ... }` is an expression; both branches must have
  the same type. Else is mandatory. Parenthesized expressions are supported.
- Precedence, low to high: `||`, `&&`, `== !=`, `< <= > >=`, `+ -`, `* / %`,
  unary `! -`. Binary operators associate left. Booleans short-circuit at runtime.
  Arithmetic and ordering require Int, logical operators Bool, equality equal
  types. String concatenation is deferred. Division truncates toward zero;
  remainder follows Rust signed remainder. Overflow (also minimum / -1 and
  minimum % -1) and zero division are Runtime errors, never wrapping values.
- Every expression, unused function and unreachable branch is checked before
  execution. Duplicate names/parameters, unknown names, mismatched arguments and
  results are errors. Unit is not a public signature type.

## Probes and interruption

Probes have independent local Int inputs, an ascending inclusive domain and a
Bool body. They cannot print, directly or through any transitive syntactic call,
including unreachable branches and recursive cycles. Whole-program purity/type
errors prevent all execution. There is no top-level binding capture in probes.
Top-level statements execute first in source order; probes execute afterward in
declaration order (even if textually interspersed with statements).

`Clear` means every declared case finished true; `Fail` stops at the first false
and records that input. Completed cases include the false case, not a faulting or
interrupted case. Reversed/empty ranges are Error. Fuel, calls, cases, source,
syntax, output or logical allocation limits produce Unknown, never Clear. A
domain exceeding the remaining case budget is Unknown without partial execution.
Limits are shared across the entire run; cases count attempted inputs. Other
probes can still execute after a probe fault, subject to the remaining budget.
An interrupted top-level execution prevents every probe from executing.

Default/hard ceilings: source 65,536 UTF-8 bytes, 8,192 tokens, syntax/AST depth
64, call depth 32, fuel 100,000 expression evaluations, output 8,192 UTF-8 bytes,
logical allocation 1,048,576 units, attempted cases 1,000. Requests may reduce
the configurable limits but cannot raise ceilings. Syntax limits are fixed.
Logical allocation is cumulative accounting (16 per expression, string byte
copies, binding name bytes plus 32, scope slots 64 plus string payloads); it is
**not actual allocator usage or a process/browser memory bound**. Compilation and
report construction are source/token bounded, not charged execution fuel.
Browser hard cancellation is a host responsibility; the language has no host IO.

All spans are half-open UTF-8 byte offsets into the exact submitted source.
Native CLI file reading is outside the sandboxed language core.
