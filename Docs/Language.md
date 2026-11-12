# Language contract (first playable)

Wisp is experimental. The Rust lexer/parser/checker/interpreter is the only
implementation; no host process, filesystem, network, JavaScript evaluation,
mutation, imports, collections, loops or implicit conversions exist. Immutable
nominal records are supported; classes, methods and object identity are not.

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

Compact grammar (keywords/punctuation literal; binary precedence follows below):

```ebnf
program = { record | function | probe | statement } ;
record = "record", identifier, "{", [ field, { ",", field } ], "}" ;
field = identifier, ":", type ;
function = "fn", identifier, "(", [ parameter, { ",", parameter } ], ")", "->", type, block ;
parameter = identifier, ":", type ;
type = "Int" | "Bool" | "String" | identifier ;
probe = "probe", identifier, "in", signed_integer, "..=", signed_integer, block ;
statement = "let", identifier, "=", expression, ";"
          | "print", "(", expression, ")", ";" | expression, ";" ;
block = "{", { statement }, [ expression ], "}" ;
expression = literal | identifier | identifier, "(", [ expression, { ",", expression } ], ")"
           | "(", expression, ")" | block | "if", expression, block, "else", block
           | unary_op, expression | expression, binary_op, expression
           | "new", identifier, "{", [ initializer, { ",", initializer } ], "}"
           | expression, ".", identifier ;
initializer = identifier, ":", expression ;
literal = signed_integer | string | "true" | "false" ;
unary_op = "!" | "-" ;
binary_op = "||" | "&&" | "==" | "!=" | "<" | "<=" | ">" | ">=" | "+" | "-" | "*" | "/" | "%" ;
```

`identifier` starts with ASCII letter or underscore, followed by ASCII letters,
digits or underscores; keywords and primitive type spellings are reserved.
`record` and `new` are keywords; declared record names are not reserved in the
separate function/value namespace. Integer magnitudes outside
i64 are rejected (the unary minimum-i64 spelling is supported). String quoting
and escapes are specified below. Trailing parameter/argument commas are not supported.

- ASCII identifiers, decimal signed i64 literals (including minimum i64), Bool
  `true`/`false`, UTF-8 strings with `\n`, `\r`, `\t`, `\"`, `\\` escapes,
  whitespace and `//` comments. Non-ASCII identifiers are deferred.
- Top level: `fn name(param: Int, ...) -> Int { ... }`, statements, and
  `probe variable in signed_literal..=signed_literal { Bool_expression }`.
  Types in signatures are `Int`, `Bool`, `String` or a declared record name;
  there is no `return` keyword.
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
  unary `! -`, postfix field projection. Binary operators associate left.
  Booleans short-circuit at runtime.
  Arithmetic and ordering require Int, logical operators Bool, equality equal
  types. String concatenation is deferred. Division truncates toward zero;
  remainder follows Rust signed remainder. Overflow (also minimum / -1 and
  minimum % -1) and zero division are Runtime errors, never wrapping values.
- Every expression, unused function and unreachable branch is checked before
  execution. Duplicate names/parameters, unknown names, mismatched arguments and
  results are errors. Unit is not a public signature type.

### Tail calls and lexical scopes (semantics-6)

A function call in the return position of a function reuses its active call
frame. Return position propagates through a block's final expression and the
selected branch of an `if`; it does not include conditions, arguments,
initializers, statement expressions, binary/unary operands or record fields.
Direct and mutual tail calls use a trampoline, not a growing Rust/WASM stack.
Arguments still evaluate left-to-right before switching to a fresh parameter
environment. Other calls retain the existing call/evaluation-depth bounds.

Fuel and cumulative logical allocation remain charged on every iteration;
unending tail calls still yield Unknown on exhaustion. Expression nesting within
each iteration also remains depth-bounded. All ceilings below are unchanged.
Block scopes reuse inherited immutable bindings without copying their values;
block-local names are removed on return, tail jump or error. The checker still
rejects shadowing. These are execution-model changes, not mutation or closures.

## Immutable nominal records

```wisp
record Item { quantity: Int, unit_price: Int }
fn total(item: Item) -> Int { item.quantity * item.unit_price }
print(total(new Item { quantity: 9, unit_price: 100 }));
```

