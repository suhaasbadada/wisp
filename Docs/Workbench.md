# Policy-change workbench v1

For saved suites across a repository and a single agent/CI entry point, use
[native policy projects](Projects.md): `wisp project verify MANIFEST` or
`wisp project review BASE_MANIFEST CANDIDATE_MANIFEST`.

For interacting policies, use the [composed order workflow](Order-workflow.md).
It retains component evidence and full before/after application observations;
passing individual expectations is not approval of the composed business effect.

Review a concrete policy change using caller-owned structured examples, exact
source revisions and observed before/after results. The shared Rust implementation
runs in native CLI and browser WASM. It does not pick your requirements, change
expectations, apply edits, approve a change, commit or deploy.

## Try the reservation workflow

In the playground open **Policy change workbench** and select **Load reservation
walkthrough (replaces editor)**. This explicit action captures the old policy as
baseline, places the proposed policy in Code and loads seven expectations. Nothing
executes until **Review cases**. Expect Pass with **2 Changed / 5 Unchanged**:
partial-pack rounding changes from 2 to 3 packs, and expiry equality becomes a
rejection. Expand cases for exact typed results, outputs, diagnostics and usage.

Change an expected value to an incorrect number **string**, then review again:
the candidate expectation fails. The tool leaves that specification untouched.
Pass means only these finite examples matched under limits; **Pass is not
approval**, Changed is not an intent judgment, and Unknown cannot pass.

To use your own policy: put its source in Code, **Capture editor as baseline**,
edit the candidate, enter the suite and Review. Baseline is an immutable in-memory
snapshot until explicit recapture; it is not a stable semantic ID or saved file.
Existing Run output/probes and historical ghosts remain independent.

Native equivalents:

```sh
cargo build
target/debug/wisp review examples/policies/reservations-before.wisp \
  examples/policies/reservations-after.wisp --suite examples/policies/cases.json
target/debug/wisp verify examples/policies/reservations-after.wisp \
  --suite examples/policies/cases.json
```

`verify` self-compares one source against the same explicit expectations. It is
not a proof or full-domain verification. The first command reports two changes;
candidate verify passes with no before/after differences. Verifying the old
policy fails. Commands write no files; stdout is structured JSON. Exit 0 Pass,
1 Fail/Error, 3 Unknown, 2 host IO/usage. Source/suite files are bounded UTF-8,
64 KiB each, with at most one physical stdin input. See [CLI](CLI.md).

## Author explicit cases

```json
{"version":1,"target":"twice","cases":[
  {"id":"positive","args":["2"],
   "expect":{"result":{"type":"Int","value":"4"},"output":""}}
]}
```

Int values are canonical signed-i64 strings, Bool is JSON boolean, String is JSON
text, nominal records are exact objects, and `[T]` values are JSON arrays of T
(Int elements remain strings). Every expected result names the
checked return type; captured output is mandatory and exact, including newlines,
Unicode and NUL. Duplicate/unknown/missing fields are rejected by Rust. Expected
data is validated, never executed or rewritten. Object field order/JSON escape
spelling does not change typed equality; captured output is not normalized.
Lists compare ordered typed contents, including shared values; expected type
strings use brackets, e.g. `[InvoiceLine]`. Each list is capped at 1,024 elements;
combined Record/List depth is 16, counting empty containers. Raw args permit 17
JSON container levels including the root argument array; expected values permit
16 without that root. Malformed list elements have indexed JSON Pointer paths.

Use 1–16 unique ASCII IDs (`A-Z`, `a-z`, digits, underscore, hyphen; 1–64 bytes).
Raw suite JSON is limited to 65,536 UTF-8 bytes. A suite hash identifies the
retained JSON value excluding outer file whitespace, not necessarily the whole
file. Query identity includes compiler, both source revisions, raw suite hash and
effective limits. No cache reuse or authenticity follows from these hashes.

Both programs are whole-program checked and every case is preflighted before
any execution. They must expose the same canonical target signature (including
parameter names), list element types and recursively reachable nominal record
layouts through lists on both parameters and returns. Unrelated
records/comments/declaration placement may differ. Signature/type migrations and
invalid-baseline repair are outside v1. A last invalid case prevents all cells
from executing. Preflight failures have zero observations, not fabricated runtime
statuses. Data paths and source-document ownership remain visible in JSON.

## Understand faults, limits and history

Each case runs baseline then candidate using a **fresh per-invocation** budget;
maximum 32 invocations. Top-level statements and probes do not execute.
`limits.cases` remains the separate probe budget. Compilation/reporting are outside
machine fuel; counts and output caps are not an absolute memory/time guarantee.

