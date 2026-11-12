# 0036: Nonexecuting function input checks

The host operation `validate-call` shares whole-program checking and the strict
raw typed input decoder with `call`, then returns before execution identity or
Machine creation. Rust remains the sole implementation. Compiler semantics-7
and checked-interface v2 remain unchanged: no evaluation rules or existing call
identities change. Input-validation metadata has its own contract v1.

Ready means every argument matches the checked function boundary, not that the
function succeeds, fits runtime limits, satisfies business rules or is approved.
No top-level statement, probe or function body executes; no result, runtime usage
or invocation execution key is returned. Zero execution budgets can still yield
Ready. Source, raw input bytes, list/container depth and request bounds still apply.

The browser loads only explicit bounded UTF-8 files without normalization, invokes
the Rust validator in an independent disposable worker, and checks native identity
against the exact current snapshot. Generation changes invalidate read/worker/
digest continuations even after edit-and-revert. Timer cancellation and monotonic
elapsed-time checks both enforce the five-second acceptance deadline; a delayed
timer cannot permit a late read or digest to commit.

Export requires current Ready and contains only exact source/data, native
nonexecution metadata and trusted fixed instructions. Fixed regular USTAR names
and a strict ASCII target prevent paths or data from becoming shell commands.
Validation hashes retained RawValue bytes, not a normalized value or a complete
file with surrounding JSON separator whitespace. Export retains that full file
text. A fresh native call remains a distinct explicit attempt. No storage,
network, compiler installation, inferred expectation or payment permission is added.
