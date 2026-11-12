# Manual List scenario builder

**Create a scenario from function inputs** uses the existing Rust `describe`
operation (compiler semantics-7, checked interface v2, List JSON-array encoding).
Describe checks declarations only: no Machine, top-level code, probes or cases
execute. Ready is neither Pass nor approval. Capture your baseline separately.

Choose a native-described function. List parameters, nested record members and
required results have empty **List JSON** textareas. Labels retain native element
descriptors; required result types use recursive public names such as `[Int]` or
`[[Line]]`, not `List`. Scalar/record forms are unchanged. Owners type **all**
values; no current Invoke arguments or observed expectations are extracted.
Example: `["1", "-9223372036854775808"]`. Empty lists require typing `[]` explicitly.

Before any workspace write, each List payload must be complete unique-key array
JSON, valid scalar Unicode, LF-only, without BOM, at most 64 KiB UTF-8 and 17 JSON
container levels. Escaped duplicate keys are rejected before parsing can normalize
them. Parsed cells may only be strings, booleans, plain records and lists: **every
JSON number and null is rejected**, including huge integers and `1e400`. Strings
and record keys must be Unicode/LF text. Admission allows at most 1024 elements per
list, 32 fields per record, 2048 values per payload, and 16 combined List/record
container levels, accounting for surrounding record fields and empty containers.
Unknown named records, cycles and metadata height beyond 16 cannot build a form.
These conservative UI bounds do not guarantee every native-valid value fits.

This is manual form authoring, **not an exact raw-file loader**: explicit Add may
canonicalize newly entered JSON whitespace, just like record forms. It never
rounds numbers or converts them into strings/null. Int text such as `"01"` remains
unchanged; Rust Review can reject it with preflight Error and no case invocations.
Use the advanced raw suite editor for unsupported or intentionally invalid numeric
cases. No new language, source parser, evaluator or business rules are introduced.

**Add scenario** only stages a case, preserving both policies and keeping previous
complete inputs in this tab, while clearing old review evidence. Select **Review
cases** later for native validation and finite Pass/Fail/Error/Unknown results.
Wrong manual expected lists are not repaired. Rejected form JSON leaves workspace
and old review unchanged, with unadded text still visible.

Unchecked Replace appends only to byte-exact canonical pretty-printed supported
same-target version-1 suites, with fewer than 16 cases, unique IDs and a shared
2048-value admission budget across existing values. Old unknown shapes, duplicate
members, minified or unsupported suites are never silently repaired; explicit
**Replace existing scenarios** is required. Whole suite bytes remain capped at
64 KiB. Replacement is never implicit.

Unadded values are not saved inputs. Source/suite/baseline edits (even reverted),
baseline recapture, function changes, rereading, Stop and input replacement
invalidate the relevant form/binding. Identical no-op loads and rejected Add do
not reset text. Shape reading retains Stop and its five-second monotonic host
deadline through asynchronous source digest verification; stale replies/digests
cannot revive metadata or cancel a newer read. This does not change other native
execution deadline policies. See [Workbench](Workbench.md) and
[List value differences](List-value-differences.md); generic List UI is not complete.