Complete results compare typed value plus output. A known baseline runtime fault
fixed by the candidate is Changed and can pass if the candidate matches its
expectation; the old fault remains visible. Candidate faults are Error/Faulted.
Any Unknown makes that comparison incomplete; a baseline Unknown cannot yield a
passing review. Root priority is candidate Error, either-side Unknown, expectation
Fail, then Pass. Later cases still run after faults. Inspect all three axes:
source observations, behavioral differences and candidate expectations.

Every candidate/suite/baseline change—including programmatic example/guarded-edit
replacement, recapture and edit-and-revert—invalidates the current review. Old
accepted reports are marked Historical. Stop/deadline terminates an independent
worker, excludes late callbacks and accepts no partial report; the host does not
guess how many cases executed. Review never automatically Runs or Applies code.
Nothing is uploaded or automatically persisted. Source/output/JSON remain
untrusted text, not instructions or HTML.

This is a useful workflow slice, not validated external-user value, production
readiness, superiority or intent correctness. Modules, richer collection operations/types
and host adapters may still be needed by broader policy workflows. See
[ADR 0010](Decisions/0010-policy-change-workbench.md) and the exact
[protocol](Protocol.md#policy-review-contract-v1).
## Focused browser product

Open [`?workbench`](https://suhaasbadada.github.io/wisp/?workbench) for the focused
policy workflow: a preloaded reservation candidate, seven editable scenario forms,
before/proposed decision table, and explicit downloads. No installation or account
is required. The primary homepage action opens this workbench; the full language
playground remains available separately.

Select **Review cases** to execute both revisions through the existing Rust/WASM
worker. Expand a scenario to edit its inputs or required accepted/packs/reason
values without writing JSON. Integers remain strings, including full i64 values.
Changing requirements is an explicit user action, never automatic repair. Custom
suites use the same Rust validation. Forms are
only exposed for the bundled example or losslessly round-trippable formatted
JSON; duplicate-member or differently formatted suites remain raw, never normalized
by form edits. The browser does not implement policy evaluation or claim to
explain human intent.

After a received valid review, download the exact reviewed candidate or a JSON
bundle containing both full sources, raw suite text and native report. Downloads
are available for failures too: downloading is not acceptance or Apply. Any source,
suite or baseline change disables both downloads until another review, even on
edit-and-revert. Nothing is uploaded; automatic browser draft saving is off unless
you explicitly opt in. Download bundles may
contain sensitive source/case data and are not Python proposal/replay records.
Closing the tab discards edits unless explicitly downloaded as a workspace draft
or review bundle, or kept through opted-in browser recovery. Browser storage can
be cleared or unavailable; retain downloaded files for durable copies. Review remains finite evidence, not proof
or authorization. Existing worker cancellation, limits and stale-response handling
apply unchanged.

### Save and reopen without losing work

Expand **Save or reopen your workspace**, then **Download workspace draft** to
save baseline, candidate and exact raw suite text even before a review, or with
invalid/failed inputs. File downloads do not enable browser saving. Source/suite
strings must each fit 64 KiB of well-formed Unicode and use LF-only line endings:
source/suite strings containing CR or CRLF are rejected unchanged rather
than silently normalized by browser textareas. Workbench-produced files use LF.
The draft format is
`wisp-browser-workspace-v1` with `approval:not_granted`, `applied:false`,
`baseline`, `candidate` and `suite_json`; it contains no execution claim.

Open a downloaded draft or `wisp-browser-review-v1` review bundle, then explicitly
select **Replace current workspace with opened file**. Selecting a file alone
does not modify inputs. Replacement discards current unsaved inputs, cancels any
pending review, clears current decisions/download eligibility and restores all
three input strings exactly. Scenario forms rebuild only for supported,
lossless suites. Raw malformed/duplicate suite members remain unchanged for Rust
validation on the next review; import does not interpret or repair requirements.

Files are local, at most 8 MiB, strict UTF-8, with known envelope fields and the
lossless pretty-printed representation emitted by the workbench. Duplicate or
reformatted envelope JSON, unpaired source/suite surrogates, extra fields and
oversized inputs are rejected without changing the workspace. This is an input
limit, not an aggregate memory bound. No file-supplied executable or path is used.

Imported reports are inert text labelled **historical, unverified**. Their Pass,
execution or approval claims never become current results. Select Review cases
to execute the restored inputs afresh; a new result does not authenticate the
historical report. Import accepts the report object as opaque history, not as a
validated native receipt. Exported files contain complete source and case data;
protect them before sharing. Browser draft/review bundles are not native or Python
proposal replay records.

### Open your own policy and scenario files

The focused workbench accepts a required baseline `.wisp`, optional candidate
`.wisp`, and required scenario JSON through **Open your policy files**. Without
a candidate, both revisions use the exact baseline. File selection alone neither
reads contents nor changes inputs. Select **Open files — replace unsaved inputs**
to read and replace all three strings; keep a draft first if needed. Import itself
does not execute cases. Existing results/download eligibility clear, and pending
reviews are cancelled before the new workspace is installed.

Every file must fit 65,536 UTF-8 bytes, without a BOM, and use LF-only line endings.
All selected sizes are checked before any content is read. Read/encoding/size
failures leave current inputs and review evidence unchanged. Source text and raw
case JSON are not reformatted or repaired. A standalone-JSON framing check stops
malformed values or extra transport fields before review submission; Rust owns
duplicate-member, schema, type and policy validation. Files may contain invalid
Wisp or invalid cases so you can inspect and fix them; importing is not checking.

If a selection or any workspace input changes during asynchronous reading—even
edit-and-revert—the pending import cannot overwrite that work. Re-open explicitly
if replacement is still intended. No JSON field can select a host path, executable
or network operation. After import, review the native before/after results and
download a workspace to keep the exact supported inputs across sessions. Custom
suites use the advanced editor when they do not fit the supported form shape.

### Maintain custom scenarios through forms

Forms support primitive String/Bool and nested record argument/expected values
for custom policies, not only reservations. Edit the function target, scenario ID,
argument leaves, required result type/value and required output. An input's JSON
type is retained: strings stay strings (including full i64 decimal text), booleans
use checkboxes, and record fields keep their keys. Rust decides whether those
values match the selected function's types; the browser never interprets Wisp or
infers a requirement from a runtime observation.

**Duplicate scenario** copies the selected inputs and requirements with a new
unused `case-N` ID. It does not invent an expected result: edit the copy yourself.
**Remove scenario** explicitly removes that row. Duplication stops at 16 cases;
removal stops at one. Every field edit, duplicate and removal invalidates current
review/download eligibility. Invalid integer strings or duplicate IDs stay as
entered and receive native errors; they are not corrected automatically.

Forms require exact pretty-printed JSON (`JSON.stringify(value, null, 2)`), known
version-1 suite/case/expectation fields, 1–16 cases, LF-only strings, String/Bool or
record values, at most 16 record levels/32 fields per record, 64 KiB total input,
and at most 2,048 counted fields/value nodes for rendering. No arrays are exposed
except the ordered argument list, and no JSON number/null values are coerced.
Unsupported/duplicate/noncanonical JSON remains unchanged in the advanced editor;
these UI limits are not a judgment of semantic validity. Only the explicitly
loaded bundled example is automatically formatted. Obsolete form callbacks cannot
overwrite raw edits or a replaced workspace.

### Read mismatches without inspecting JSON

The decision table shows each submitted scenario's inputs, before/proposed typed
results and outputs, owner-required result/output, and native expectation and
comparison statuses. Empty output and escaped newlines remain explicit, so an
output-only mismatch is visible. Required values come from native review evidence,
not a guess based on observed behavior. Inputs are matched by native index and ID
to the accepted submission snapshot; unmatched inputs display `unavailable` rather
than being borrowed from live edited cases. Full native JSON and exports are
unchanged.

**All scenarios** shows the entire review. **Needs attention** shows a scenario
when its candidate expectation is not Pass or either observation is not Complete.
That includes baseline faults repaired by a passing candidate, native Error and
Unknown; it is not a proof or an authorization judgment. The caption gives the
displayed/total count and explicitly says when no scenarios need attention. The
native whole-review summary remains visible. Filters only alter the view: no
case execution, input mutation, status rewriting or expectation repair occurs.
New reviews start with all scenarios visible; filtering historical results does
not make them current or re-enable downloads.

Native diagnostic code/kind/message, document ownership, JSON input path and
owned source offsets appear above the full JSON. Paths are not interpreted as
source spans; candidate causes retain their own document label. At most 20 root
diagnostics are shown in this list, with an explicit truncation note; the complete
JSON keeps all entries. Request/source/preflight rejection is not a passing case
review, and imported history never populates the current decision table.

### Enable forms for compact or differently formatted suites

Imported case files are never silently reformatted. For a supported compact
suite, first select **Review cases**, then **Format validated case JSON for
editing**. Formatting is enabled only by a current received native review in
`executed` phase: every suite/typed input passed Rust preflight, including
duplicate-member checks. Runtime Fail/Error/Unknown does not imply a malformed
suite, so formatting can still be available for those outcomes. Rejected,
duplicate, typed-invalid, historical and imported-only reports cannot enable it.

The explicit action pretty-prints the accepted raw suite without changing its
JSON values; requirements are not inferred from observations or repaired. The
new text must still fit 64 KiB. Supported form shapes become editable; other UI
limits still apply. Because formatting changes suite bytes and its hash, the
old review becomes historical and downloads stay disabled until another review.
Formatting itself never executes cases. Source/suite/baseline edits, replacement,
or edit-and-revert revoke permission; the action is disabled if text is already
in the required format. Full native review evidence remains unchanged history.

### Optional browser draft recovery

**Keep draft on this browser** is off by default. Enabling it stores complete
baseline/candidate/scenario inputs, not review results, on the current origin in
the dedicated `wisp-browser-draft-v1` local-storage key. Data is unencrypted and
available to other users of that browser and scripts on the same origin. Do not
enable this on a shared browser or for sensitive policies. No upload occurs.
Explicitly captured baselines, source/scenario edits and imported inputs can then
update the saved draft; invalid/oversized inputs do not replace a valid copy.

After reopening, saved inputs are neither restored nor overwritten by the default
example. Saving remains paused until explicit **Restore saved draft** or **Forget
saved draft**. Restore replaces current unsaved inputs through the existing
replacement path, cancels pending review, clears results/history/download
eligibility and resumes opted-in saving. It executes no cases. Forget removes
only this dedicated key, leaves current editors and documentation preferences
unchanged, and turns recovery off. Unchecking Keep pauses saving without deleting
the existing copy; Restore or Forget resolves it before saving resumes.

Records use the exact known canonical input-only workspace envelope, at most
1 MiB encoded, with each source/suite at most 64 KiB of scalar Unicode/LF text.
Malformed/duplicate/noncanonical records cannot restore. Storage denial or quota
failure is visibly reported without a saved-copy guarantee; file downloads remain
available. Failed writes are not retried until an input change or explicit user
action. Browser storage can be cleared externally: downloaded files remain the
durable-copy option, and no recovery guarantee is claimed.

Another tab changing or removing this key pauses saving and leaves current
editors untouched. The newest valid copy can only restore explicitly. A pre-write
comparison also detects missed events; Forget discovering a changed copy first
offers that copy rather than deleting it in the same click. Web Storage is not
transactional: truly simultaneous writes can still race. This is conservative
loss prevention, not atomic compare-and-swap, authentication or a sandbox.

### Share a readable review offline

After a current received native review, **Download readable review** produces
`policy-review.html`, a self-contained file that opens without Wisp, a server,
account or network access. It includes outcome, compiler/revision/suite identities,
native counters and **all cases**, even when Needs attention hides passing cases
on screen. Saved inputs, before/proposed typed decisions, explicit outputs,
owner-required values and native statuses remain side by side. Inputs match the
accepted suite snapshot by count/index/ID or say unavailable; they never come
from live edited cases. Observation diagnostics remain visible; complete sources,
raw case text and full native JSON are retained in expandable sections.
Leading source/suite newlines survive HTML parsing. NUL source characters are
displayed explicitly as `\u0000` rather than silently converted by HTML; an
additional exact input snapshot JSON retains all three strings losslessly through
JSON escaping. This snapshot is data, not executable markup.

The HTML uses the same current-review permission as existing downloads, including
received Fail/Error/Unknown and preflight Error evidence. Edits, edit-and-revert,
formatting or replacement disable export; imported historical claims cannot enable
it. Export neither executes policies nor changes source, suite, status or native
JSON. The saved file explicitly identifies itself as a historical snapshot, not
current acceptance, approval, proof, authentication or permission to apply/deploy.

Both full policies and scenario/requirement data are present: review sensitivity
before sharing. Data is inserted as literal text, not markup. The document contains
no scripts, external resources or policy-derived URLs, and carries a restrictive
Content Security Policy with only a fixed inline stylesheet allowed. These controls
and finite browser tests are not a universal hostile-file security guarantee. The
HTML is for reading/printing; reopen the JSON workspace/review bundle to resume
editing or rerun. Browser recovery does not store this report.

### First-screen and phone controls

The focused workbench places its existing **Review cases** and **Stop review**
controls in a sticky action bar, alongside **Policy**, **Scenarios** and **Results**
links. These are the same controls and worker lifecycle as before, not a second
execution path. Review scrolls to the status/results area; the bar stays reachable
while inspecting decisions or editing. Navigation alone neither executes cases
nor changes inputs, and sticky Stop retains cancellation/late-response rejection.
The full language playground keeps its original layout. Source/scenario/result
anchor offsets leave room for the sticky bar on phone-sized screens.

### Inspect the submitted source changes

After a received native review, expand **Source changes — saved submitted inputs**
to compare the accepted baseline/candidate text alongside the decision evidence.
This is a textual comparison, not semantic diff, preservation proof or approval.
It finds common exact line-token prefixes/suffixes and displays one conservative
middle region with up to three context lines at either edge. Unchanged interior
lines can therefore appear in the middle; this is not a minimal edit script.

Both sides show original line numbers, UTF-8 byte/token counts, final-LF state,
`−`/`+` changed-region labels and `=` context labels. A terminal LF belongs to its
line token; no extra synthetic line is added. Blank lines, no-LF endings and empty
sources are explicit. Controls, NUL and bidirectional formatting characters are
visibly escaped, while literal backslashes remain literal: this display is not a
lossless encoding. Full sources and the exact escaped input JSON remain available
in downloads.

Presentation is capped at 200 lines per side (400 combined); omitted counts,
original line ranges and the display-cap/context reason are explicit. No hidden
trimming, whitespace repair or source rewriting occurs. The line scan is bounded
by the existing 64 KiB source input limit, without an LCS/diff dependency; this is
not a performance comparison with other tools.

Edits/reverts keep the old comparison as clearly labelled historical saved inputs,
never substituting current editor text. Restart, import and restore clear the old
view; filters do not change its snapshot or execute code. Readable offline HTML
includes the same bounded comparison and retains full source/exact JSON sections.
Phone layout stacks the two sides; long lines scroll within the source view.

### Take a browser review to the native CLI

**Download runnable review package** creates `policy-review.tar`, an uncompressed
standard USTAR archive with seven fixed flat filenames, in this order:

```text
baseline.wisp    exact submitted baseline UTF-8
candidate.wisp   exact submitted candidate UTF-8
cases.json       exact raw submitted suite
review.json      complete native report JSON
workspace.json   browser-review-v1 inputs/evidence bundle
review.html      self-contained readable review, including all cases
README.txt       fixed trusted-compiler/reproduction instructions
```

No compiler, executable, script, symlink, directory entry or policy-supplied path
is included. Entries are regular files with mode `0600`; ownership/time fields
are fixed zero metadata for reproducibility, not authorship/time authentication.
Extract into a new empty directory, not over existing sensitive files. Read the
contents, then use a trusted installed compiler matching the recorded identity:

```sh
wisp review baseline.wisp candidate.wisp --suite cases.json
wisp check candidate.wisp
```

The review command makes fresh attempts (0 Pass, 1 Fail/Error, 3 Unknown, 2 host
failure); extraction and download run nothing. Reproduction is not approval,
authentication of old history, requirements completeness or permission to apply.
There is no automatic compiler installation or policy-generated shell command.

The archive uses the same current-native-review permission as other downloads,
including negative/preflight evidence. Edits/reverts, formatting, replacement and
import-only history cannot enable a stale package. Active result filtering never
omits passed cases. Original source/suite bytes—including supported Unicode, NUL
and leading newlines—and full native JSON remain unchanged. Sources/cases and
both JSON/HTML bundles may contain sensitive data; inspect before sharing.

The final tar is capped at 16 MiB before aggregate Blob allocation. Generating
HTML and encoding entries still allocate; this is not an absolute memory bound.
Failure reports a generic package error and downloads no archive. Web packaging
does not add a language implementation or change native evaluation.

### Leaving with changed inputs

The focused workbench requests the browser's native leave-page warning when the
current baseline, candidate or raw suite differs from the initially loaded
example. It attaches the handler only while inputs differ; unchanged examples,
review execution and navigation within the page do not trigger it. Reverting all
three strings exactly removes the input warning but does not revive historical
review/download eligibility.

Cancel keeps the current page; confirming Leave permits navigation without
implicitly saving, downloading or approving anything. The prompt also applies
after a download request or opt-in browser recovery: neither proves a durable
copy was retained. It is an input-change warning, not a lost-results detector or
a saved/unsaved certification. Browser-controlled wording, user-activation rules
and platform limitations apply; app termination/mobile closure may not prompt at
all. Keep deliberate file copies and use recovery only with its stated limits.
The full language playground retains its existing behavior.

### Recover from opening the wrong workspace

**Restore previous inputs (replaces current)** keeps one complete prior workspace
in tab memory when opening policy files, a JSON workspace/review bundle, browser
recovery, a named workspace or an explicit focused-workbench example. A complete
set includes a captured baseline, candidate and raw suite.
The button is disabled before such a replacement, or when the previous editor had
no captured baseline. This is not general edit undo or a multi-step history.

The explicit action replaces all current inputs with that prior set, clearing
current native results, diagnostics, source comparison, imported history and all
review download/format permissions. It cancels any pending worker and ignores
late replies; prior attempts may already have occurred. Restoration executes no
cases and never revives an old Pass or approval. Run a fresh review separately.

Current inputs—including edits made after opening—become the new previous set,
so you can switch back. Each new replacement keeps only the immediately replaced
complete inputs. The buffer is neither exported nor stored in browser recovery;
reload/close loses it. If saving was opted in, the restored **current** inputs can
be saved under the existing consent, not the prior buffer. Download whichever
workspace you need to keep; no durable or secure-erasure guarantee is implied.
The focused workbench uses immediate page scrolling rather than smooth animation
so sticky actions do not continue moving across click targets during recovery.

### Create a first custom scenario without raw JSON

Open **Create a scenario from function inputs** beside the scenario editor. If
starting a new policy, first capture its source as the baseline; the builder never
captures or repairs it for you. **Read candidate function shapes** invokes the
existing nonexecuting Rust `describe` operation in a disposable worker. It checks
compiler semantics-7/interface-v2 encodings and independently matches the native
revision to SHA-256 of the submitted source. Metadata Ready is not finite Pass or
approval. Native Error/Unknown, unsupported interfaces and malformed shapes cannot
enable Add; diagnostics remain literal text.

List descriptors are recognized, but List-shaped argument/result forms fail
closed with guidance to the raw scenario JSON editor or Invoke JSON. Selecting
a scalar/record-only function in the same source still works. This is a form
projection limit, not a language restriction; saved-scenario forms may also be
unable to render lists. The raw scenario editor remains available.

Choose a native-described function, then fill its arguments, owner-required result
and expected output. Int fields remain exact strings; Bool requires an explicit
true/false choice; String fields permit multiline literal text. Nested record
fields and required result type come only from Rust metadata. Values are yours:
no result is guessed from execution or source conditions. Empty required output
explicitly means no output; invalid Int strings can still receive native preflight
errors when reviewed rather than being automatically corrected.

Unchecked **Replace existing scenarios** appends only to an exact canonical,
supported version-1 suite for the selected function with fewer than 16 cases and
a unique ID. Other-target, compact, duplicate-member or unsupported suites remain
unchanged unless you explicitly choose replacement. **Add scenario** preserves
both policy strings, records the previous complete inputs through the existing
replacement path, clears current evidence and creates no case execution. Select
**Review cases** separately for native validation and finite outcomes.

Each read has a five-second host deadline and explicit Stop. Source/suite/baseline
changes, edit-and-revert, replacement and stale replies invalidate binding; Add
checks freshness again before writing. A read is consumed by committing a case.
Supported forms are capped at 16 record levels, 32 fields per record, 2,048 value
fields and 256 KiB of generated label text, with existing 64 KiB input limits.
These UI bounds are not a policy-validity or absolute-memory judgment. Record
keys such as `__proto__` remain own data properties, not prototype assignments.
Reading/adding requests no verification, but a separate or cancelled review may
already have attempted cases; this is not a global zero-execution claim.
New IDs must contain 1–64 ASCII letters, digits, underscores or hyphens. Appending
also requires every existing ID to satisfy that rule and be unique; invalid or
duplicate existing IDs are not repaired. Values still receive native validation
on Review. Unadded form fields are not workspace inputs and are not persisted or
recovered; rereading shapes or changing bound inputs resets them. Select Add before
relying on workspace downloads or browser recovery to keep a scenario.

### Select a current source error

For an accepted current review's report-level source diagnostics, **Select
candidate error** focuses the proposed editor and selects the owned native range.
**Select baseline error** opens and focuses the read-only captured baseline instead.
Labels give an LF-based line number and native UTF-8 byte range, not a visual
column. UTF-8 offsets are converted to textarea UTF-16 positions without language
parsing or source rewriting; malformed spans, split Unicode-scalar boundaries,
non-scalar strings and sources over 64 KiB are rejected.

Candidate review diagnostics can carry remapped placeholder offsets. Navigation
uses only a matching original candidate cause with the correct document and no
JSON data path; it never treats `/candidate` or a suite input pointer as a source
span. Baseline uses its directly owned root span. Unknown/mismatched ownership,
unsupported kinds, runtime observation cells, missing causes and data-path
diagnostics remain text-only. This is deliberately narrower than every error
displayed by the app, including the scenario builder's metadata errors.

Only accepted native preflight Syntax/Type/Purity errors can offer navigation.
Buttons bind the accepted object, generation and exact three current input
strings. Any edit, recapture or edit-and-revert disables them; restart/import/
restore clears them, and retained old callbacks recheck freshness. Filtering a
historical result does not revive navigation. Imported history cannot enable it.
Selecting a range changes neither policy nor suite, executes no code, performs no
automatic repair and does not alter native evidence or download permissions.

### Try an expense-policy change

The workbench still opens the reservation walkthrough. **Load expense walkthrough
(replaces all three inputs)** explicitly replaces baseline, candidate and scenarios
with a smaller, illustrative reimbursement example. It uses the existing complete
workspace replacement path: old inputs remain in this tab for **Restore previous
inputs**, current evidence is cleared, and no review is requested. Repeating the
load while all three inputs already match is a no-op, retaining both previous
inputs and any current evidence. This does not assert that earlier review attempts
did not execute. Neither loading nor a passing review applies or approves a policy.

The example's declared requirements use whole cents: reject negative amounts,
allow nonnegative amounts up to 10000 inclusive, and require a receipt only above
2500. Its baseline mistakenly rejects 10000 and requires a receipt at exactly
2500; its candidate corrects those boundaries. Seven manually specified cases
cover -1, 0, 2499, 2500, 2501, 10000 and 10001, with explicit receipt choices and
required Decision records. A fresh native review completes 14 before/after
invocations: seven candidate expectations Pass, two decisions Changed and five
Unchanged. These finite cases are not exhaustive proof, a real company policy or
finance/tax advice. Amounts are exact Int strings, not floating-point currency.

The existing nested-record forms edit its values and requirements without raw
JSON. An intentionally wrong requirement stays Fail; it is never repaired from an
observation. Workspace/source/evidence downloads and reopen use the same generic
formats as custom policies; reopening still requires fresh execution for current
results. Fixtures are `examples/policies/expenses-before.wisp`,
`expenses-after.wisp` and `expenses-cases.json`.

Both the focused workbench and full playground use immediate page scrolling.
Controls must not continue moving across click coordinates after an editor gains
focus or a navigation action scrolls the page. Color transitions remain optional
under the existing reduced-motion preference; page scrolling is not animated.

### Go from a decision to its saved scenario

In the focused workbench, a current executed review can offer **Edit saved
scenario <id>** in the decision table and case detail. This opens the matching
saved-scenario card and focuses its first editable owner-required result value
(the Scenario ID field for an empty result record). It never changes a value,
copies an observation into a requirement, dispatches input events or runs a
review. Editing is a separate owner action that makes old results historical;
select **Review cases** for fresh evidence. Changing a requirement is not a
policy repair or approval.

Navigation requires the exact accepted three-input snapshot, accepted object and
workspace generation, executed-phase evidence, and the original case index and
ID. The form adapter also binds its own render generation and connected field
references, checks exact suite text and unique IDs, and rechecks on click. A
filtered result keeps its original case index. Source/suite edits (even reverted),
suite change/refresh, recapture, replacement, Restore, imported history, a new
review or a stopped attempt cannot authorize an old callback against new forms.

Compact, unsupported or unrenderable suites stay raw and have no action; navigation
does not format or rebuild them. If applicable, explicitly format native-validated
JSON, then review again. Preflight errors use their separate source diagnostics,
not scenario actions. The full language playground has no generic saved-scenario
form adapter and does not offer these controls. Native reports and exported
evidence remain unchanged by selection.

### Keep separate named policy workspaces

The focused workbench's **Named workspaces on this browser** holds explicit local
copies of complete baseline, candidate and raw scenario text. **Save current
workspace** is consent for that one copy, not automatic saving. Inputs are stored
unencrypted on this origin, accessible to its scripts and other browser users;
do not use for sensitive data or on a shared browser. Storage can be cleared or
unavailable and is not cloud backup. Keep downloaded workspace files.

There are at most eight exact, case-sensitive names, each 1–80 UTF-8 bytes with
no surrounding whitespace or control characters. The complete encoded library
is capped at 2 MiB; each input retains the existing 64 KiB scalar-Unicode/LF
limit. Escaping can mean fewer than eight maximum-sized workspaces fit. No entry
is automatically evicted. Names such as `__proto__` remain literal data. Raw suite
text stays opaque: saving does not validate Wisp or scenarios or round integers.

Selecting a name only previews byte counts. **Open selected workspace (replaces
all three inputs)** explicitly replaces different inputs through the existing
workspace path, preserving previous complete inputs in this tab, cancelling an
active review and clearing current evidence and imported history. Opening
identical inputs is a no-op. Neither action requests case execution, but earlier
review attempts may already have run. Saved copies never include native results,
approval, the previous-input buffer or unadded scenario-builder fields. Reload
lists saved names without automatically opening them. Review separately for fresh
finite evidence.

Saving different inputs over an existing name requires a one-shot **Replace
existing saved name** confirmation bound to that exact name; changing the name
revokes it. Identical saves are no-ops. Deleting a selected saved copy and
forgetting the entire named library each require their own explicit confirmation.
These operations do not alter current inputs/evidence or unrelated browser keys,
including automatic draft recovery. Invalid/foreign/duplicate/oversized library
records cannot be partially loaded or silently overwritten; only confirmed
Forget can remove such a record.

Each action compares the stored version with the version shown. Other-tab storage
events pause actions and invalidate selection/confirmations until **Refresh saved
names**. A version mismatch also aborts even if its event was missed. These are
conservative comparisons, not atomic compare-and-swap or transactional multi-tab
safety; simultaneous writes can still race. Updates require exact readback before
claiming a saved copy. Quota, access and verification failures pause operations
with a no-saved-copy-guarantee warning rather than retrying or erasing unknown data.

### Read field-by-field decision differences

Accepted case results include collapsible **Observed value changes** and
**Requirement differences** in the decision table and case details. The same
static renderer is included in offline readable reviews, always for all saved
cases regardless of the live attention filter. It compares exact transport
values—not Wisp semantics, causal explanations, inferred intent or policy repair.
Native expectation/comparison/status/reason remain separate and authoritative.

Observed changes compare complete baseline and proposed result type, value and
captured output. Requirement differences compare the accepted snapshot's
owner-required result/output with the complete proposed observation. Incomplete
observations show native statuses and an unavailable message instead of guessed
field values. A repaired baseline fault can still have a complete candidate and
readable requirement comparison. Preflight has no case observations to compare.

Paths are JSON-quoted JSON pointers, with `~` and `/` escaped as `~0` and `~1`.
Strings remain quoted exact strings, including full i64 decimal text, empty or
newline output, Unicode and escaped NUL. Bool and null remain distinct; missing
fields and empty/present records and lists have explicit presence markers. Lists
align by ordered JSON index, not inferred row identity or moves; nested lists and
records use literal indexed paths. Own record keys, including `__proto__`, are
literal data. Numbers, malformed/non-JSON shapes (including sparse arrays) and
non-scalar Unicode fail closed, even if both sides look identical. Zero
displayed differences is not universal native equivalence or a
fresh verdict. No requirements or native evidence are rewritten.

Each comparison is limited to 16 combined Record/List levels, 32 fields per record,
1024 elements per list, 2048 visited
nodes across both sides, 64 displayed difference rows, 8192 UTF-16 units per path
and 120 KiB row text. Scalar cells show at most 512 Unicode scalars with explicit
truncation. Each two-comparison panel has a 256 KiB generated-text budget. A limit
or unsupported shape visibly states the view is not guaranteed complete; full
native JSON is retained separately. These are display limits, not absolute memory
bounds or language-validity judgments. Filtering, expanding or exporting this
view executes no policy code. Historical views use saved accepted values, not
subsequent form edits; restart/import/Restore clear them with other results.
See [List value differences](List-value-differences.md) for positional semantics
and full native JSON fallback. List-shaped scenario forms remain unsupported.

### Choose a clear starting path

The focused workbench opens with three paths: **Try examples**, **Open your own
policy**, and **Resume work**. Its real, single Review/Stop pair remains sticky.
Source editing follows these compact paths; full file-intake and named-library
tools follow the review/editor rather than blocking the initial editing path.
Detailed illustrative rules are available under **Example rules and boundaries**.
Local-saving, replacement, privacy and finance-advice warnings remain beside the
actions they qualify.

**Open policy file tools** navigates to and focuses the existing intake heading;
it does not activate a file picker or import anything. **Find a browser workspace**
opens the existing named-library disclosure. **Reopen a downloaded workspace**
opens the existing Save or reopen disclosure and focuses its file input without
clicking it. These navigation actions do not change inputs, storage or evidence,
request execution, enable saving, download files or grant import consent.

The initial reservation example remains seven scenarios with no review requested
by startup. Subsequent explicit reservation and expense loads now share the
complete-workspace replacement path in the focused workbench: different inputs
preserve the previous complete set, including invalid raw text and post-import
edits, clear evidence/history and invalidate unadded builder metadata/forms. Prior
attempts may already have run; loading itself requests no execution. Identical
loads are true no-ops, preserving native evidence, previous inputs, open saved
cards and their current result-to-form bindings, and unadded scenario-builder
values, replacement consent and in-flight metadata reads. Only known bundled suites are
formatted. The full language playground retains its original example behavior.

The responsive layout uses three desktop columns and one phone column, with
keyboard focus/scroll targets below the sticky bar. Measurements at a specific
viewport are regression checks, not claims about every device, browser or visual
setting; no universal usability or accessibility certification is implied.