Record declarations are global and may refer forward to other record types.
Every declaration/signature is checked, including unused ones. Duplicate record
or field names, unknown types and direct/indirect recursive records are errors.
Record types are nominal: two differently named records are incompatible even
with identical fields. Empty records (`record Empty {}` / `new Empty {}`) work.

Constructors require every declared field exactly once with the declared type.
Initializers evaluate **once in source order**, including faults and captured
prints; stored fields and display follow **declaration order**. The explicit
`new` avoids ambiguity with `if condition { ... }`. No trailing field commas,
defaults, shorthand, spread/update, methods, callable fields or mutation exist.
Projection accepts any record expression (`make().quantity`,
`new Item { quantity: 9, unit_price: 100 }.quantity`, or an if expression), and
binds tighter than unary and binary operators. Unknown fields are type errors
with field-token spans. All constructor initializers and projection receivers
participate in checking, call dependencies and transitive probe purity, even in
unreachable branches.

Equality requires the same nominal type and recursively compares field values
in declaration order, stopping on the first mismatch. This order affects fuel
consumption and whether a tight budget completes or yields Unknown.
Display is `Item { quantity: 9, unit_price: 100 }`; empty records display
`Empty {}`. Nested strings are quoted with escaped quote, backslash, newline,
return and tab (other control characters use `\uXXXX`); standalone strings
continue to print raw. Each print ends in one newline.

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
64, record fields 32, record type depth 16, runtime record value depth 16,
call depth 32, combined evaluation stack depth 128, fuel 100,000 units,
output 8,192 UTF-8 bytes,
logical allocation 1,048,576 units, attempted cases 1,000. Requests may reduce
the configurable limits but cannot raise ceilings. Syntax limits are fixed.
Type depth counts record nodes, so an empty record has depth 1; primitives have
depth 0. A memoized, depth-bounded DAG walk checks types without expanding shared
definitions as trees. Runtime value depth is checked separately before building
an enclosing record or recursively copying one. Projection chains also obey
the 64 syntax/AST limit.

Logical allocation is cumulative accounting, not live retained size:

- 16 units per evaluated expression; UTF-8 byte length for each string literal
  allocation or string copy.
- A newly constructed or copied record costs `32 + type_name_bytes +
  32 * field_count + sum(field_name_bytes)`, plus recursively copied child
  payloads when copying. Construction moves the evaluated children; its fixed
  field charge covers the logical storage/reordering overhead, not a measured
  Rust layout.
- Let/function parameter bindings cost `32 + binding_name_bytes`; argument
  values move into parameter bindings, not an additional aggregate copy.
- Blocks do not allocate copies of inherited bindings. Their expression and
  newly introduced binding costs still apply. A variable lookup copies its
  value and charges its full payload. A variable-rooted projection chain borrows
  ancestors and copies only the selected value, charging each traversed expression
  and preflighting the selected payload's depth, fuel and allocation. Projection
  from a computed, owned receiver moves the selected field without a second copy;
  producing that receiver was already charged.
- Tail calls allocate/charge their evaluated arguments and new parameter
  bindings normally, while replacing rather than accumulating caller frames.
- Copy preflight iteratively checks depth, charges fuel and reserves the complete
  payload before recursively allocating it. Runtime values deliberately have no
  derived `Clone` or `PartialEq` that could bypass accounting.

Fuel charges one per expression, one per value node visited by a copy/equality
or display, one per child value node examined by constructor depth validation,
and one per UTF-8 byte copied from string literals/copies. String equality
charges both byte lengths before comparing; record equality may short-circuit
on the first unequal field (traversal uses a bounded explicit stack). Display
also charges each emitted UTF-8 byte, including escapes, names and newline.
Formatting appends bounded fragments directly into the capped output buffer,
never constructs a whole aggregate string first. An interrupted print rolls
back that print's output, but retains consumed fuel/allocation. Other counters
may include the attempted charge that exceeded a limit.

These units are **not actual allocator usage or a process/browser memory bound**.
These accounting/termination changes require compiler identity
`wisp-0.1.0-semantics-6`. Semantics-5 historical artifacts are not migrated or
reinterpreted under the new accounting; exact-compiler checks reject them.
Compilation and
report construction are source/token bounded, not charged execution fuel.
Browser hard cancellation is a host responsibility; the language has no host IO.

All spans are half-open UTF-8 byte offsets into the exact submitted source.
Native CLI file reading is outside the sandboxed language core.
