# 0034: Proper tail calls and copy-eliding immutable evaluation

## Motivation

Language dogfooding exposed a practical runtime failure: a loan simulator using
ordinary recursive monthly state transitions exhausted evaluation depth at month
29. A balanced variant avoided that stack shape but exhausted cumulative logical
allocation on 360 months. The Python Decimal reference completed. UI polish did
not address either problem.

## Decision

Retain the grammar, type rules, sandbox permissions and every existing ceiling.
Implement return-position direct/mutual function calls as owned trampoline
steps. Selected if branches and block final expressions propagate tail position;
conditions, arguments, operands, initializers and statements do not. Evaluate
arguments in source order before unwinding lexical scopes and replacing the
current frame. Non-tail recursion remains depth-bounded, and all iterations
remain charged cumulative fuel/allocation.

Do not clone inherited immutable values on block entry; remove block-local
bindings on all exits. This depends on the existing checked no-shadowing rule.
Borrow variable-rooted projection ancestors, copy/preflight only the selected
payload, and move fields out of owned computed receivers. Whole-value lookups
and real aggregate copies retain their existing copy charges/depth preflight.

Resource outcomes and metering change, so use compiler semantics-6. Preserve the
semantics-5 historical fixtures and reject older artifacts before execution;
never rewrite compiler identifiers on old evidence. New current-compiler
fixtures pin fresh reproduction/context/usage and native/WASM parity.

## Acceptance and limits

The original 360-month Wisp program must complete under defaults and agree with
the independent Decimal reference. Regression tests cover proper and improper
tail positions, mutual calls, finite/infinite evaluation, reduced/zero budgets,
evaluation order, lexical/error cleanup and selected aggregate copy costs.
Logical allocation remains cumulative accounting, not measured heap usage.

This does not add collections, loops, decimal arithmetic, IO or general-purpose
language completeness. The balanced 360-month variant can still exhaust the
allocation budget; no claim says every algorithm for a task has identical costs.
No hardcoded loan behavior, blanket limit increase or host-side implementation
is accepted as the fix.
