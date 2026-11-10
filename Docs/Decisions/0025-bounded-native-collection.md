# ADR 0025: Bound native output during collection

Status: accepted; shipped via PR #25 at
`18e30b58f5328a4cb8bb83fcb092e5a05b52fdb4`. Exact-head CI, immutable transport/SDK
checks, adverse artifacts and published contract acceptance are recorded there.

The Python command helper previously captured stdout and stderr in full before
MCP/focus applied their report-size checks. Rejecting a large report after capture
does not bound collection. Replace capture with concurrent capped readers and an
optional stdin writer, using the same deadline through child exit.

Stdout is limited to 4 MiB and stderr to 64 KiB in raw bytes. Overflow of either
invalidates the whole response, including exit-0 output. Strict UTF-8 decoding
follows bounded collection. Failures terminate/reap the direct child; successful
semantic exit behavior is unchanged. Raw newlines are preserved rather than
normalized. Generic errors never include captured data; unresolved execution is
not reported as success or zero execution.

This is trusted-binary transport hardening, not an arbitrary-executable sandbox,
descendant/process-group isolation, total memory bound or proof of cleanup on all
operating systems. Native Rust semantics, fixtures and permissions are unchanged.
Actual subprocess tests exercise cap boundaries, simultaneous pipe pressure,
blocked input, deadlines, malformed UTF-8, exits and direct-child/worker cleanup.
