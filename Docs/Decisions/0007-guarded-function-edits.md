# ADR 0007: revision-guarded function-body preparation

Accepted 2026-11-09. This is a narrow first structured-edit workflow, not persistent semantic IDs, arbitrary patches, automatic repair or a choice of human intent. Only a currently well-formed, whole-program-checked baseline is supported; invalid baseline repair remains deferred.

## Contract and precedence

Add host `op:"edit"`, explicit `focus` global function name and strict `change:{expected_revision,expected_body_hash,replacement}`. Both hashes are canonical lowercase SHA-256. Names are revision-local; both whole-source and exact body-version guards are required. `change` presence on every non-edit operation is rejected, even null, before early call dispatch. Preserve existing request/null/duplicate/raw JSON policies and compiler semantics-5/hash/artifact/query/call behavior. Edit contract version1 is separate; new codes/discovery data are additive.

Order: transport/schema → limits → operation-specific field policy/change schema/explicit focus/hash form → base source size/parse/whole-program checking → expected whole revision → exact target lookup → expected body hash → bounded standalone replacement block → combined candidate size/parse/check → preservation audit. Baseline errors preempt stale revision conflicts; explicit invalid target/guard is never substituted.

Parse replacement with the real block parser, require EOF and raw whitespace-only text outside the parsed block span, using the lexer's whitespace definition and the same iterative AST-depth validation. Leading/trailing comments are rejected even if EOF parsing would ignore them: a trailing `//` could consume a preserved suffix. Comments and brace-looking strings inside the block are allowed. No synthetic wrapper or regex splice boundaries.

Construct exactly `base[..body.start] + replacement + base[body.end..]`, with checked size before allocation. Distinguish insertion range (all submitted bytes) from candidate body span (braces excluding outside whitespace); body hash uses the latter, matching compiler metadata. Preserve exact original prefix/suffix and declared signature, record declarations, other function bodies, top-level expressions, and every indexed probe's exact text/domain/predicate key, including duplicates. Leading replacement whitespace can extend the parsed header range; do not fabricate identical raw header slices. Dependency/query keys and source offsets can legitimately change.

## Preparation and diagnostic ownership

Success is Ready, `state:"prepared"`, `new_execution:false`: a checked candidate source with base/candidate revisions, body hashes/ranges and preservation audit. No Machine, runtime usage, observed probes or proof. A runtime-faulting or behaviorally wrong body can still be well typed. Probe text preservation is not a guarantee of all human requirements or intent; explicit replacement may alter comments inside the body. Caller must review the diff and run acceptance tests separately.

Baseline diagnostics own baseline spans. Invalid replacement uses a data-path/sentinel root diagnostic and explicitly tagged replacement-relative cause. Candidate checker errors use a root `E_EDIT_CANDIDATE` Input at `/change/replacement`, sentinel0, with a separately tagged `rejected_candidate:{document,source,revision,diagnostics}`—never present candidate spans as current editor/base spans. A purity error can target an unchanged downstream probe at a shifted offset. Resource exhaustion remains Unknown with the original limit reason/document provenance; do not turn it into passing preparation or generic Error. Failures never expose an accepted prepared source/state.

## Host application

Core prepares data only and never mutates host files/editor. Native `wisp edit FILE FUNCTION --replacement-file BODY --expected-revision SHA --expected-body SHA --out NEWFILE` writes exact candidate bytes only after Ready using exclusive create-new (no added newline, overwrite or source mutation). Reject duplicate/missing flags and conflicting stdin inputs. Host write/flush failure is stderr/exit2; a partial new file may remain, as with artifact export.

Browser has explicit Preview then Apply, using fresh compiler metadata, exact source/target/replacement/config snapshot plus generation counters. Every edit, including edit-and-revert or unrelated source changes, invalidates application. Stop/deadline/new Preview/late replies cannot accept stale candidates. Recheck synchronously on Apply, consume once, update editor via source invalidation and perform no automatic execution. Use full prepared source or correct UTF-8 conversions, never Rust byte offsets as UTF-16 indexes. Historical ghosts/sources remain unchanged; replay is still a new execution.

## Challenge and acceptance

Astra challenged precedence, early call-field guards, comment-boundary injection, block vs insertion spans, downstream diagnostic ownership, preservation audits and independent host guards. Require native/WASM parity, exact prefix/suffix/specification preservation, stale/malformed guards, null/duplicate envelopes on all operations, comments/extra blocks/Unicode/CRLF, source/token/depth limits with Unknown provenance, shifted candidate errors, typed runtime-faulting Ready, CLI create-new/exact bytes, UI stale/revert/cancel/Unicode/double-Apply/history and frozen semantics-5 artifact/call/context fixtures. No source/spec editing to manufacture passing checks.
