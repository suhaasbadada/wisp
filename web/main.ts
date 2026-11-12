import './style.css';
import './artifacts.css';
import './invocation.css';
import './context.css';
import './editing.css';
import { reviewMarkup, setupReview } from './review';
import { callInputsMarkup, setupCallInputs } from './call-inputs';
import { workbenchMarkup, setupWorkbench } from './workbench';
import snacks from '../examples/snacks.wisp?raw';
import repaired from '../examples/snacks-repaired.wisp?raw';
import inventory from '../examples/inventory.wisp?raw';
import invoice from '../examples/invoice.wisp?raw';
import loan from '../examples/loan.wisp?raw';
import invoiceBatch from '../examples/invoice-batch.wisp?raw';
import invoiceBatchArgs from '../examples/invoice-batch-args.json?raw';
import language from '../Docs/Language.md?raw';
import protocol from '../Docs/Protocol.md?raw';
import cli from '../Docs/CLI.md?raw';
import errors from '../Docs/Errors.md?raw';

const base = import.meta.env.BASE_URL;
const repo = 'https://github.com/suhaasbadada/wisp';
const isDocs = /\/documentation\/?(?:index\.html)?$/.test(location.pathname);
const isWorkbench = !isDocs && new URLSearchParams(location.search).has('workbench');
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <a class="skip" href="#main">Skip to content</a>
  <header class="nav"><a class="brand" href="${base}" aria-label="Wisp home"><span class="mark" aria-hidden="true">w<span>·</span></span> wisp</a>
    <nav aria-label="Main"><a href="${base}#playground">Playground</a><a href="${base}documentation/" ${isDocs ? 'aria-current="page"' : ''}>Documentation</a><a href="${repo}">GitHub <span aria-hidden="true">↗</span></a></nav>
    <span class="experimental"><span aria-hidden="true">●</span> Experimental / v0.1</span>
  </header>
  <main id="main">${isDocs ? docsMarkup() : isWorkbench ? workbenchMarkup() : homeMarkup()}</main>
  <footer><a class="brand" href="${base}">wisp<span class="orange">.</span></a><span>A small language. A visible trail of evidence.</span><a href="${repo}/tree/main/Docs">Engineering notes ↗</a><span>Experimental · License pending</span></footer>`;

function homeMarkup() {
  return `<section class="hero wrap"><div class="eyebrow"><span class="dash"></span> A LOCAL POLICY CHANGE WORKBENCH</div>
    <div class="hero-grid"><div><h1>Change a policy.<br><span>See what changes.</span></h1><p class="intro">Review decisions, not just diffs.<br>Run locally in your browser.</p>
      <p class="subintro">Edit a reservation policy, check saved scenarios and compare before/after decisions. Download your candidate and its review. No account, API key or installation.</p>
      <div class="hero-actions"><a class="button primary" href="?workbench">Open policy workbench <span aria-hidden="true">↗</span></a><a class="text-link" href="#playground">Explore the language ↘</a><a class="text-link" href="${base}documentation/">Read the agent protocol ↗</a></div></div>
      <aside class="specimen" aria-label="Example counterexample"><div class="specimen-head"><span>01 / GOBLIN SNACK BUREAU</span><span class="dot"></span></div><pre><span class="muted">// More snacks. A smaller bill?</span>
<span class="code-accent">probe</span> n in 1..=11 {
  bill(n + 1) &gt;= bill(n)
}</pre><div class="witness"><span class="ghost-icon" aria-hidden="true">↳</span><div><strong>Meet your first ghost.</strong><p>n = 9 · bill(9) = 900 · bill(10) = 800</p></div><span class="tag fail">FAIL</span></div><p class="specimen-foot">A concrete failing input. Not a guess at your intent.</p></aside></div>
    <div class="principles"><span><b>01</b> One Rust core, native + WASM</span><span><b>02</b> Local execution, no API key</span><span><b>03</b> Finite evidence, not proof</span></div></section>
    <section class="play-section" id="playground"><div class="wrap"><div class="section-head"><div><div class="eyebrow">THE FIRST PLAYABLE</div><h2>Break a rule. Keep the evidence.</h2></div><p>Edit real Wisp. Run the shared compiler in your browser.<br>No server. No hidden JavaScript interpreter.</p></div>
      <div class="toolbar"><label>Example <select id="example"><option value="snacks">Goblin Snack Bureau</option><option value="repaired">Snack Bureau — proposed repair</option><option value="inventory">Inventory reorder</option><option value="invoice">Typed invoice records</option><option value="loan">Loan repayment (360 months)</option><option value="invoice-batch">Invoice batch reconciliation</option></select></label><div class="run-actions"><span id="activity" role="status">Local WASM worker</span><button id="stop" disabled>Stop</button><button class="primary" id="run">Run <span aria-hidden="true">↗</span></button></div></div>
      <div class="artifact-toolbar"><label for="artifact-file">Import ghost file <input id="artifact-file" type="file" accept=".json,application/json" aria-describedby="artifact-privacy"></label><p id="artifact-privacy">Explicit local files only · max 1 MiB. Exports include the entire historical source and limits. Nothing is uploaded or automatically saved. Compiler semantics-7: older-compiler artifacts are unsupported; no automatic migration.</p><p id="artifact-status" role="status" aria-live="polite">Save a ghost below, then inspect or replay it in the CLI.</p></div>
      <div class="workspace"><section class="code-panel"><div class="panel-head"><h3><span class="orange">01</span> Code</h3><span id="filename">snacks.wisp · editable</span></div><label class="sr-only" for="source">Wisp source</label><textarea id="source" spellcheck="false" autocapitalize="off" autocomplete="off" aria-describedby="editor-hint"></textarea><div class="editor-foot" id="editor-hint">Ctrl/⌘ + Enter to run · primitives + immutable records · no host IO</div><div id="diagnostics" role="status" aria-live="polite"></div></section>
        <section class="result-panel"><div class="panel-head"><h3><span class="orange">02</span> Output</h3><span class="tag" id="run-status">NOT RUN</span></div><pre id="output" tabindex="0">The bureau is open. Run the program.</pre><div class="panel-head evidence-head"><h3><span class="orange">03</span> Evidence</h3><span id="revision" class="mono">No execution yet</span></div><div id="evidence"><p class="empty">A probe checks a declared finite domain. A failure leaves a replayable ghost here.</p></div></section></div>
      <section class="call-panel"><div class="panel-head"><h3><span class="orange">04</span> Invoke a typed function <span class="tag">SINGLE INPUT</span></h3><button id="invoke">Invoke</button></div><div class="call-grid"><div><label for="call-target">Function <select id="call-target"><option value="bill">bill</option></select></label><label for="call-args">JSON arguments <span class="muted">Int values are decimal strings</span></label><textarea id="call-args" spellcheck="false" aria-describedby="call-hint">["9"]</textarea><p id="call-hint">An array of arguments, at most 64 KiB. Records are objects; typed lists are arrays with at most 1024 elements each. Ints are decimal strings, not JSON numbers. Rust checks exact types and container depth. Inputs stay local and are never evaluated as source. Top-level statements/probes do not run.</p></div><div><h3>Typed return value</h3><pre id="call-result" tabindex="0">No invocation yet.</pre><p id="call-evidence" role="status" aria-live="polite">One observed execution, never a finite-domain Clear or proof. Captured function prints appear in Output above.</p></div></div></section>
      <section class="agent-panel"><div class="panel-head"><h3><span class="orange">05</span> Agent View <span class="tag">COMPILER-DERIVED</span></h3><div class="agent-controls"><label>Focus <select id="focus" aria-label="Agent View function"><option>bill</option></select></label><label>Text budget <input id="budget" type="number" min="0" max="65536" value="4096" aria-label="Agent View byte budget"> bytes</label></div></div><div class="agent-grid"><pre id="agent-text" tabindex="0">Compiler facts will appear after analysis.</pre><div><p id="agent-budget" class="mono"></p><strong>What is left out?</strong><ul id="omissions"></ul><p class="muted">Syntactic call dependencies, not a guaranteed task-relevant or complete context. The byte budget covers the text field, not this UI or JSON metadata.</p><details><summary>Inspect compiler graph / JSON</summary><pre id="graph"></pre></details></div></div></section>
      ${probeContextMarkup()}
      ${guardedEditMarkup()}
      ${reviewMarkup()}
      <p class="limit-note">Bounded execution: 64 KiB source · 100k metered fuel units · 32 calls · record depth 16 · 1,000 probe inputs · 8 KiB output. Fuel includes aggregate traversal and string/output bytes, not only expressions. Stop terminates the execution worker; Stop query terminates the independent context worker. Logical allocation accounting is not an absolute browser-memory guarantee. <a href="${base}documentation/">Full limits & protocol ↗</a></p>
    </div></section>
    <section class="wrap story"><div><div class="eyebrow">A LANGUAGE WITH RECEIPTS</div><h2>Make uncertainty<br>part of the interface.</h2></div><div class="story-cards"><article><span>01 / OBSERVED</span><h3>A ghost is an input.</h3><p>Keep a failure attached to its source revision. Replay it on new code as a new execution—not a rewritten history.</p></article><article><span>02 / COMPILER-DERIVED</span><h3>A graph is a map.</h3><p>Inspect function bodies and dependency signatures. See omissions and budget overflow. A map is not proof of complete context.</p></article><article><span>03 / STILL A HYPOTHESIS</span><h3>Earn the claims.</h3><p>No speed, token or memory superiority is claimed. No solver yet. No production-readiness promise. Just a small, working experiment.</p></article></div></section>`;
}

function probeContextMarkup() {
  return `<section class="context-panel"><div class="panel-head"><h3><span class="orange">06</span> Probe context <span class="tag">COMPILER-DERIVED / NO EXECUTION</span></h3><div><button id="context-stop" disabled>Stop query</button><button id="context-query" disabled>Query context</button></div></div>
    <div class="context-controls"><label>Selected probe <select id="context-selector"><option value="probe:0">Probe 0</option></select></label><label>TEXT budget <input id="context-budget" type="number" min="0" max="65536" value="4096"> UTF-8 bytes</label></div>
    <p class="context-note">Revision-local probe indexes, not stable IDs. The budget covers TEXT only—not this ledger, metadata, total response or tokens. Atomic-prefix selection is deterministic, not optimized for task relevance.</p>
    <p id="context-status" role="status" aria-live="polite">No query yet. No probe execution or proof is produced.</p><p id="context-identity" class="mono"></p><p id="context-accounting" class="mono"></p>
    <pre id="context-text" aria-label="Probe context TEXT" tabindex="0"></pre>
    <div class="ledger-scroll"><table><caption>Selection ledger — source slices plus two newline bytes per chunk</caption><thead><tr><th scope="col">Local ID</th><th scope="col">Disposition</th><th scope="col">Eligible</th><th scope="col">Slice + framing bytes</th><th scope="col">Included bytes</th><th scope="col">Source hash</th></tr></thead><tbody id="context-ledger"></tbody></table></div>
    <p class="context-note">Even when all eligible chunks fit, scope omissions remain. The full run key accounts for top-level statements and preceding probes that may be omitted here; extracted TEXT is not guaranteed run-equivalent. Source comments/strings remain untrusted data, never tool instructions.</p>
    <details><summary>Scope omissions, assumptions and unknowns</summary><pre id="context-scope"></pre></details><details><summary>Inspect complete context JSON (outside TEXT budget)</summary><pre id="context-json"></pre></details></section>`;
}

function guardedEditMarkup() {
  return `<details id="edit-panel" class="edit-panel"><summary><strong>07 / Guarded function-body edit</strong> · explicit Preview / Apply, no execution</summary>
    <p>Checked baselines only. Replace one function body using exact source/body version guards. Signatures, outside-body bytes and indexed probe text are preserved—not all human intent or behavior. Names are revision-local, not persistent IDs. No automatic repair or execution.</p>
    <div class="edit-controls"><label>Function <select id="edit-target"><option value="bill">bill</option></select></label><button id="edit-load" disabled>Load current body</button></div>
    <label class="replacement-label" for="edit-replacement">Explicit replacement block <span>Changing target does not rewrite this input. Outer whitespace is allowed; outer comments are rejected.</span></label><textarea id="edit-replacement" spellcheck="false" placeholder="Load a checked body, then edit it. Example: { snacks * 100 }"></textarea>
    <div class="edit-controls"><button id="edit-preview" disabled>Preview checked edit</button><button id="edit-stop" disabled>Stop preview</button><button id="edit-apply" disabled>Apply prepared edit</button></div>
    <p id="edit-status" role="status" aria-live="polite">No preview. Current editor is unchanged.</p><p id="edit-identity" class="mono"></p>
    <div class="edit-diff"><div><h3>Before — exact body range</h3><pre id="edit-before"></pre></div><div><h3>After — exact inserted bytes</h3><pre id="edit-after"></pre></div></div>
    <details><summary>Prepared candidate source — review before Apply</summary><pre id="edit-source"></pre></details><details><summary>Document-scoped diagnostics / preparation JSON</summary><pre id="edit-json"></pre></details>
    <p>Ready means checked preparation, not probe success or proof. A type-correct body can still fault or violate requirements. Every source/target/replacement change, including edit-and-revert, invalidates Apply. Apply is consumed once, preserves historical ghosts, and triggers checking only; run acceptance tests or replay explicitly afterward.</p></details>`;
}

function docsMarkup() {
  return `<section class="wrap docs"><div class="eyebrow">DOCUMENTATION / FIRST PLAYABLE</div><h1>One language.<br><span>Two ways in.</span></h1><div class="docs-heading"><p class="intro">A precise contract for agents. A guided path for humans.</p><div class="mode-toggle" role="group" aria-label="Documentation mode"><button id="agent-mode" aria-pressed="true">Agent</button><button id="human-mode" aria-pressed="false">Human</button></div></div><p id="mode-note" class="muted"></p>
    <div id="agent-docs"><div class="docs-callout"><strong>WISP / AGENT CONTRACT v0.1</strong><p>Permissions: none. Core cannot execute host code or access filesystem/network. Provenance: graph = compiler-derived; finite probe outcomes = observed; user intent = unknown. No solver or proved state.</p><a href="${base}Docs/Language.md">Raw language contract ↗</a> · <a href="${base}Docs/Protocol.md">Raw JSON protocol ↗</a></div>
      <h2>Runnable request</h2><pre id="request-example"></pre><h2>Grammar, errors & limits</h2><pre class="contract" id="language-contract"></pre><h2>Machine interface & evidence identity</h2><pre class="contract" id="protocol-contract"></pre><h2>Native agent commands & portable artifacts</h2><pre class="contract" id="cli-contract"></pre></div>
    <div id="human-docs" hidden><article class="tutorial"><h2>Your first ghost</h2><p>The Goblin Snack Bureau gives bulk discounts. But its first formula accidentally makes ten snacks cheaper than nine. A finite probe asks whether each next bill is at least as large.</p><pre id="tutorial-source"></pre><ol><li>Open the <a href="${base}#playground">playground</a> and run “Goblin Snack Bureau”. Output is <code>900</code>.</li><li>The probe stops at <code>n = 9</code>. Nine snacks cost 900; ten cost 800. This concrete failure is the ghost.</li><li>Replace <code>snacks * 80</code> with <code>900 + (snacks - 9) * 80</code>, or select the proposed repair example. Your pricing requirement has not been changed.</li><li>Replay the old ghost: that input now passes. Then run the full probe: all 11 declared adjacent comparisons pass. Neither result is a universal proof, nor a guarantee that this is the price you wanted.</li></ol><h2>Read evidence, not reassurance</h2><p>Clear means all inputs in the declared finite domain completed true. Fail means an observed counterexample. Unknown means a limit or interruption prevented completion. Error means an invalid program or a runtime fault. Historical evidence stays historical after an edit; matching dependency keys do not create a new execution.</p><h2>Understand the boundary</h2><p>Functions accept primitives, immutable nominal records and bounded immutable lists. A record groups named fields; <code>new Item { quantity: 9, unit_price: 100 }</code> constructs a value, not a class instance. Read fields with <code>item.quantity</code>. A typed list such as <code>[Int; 2, 4]</code> supports checked indexing and <code>.length</code>. There are no classes, methods, mutation, recursive record types, loops or host permissions. Initializers run in source order; fields display in declaration order. Agent View includes conservative record declarations, the focused body and transitive dependency signatures; other bodies and top-level statements are explicitly omitted. The graph is metadata, not the runtime.</p><h2>Try a typed invoice</h2><pre id="invoice-tutorial"></pre><p>Select “Typed invoice records” in the playground. It prints a nested invoice, then 900, and completes 21 finite comparisons. For variable-size input select “Invoice batch reconciliation”; its deliberately mismatched line remains visible even when payment matches the computed total. See the <a href="${base}Docs/Invoice-batches.md">batch quickstart</a>. Copies, equality, display and string bytes consume bounded resources. These are logical interpreter units, not a claim about absolute process memory.</p><p>Compiler semantics-7 adds bounded lists and changes typed-interface and accounting boundaries. Older-compiler artifacts are rejected before execution; artifact format v1 does not imply cross-compiler compatibility. No silent migration rewrites your evidence.</p><p>Run natively with <code>cargo run -- examples/invoice-batch.wisp</code>. See Agent mode for exact syntax, accounting and protocols.</p></article></div>
    <section class="engineering"><h2>Engineering notebook</h2><p>The source of truth lives in <code>Docs/</code>. Behavior changes require documentation changes.</p><div class="doc-links">${['Scope', 'Architecture', 'Language', 'Protocol', 'CLI', 'Scope-changes', 'Testing', 'Roadmap', 'Contributing'].map(name => `<a href="${base}Docs/${name}.md">${name.replace('-', ' ')} ↗</a>`).join('')}<a href="${base}Docs/Decisions/0001-first-playable.md">ADR 0001 ↗</a><a href="${base}Docs/Decisions/0002-portable-failure-artifacts.md">ADR 0002 ↗</a></div><p>Research direction, not a novelty claim: compiler-accounted boundaries with property-specific assumptions/unknowns and inspectable omissions. Prior art includes Sley, Zerolang and Unison. Benchmarks and adoption remain unmeasured.</p></section></section>`;
}

function el<T extends HTMLElement = HTMLElement>(id: string) { return document.getElementById(id) as T; }
function text(id: string, value: string) { el(id).textContent = value; }

if (isDocs) {
  text('language-contract', language);
  text('protocol-contract', protocol);
  text('cli-contract', cli);
  el('agent-docs').insertAdjacentHTML('afterbegin', `<section class="docs-callout"><strong>COMPILER-OWNED DISCOVERY / CONTRACT v1</strong><p><a href="${base}agent.json">Compiler capabilities — agent.json ↗</a> · <a href="${base}Docs/Errors.md">Stable diagnostic reference ↗</a></p><pre>{"op":"capabilities","source":""}</pre><p>Non-executing metadata: actual operations, permissions, limits, runnable requests and diagnostic codes. Source stays required, even for discovery. Check code + kind + enclosing status; messages are human text. Unknown codes fall back to kind/status. No code can choose human intent or prove correctness.</p></section>`);
  el('agent-docs').insertAdjacentHTML('beforeend', '<h2>Diagnostic contract v1</h2><pre class="contract" id="error-contract"></pre>');
  text('error-contract', errors);
  document.querySelector('.doc-links')?.insertAdjacentHTML('beforeend', `<a href="${base}Docs/Errors.md">Diagnostic reference ↗</a><a href="${base}agent.json">Compiler manifest ↗</a>${['0003-immutable-records', '0004-typed-function-invocation', '0005-machine-contract', '0006-probe-context-ledger'].map((name, index) => `<a href="${base}Docs/Decisions/${name}.md">ADR 000${index + 3} ↗</a>`).join('')}`);
  el('agent-docs').insertAdjacentHTML('beforeend', '<h2>Probe context / contract v1</h2><pre id="context-request-example"></pre><p>Non-executing whole-program checking; Ready is metadata, not a passing probe. Revision-local selectors are not persistent IDs. TEXT is an atomic prefix: selected whole probe, conservative records, syntactic callee definitions, each charged two newline bytes. Ledger and scope omissions are outside the UTF-8 TEXT budget. Prelude and preceding-probe dependencies can affect the run despite omitted source. No total-response/token bound, run-equivalence, relevance, minimality or completeness guarantee.</p>');
  text('context-request-example', JSON.stringify({ op: 'context', source: snacks, focus: 'probe:0', budget: 4096 }, null, 2));
  document.querySelector('.doc-links')?.insertAdjacentHTML('beforeend', `<a href="${base}Docs/Decisions/0007-guarded-function-edits.md">ADR 0007 ↗</a>`);
  document.querySelector('.doc-links')?.insertAdjacentHTML('beforeend', `<a href="${base}Docs/Evaluation.md">Product-validation pilot ↗</a><a href="${base}Docs/Decisions/0008-product-validation-pilot.md">ADR 0008 ↗</a>`);
  document.querySelector('.doc-links')?.insertAdjacentHTML('beforeend', `<a href="${base}Docs/Maintenance-study.md">Repeated maintenance study ↗</a><a href="${base}Docs/Decisions/0009-repeated-maintenance-study.md">ADR 0009 ↗</a>`);
  el('agent-docs').insertAdjacentHTML('beforeend', `<h2>Repeated maintenance study</h2><p>Both arms passed three repetitions of one dependency/stale-evidence task. This is not six independent tasks, a production repository or a measured token-cost advantage. History flags are participant assertions, not authenticated telemetry. <a href="${base}Docs/Maintenance-study.md">Results and limitations</a>. Policy review v1 implements the next workflow slice, not a superiority claim.</p>`);
  el('human-docs').insertAdjacentHTML('beforeend', `<section class="tutorial"><h2>What comes after the pilot?</h2><p>Both languages handled the repeated maintenance task. That does not establish a Wisp advantage or settle which capabilities it needs. Try the policy-change workbench to review explicit examples; external usefulness remains unproven. <a href="${base}Docs/Maintenance-study.md">Read the repeated study</a>.</p></section>`);
  document.querySelector('.doc-links')?.insertAdjacentHTML('beforeend', `<a href="${base}Docs/Workbench.md">Policy workbench ↗</a><a href="${base}Docs/Decisions/0010-policy-change-workbench.md">ADR 0010 ↗</a>`);
  el('agent-docs').insertAdjacentHTML('beforeend', `<h2>Policy review / contract v1</h2><p>Submit op review with baseline source, candidate string and strict suite:{version:1,target,cases:[{id,args,expect:{result:{type,value},output}}]}. Both sources and all typed cases preflight before execution; each observation has a fresh invocation budget. Root Pass/Fail/Unknown/Error, comparison and expectation are separate axes. Approval is always not_granted. Review preserves raw args and never rewrites expected data or applies source. <a href="${base}Docs/Workbench.md">Runnable workflow and limits</a>.</p>`);
  el('human-docs').insertAdjacentHTML('beforeend', `<section class="tutorial"><h2>Review a policy change</h2><p>Open Policy change workbench and load the reservation walkthrough (this explicitly replaces the editor). Select Review cases: seven examples run against both revisions, with two changed decisions and five unchanged. Expand a case for before/after results and the caller-owned expectation. Pass is not approval or proof.</p><p>Set an expected packs value to the string 999 and review again: the mismatch remains visible and your specification stays unchanged. Capture your own baseline, edit Code and review again. Source/case edits and recapture make old results historical, even when reverted; Stop/deadline accepts no partial report. Run/ghost history stays separate.</p><pre>cargo run -- review examples/policies/reservations-before.wisp examples/policies/reservations-after.wisp --suite examples/policies/cases.json</pre><p>Use verify SOURCE --suite CASES for a self-comparison against those examples, not universal verification. <a href="${base}Docs/Workbench.md">Workbench guide</a>.</p></section>`);
  el('agent-docs').insertAdjacentHTML('beforeend', `<h2>Validation status</h2><p>Small paired pilot: Wisp 2/3 tasks accepted, strict TypeScript/BigInt 3/3. The Wisp refund submission violated an exact parsed-body boundary by adding a newline; behavior was not graded. No token-cost or superiority claim. <a href="${base}Docs/Evaluation.md">Evidence, limitations and reproduction</a>. For consumers requiring brace-to-brace changes only, omit outer replacement whitespace and independently verify recomposition; the edit contract permits outer whitespace in its insertion range.</p>`);
  el('human-docs').insertAdjacentHTML('beforeend', `<section class="tutorial"><h2>What have we actually validated?</h2><p>Three small maintenance tasks per language, not a representative benchmark. Five of six final submissions passed; a Wisp refund attempt failed a strict edit-boundary rule. We preserved that failure instead of fixing the score. Agent token cost and latency were not measured. <a href="${base}Docs/Evaluation.md">Read the pilot and its limitations</a>. Useful external trials, not more language features, are the next gate.</p></section>`);
  el('agent-docs').insertAdjacentHTML('beforeend', '<h2>Guarded body preparation / edit v1</h2><p>Analyze exact source for revision and function body_hash/body_span; submit op edit with explicit focus and change:{expected_revision,expected_body_hash,replacement}. Ready is whole-program-checked preparation only, never execution or automatic application. A checked baseline is required. Exactly one parsed block with whitespace-only outer trivia is accepted; outer comments are rejected. Review edit.source and preservation before applying against unchanged inputs. Diagnostics in edit.rejected_candidate own candidate offsets; edit.cause owns replacement offsets. Neither belongs to the baseline editor. See Protocol and ADR 0007 for exact schema, precedence and limits.</p>');
  el('human-docs').insertAdjacentHTML('beforeend', '<section class="tutorial"><h2>Preview a guarded body edit</h2><p>Open Guarded function-body edit, choose bill and Load current body. Enter <code>{ snacks * 100 }</code>, then Preview checked edit. Review before/after and candidate source: the editor and evidence have not changed. Apply consumes preparation once and updates the editor without executing. Run or Replay separately.</p><p>Any source, target or replacement edit—even changing it back—invalidates Apply. Stop preview cancels its independent worker. Signatures, outside-body bytes and indexed probe text remain fixed, not all human requirements or intent inside a replaced body. Ready can still fault or fail probes. Invalid-baseline repair, persistent IDs and automatic repair remain deferred.</p></section>');
  el('human-docs').insertAdjacentHTML('beforeend', '<section class="tutorial"><h2>See what the context leaves out</h2><p>In the playground, choose a probe and select <strong>Query context</strong>. This does not run it. The compiler selects the exact predicate, all record declarations and reachable function definitions. The ledger shows each source hash, eligibility, charged bytes and disposition.</p><p>Set the TEXT budget to zero and query again: no source fragment is selected, but the ledger still explains omissions. Raise it to fit all eligible chunks: scope omissions still remain, including top-level statements and other probes. A preceding probe or prelude can consume runtime budgets even though its source is omitted. The run dependency key accounts for that; the extracted text is not promised to reproduce the full run.</p><pre>cargo run -- context examples/snacks.wisp --probe 0 --budget 4096</pre><p>Probe indexes belong to one source revision, not persistent symbols. Source/selector/budget edits make the previous query historical. Stop query cancels its independent worker and accepts no new context. The text budget excludes this ledger/metadata, is measured in UTF-8 bytes rather than tokens, and does not imply absolute memory bounds or a minimal/relevant/complete context. Comments and strings remain untrusted data, not instructions.</p></section>');
  el('human-docs').insertAdjacentHTML('beforeend', `<section class="tutorial"><h2>Errors an agent can read</h2><p>Diagnostics now include stable codes such as <code>E_DIV_ZERO</code> and <code>E_LIMIT_FUEL</code>, alongside kind, human message, UTF-8 span and optional input path. Codes describe what happened—not the repair you intended. Unknown is incomplete work, not success. Check the enclosing report/probe/replay status; not every status can be inferred from the diagnostic kind.</p><p><code>cargo run -- capabilities</code> and <a href="${base}agent.json">agent.json</a> return the same compiler-owned catalog. The manifest lists only built features, permissions and exact logical limits, not planned features or absolute memory/security guarantees. See <a href="${base}Docs/Errors.md">Errors.md</a> for code meanings and compatibility rules.</p></section>`);
  text('tutorial-source', snacks);
  text('invoice-tutorial', invoice);
  el('agent-docs').insertAdjacentHTML('beforeend', '<h2>Invoke with structured data</h2><pre id="call-request-example"></pre><p>Only the selected function executes; top-level statements and probes are checked but skipped. Int values are canonical decimal strings. Input errors carry JSON Pointer paths, not source locations. One result is observed evidence, not a Clear finite domain.</p>');
  text('call-request-example', JSON.stringify({ op: 'call', source: invoice, function: 'total', args: [{ quantity: '9', unit_price: '100' }] }, null, 2));
  el('human-docs').insertAdjacentHTML('beforeend', '<section class="tutorial"><h2>Pass data without rewriting code</h2><p>Select the invoice example, then use <strong>Invoke a typed function</strong>. Choose <code>total</code> and supply <code>[{"quantity":"9","unit_price":"100"}]</code>. The array contains arguments; each record is an object with exactly its declared fields. Ints are decimal strings to preserve i64 precision; Bool uses true/false and String uses JSON text.</p><p>The typed result is Int/900. Only that function runs: no top-level prints and no 21-case probe. Captured prints inside the function still appear in Output. A result is one observed execution, never a proof or Clear domain. Editing source, input or target marks the prior invocation historical. Stop/deadline accepts no partial result.</p><pre>cargo run -- call examples/invoice.wisp total --args-file examples/invoice-args.json</pre><p>The CLI reads a bounded explicit local file or stdin. JSON data never becomes source or an expression. There is still no filesystem/network permission inside Wisp. Duplicate/unknown fields and incorrect types fail before execution; diagnostics point into the input, such as /args/0/quantity. Captured print and encoded return value share the output budget.</p></section>');
  el('human-docs').insertAdjacentHTML('beforeend', `<section class="tutorial"><h2>Keep a ghost after closing the tab</h2><p>Run the broken snack example, then choose <strong>Export ghost + source</strong>. The local JSON download includes the entire historical source, compiler identity, exact limits and receipt—review it before sharing. Nothing is uploaded or automatically saved.</p><pre>cargo run -- inspect path/to/ghost.json
cargo run -- replay examples/snacks-repaired.wisp --artifact path/to/ghost.json</pre><p>Or use <strong>Import ghost file</strong> in the playground after a reload. Import leaves your current editor unchanged. Rust reproduces the recorded first failure before accepting the file; this is a new bounded validation run, not authentication of claimed history. Replay against your current code is a separate single-input execution, not a Clear domain result. Unknown/compiler-version mismatches and corrupt files are rejected, not repaired.</p><h2>Use Wisp from an agent terminal</h2><pre>cargo run -- check examples/snacks.wisp
cargo run -- focus examples/snacks.wisp bill --budget 1024
cargo run -- archive examples/snacks.wisp --out snacks.wisp-ghost.json</pre><p><code>check</code> and <code>focus</code> do not execute output or probes. Explicit commands use process exit 0 for successful Complete/Ready/Pass, 1 for Fail/Error, 3 for Unknown and 2 for host IO/usage failures. The original file and <code>--json</code> commands keep their compatibility exit behavior. Archive output never overwrites an existing path.</p></section>`);
  text('request-example', JSON.stringify({ op: 'run', source: snacks, focus: 'bill', budget: 4096 }, null, 2));
  let choice = 'agent';
  try { choice = localStorage.getItem('wisp-doc-mode') === 'human' ? 'human' : 'agent'; } catch { /* Agent remains the default. */ }
  const setMode = (mode: string, persist = false) => {
    el('agent-docs').hidden = mode !== 'agent'; el('human-docs').hidden = mode !== 'human';
    el('agent-mode').setAttribute('aria-pressed', String(mode === 'agent'));
    el('human-mode').setAttribute('aria-pressed', String(mode === 'human'));
    text('mode-note', `${mode === 'agent' ? 'Agent' : 'Human'} mode. Agent is the fresh-visit default; an explicit choice is remembered on this browser when storage is available.`);
    if (persist) { try { localStorage.setItem('wisp-doc-mode', mode); } catch { text('mode-note', 'Mode changed for this visit. Browser storage is unavailable; this choice was not saved.'); } }
  };
  setMode(choice);
  el('agent-mode').onclick = () => setMode('agent', true);
  el('human-mode').onclick = () => setMode('human', true);
} else if (isWorkbench) {
  setupWorkbench();
} else {
  setupPlayground();
}

interface Diagnostic { code?: string; kind: string; message: string; span: { start: number; end: number }; path?: string }
interface Ghost { revision: string; predicate_key: string; dependency_key: string; input: string; witness_id: string }
interface Limits { source_bytes: number; fuel: number; call_depth: number; evaluation_depth: number; output_bytes: number; allocation_bytes: number; cases: number }
interface ByteSpan { start: number; end: number }
interface FunctionFact { name: string; signature?: string; body_hash?: string; body_span?: ByteSpan }
interface CheckedFunction extends FunctionFact { body_hash: string; body_span: ByteSpan }
interface PreparedBody { version: number; state: string; target: string; base_revision: string; candidate_revision: string; base_body_hash: string; candidate_body_hash: string; base_body_span: ByteSpan; candidate_body_span: ByteSpan; insertion_range: ByteSpan; source: string; preservation: { checked: boolean; prefix: boolean; suffix: boolean; signature: boolean; records: boolean; other_functions: boolean; top_level_statements: boolean; probes: { index: number; predicate_key: string; text_preserved: boolean; domain_preserved: boolean }[] } }
interface EditResponse { compiler: string; revision: string; status: string; new_execution?: boolean; diagnostics: Diagnostic[]; edit?: Partial<PreparedBody> & { cause?: unknown; rejected_candidate?: unknown } }
interface EditSnapshot { source: string; sourceGeneration: number; inputGeneration: number; target: string; replacement: string; compiler: string; revision: string; body: CheckedFunction; limits: Limits; config: string }
interface ProbeContext { version: number; query_key: string; selector: string; selected_probe: { index: number; variable: string; domain: { start: string; end: string }; predicate_key: string; dependency_key: string }; text: string; budget_bytes: number; used_bytes: number; required_bytes: number; overflow: boolean; provenance: string; budget_scope: string; identity_scope: string; ledger: { id: string; disposition: string; eligible: boolean; chunk_bytes: number; included_bytes: number; source_hash: string }[]; scope_omissions: unknown[]; assumptions: string[]; unknowns: string[]; observations: unknown[]; proofs: unknown[] }
interface Artifact { format: 'wisp-ghost'; version: 1; compiler: string; source: string; limits: Limits; ghost: Ghost }
interface Probe { status: string; completed_cases: number; domain: { start: string; end: string }; failing_input: string | null; dependency_key: string; predicate_key: string; ghost: Ghost | null; claim: string; diagnostic: Diagnostic | null }
interface Report { revision: string; compiler: string; status: string; output: string; diagnostics: Diagnostic[]; probes: Probe[]; probe_metadata?: { predicate_key: string; dependency_key: string }[]; limits: Limits; graph: { functions: FunctionFact[] }; new_execution?: boolean; context?: ProbeContext; invocation?: { target: string; new_execution: boolean; execution_key?: string }; result?: { type: string; value: unknown }; artifact?: Artifact; validation?: { status: string; phase: string; new_execution: boolean; note: string }; agent_view?: { focus: string | null; text: string; overflow: boolean; used_bytes: number; required_bytes: number; omitted: string[] }; replay?: { status: string; input: string; new_execution: boolean; diagnostic: Diagnostic | null } }
interface Receipt { ghost: Ghost; source: string; limits: Limits; artifact?: Artifact; imported?: boolean; replay?: { revision: string; status: string } }

function setupPlayground() {
  const source = el<HTMLTextAreaElement>('source'); source.value = snacks;
  const run = el<HTMLButtonElement>('run'); const stop = el<HTMLButtonElement>('stop');
  const focus = el<HTMLSelectElement>('focus'); const budget = el<HTMLInputElement>('budget');
  const fileInput = el<HTMLInputElement>('artifact-file');
  const invoke = el<HTMLButtonElement>('invoke'); const target = el<HTMLSelectElement>('call-target'); const args = el<HTMLTextAreaElement>('call-args');
  const contextSelector = el<HTMLSelectElement>('context-selector'); const contextBudget = el<HTMLInputElement>('context-budget');
  const contextQuery = el<HTMLButtonElement>('context-query'); const contextStop = el<HTMLButtonElement>('context-stop');
  const editTarget = el<HTMLSelectElement>('edit-target'); const replacement = el<HTMLTextAreaElement>('edit-replacement');
  const editLoad = el<HTMLButtonElement>('edit-load'); const editPreview = el<HTMLButtonElement>('edit-preview'); const editStop = el<HTMLButtonElement>('edit-stop'); const editApply = el<HTMLButtonElement>('edit-apply');
  let serial = 0; let analysisWorker: Worker | undefined; let runWorker: Worker | undefined;
  let analysisTimer: ReturnType<typeof setTimeout>; let runDeadline: ReturnType<typeof setTimeout>;
  let latestAnalysis: Report | undefined; let lastRun: Report | undefined; let executedSource = '';
  const receipts: Receipt[] = []; // Immutable receipts live for this page session; no silent persistence or authentication claim.
  let busy = false;
  let fileReader: FileReader | undefined;
  let callActive = false; let lastCall: { report: Report; source: string; args: string; target: string } | undefined;
  let checkedTargets = new Set<string>();
  let diagnosticInput: { source: string; args: string; target: string; rendered: string; sourceOnly: boolean } | undefined;
  let contextWorker: Worker | undefined; let contextDeadline: ReturnType<typeof setTimeout>; let checkedProbeCount = 0;
  let lastContext: { report: Report; source: string; selector: string; budget: string; historical: boolean } | undefined;
  let sourceGeneration = 0; let editGeneration = 0; let editWorker: Worker | undefined; let editDeadline: ReturnType<typeof setTimeout>;
  let editFacts: { source: string; revision: string; compiler: string; limits: Limits; functions: CheckedFunction[] } | undefined;
  let prepared: { body: PreparedBody; snapshot: EditSnapshot; stale: boolean } | undefined;
  const makeWorker = () => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  const diagnosticMessage = (d: Diagnostic) => `${d.message}${d.code ? ` [${d.code}]` : ''}`;
  function renderDiagnostics(report: Report, submitted: string, inputContext?: { args: string; target: string }) {
    const messages = report.diagnostics.concat(report.probes.flatMap(p => p.diagnostic ? [p.diagnostic] : []));
    const rendered = messages.length ? messages.map(d => {
      if (d.path !== undefined) return `${d.kind} · ${d.path} · ${diagnosticMessage(d)}`;
      // Spans are byte offsets, not JavaScript UTF-16 offsets.
      const before = new TextDecoder().decode(new TextEncoder().encode(submitted).slice(0, d.span.start));
      const lines = before.split('\n');
      return `${d.kind} · ${lines.length}:${Array.from(lines.at(-1) ?? '').length + 1} · ${diagnosticMessage(d)}`;
    }).join('\n') : 'Checked by Rust · no source diagnostics';
    text('diagnostics', rendered);
    diagnosticInput = inputContext ? { ...inputContext, source: submitted, rendered, sourceOnly: messages.length > 0 && messages.every(d => ['Syntax', 'Type', 'Purity'].includes(d.kind)) } : undefined;
  }
  function inputEdited() {
    renderCall();
    if (!diagnosticInput || diagnosticInput.source !== source.value || diagnosticInput.sourceOnly) return;
    text('diagnostics', diagnosticInput.args === args.value && diagnosticInput.target === target.value ? diagnosticInput.rendered : 'Source unchanged; current invocation input has not been checked. Prior input-dependent diagnostics are historical.');
  }
  function renderAgent(report: Report) {
    const priorEditTarget = editTarget.value;
    const editFunctions = report.agent_view ? report.graph.functions.filter((fn): fn is CheckedFunction => typeof fn.body_hash === 'string' && fn.body_span !== undefined) : [];
    editFacts = report.agent_view ? { source: source.value, revision: report.revision, compiler: report.compiler, limits: report.limits, functions: editFunctions } : undefined;
    editTarget.replaceChildren(...editFunctions.map(fn => new Option(fn.signature ?? fn.name, fn.name)));
    if (editFunctions.some(fn => fn.name === priorEditTarget)) editTarget.value = priorEditTarget;
    if (!editFunctions.length) editTarget.add(new Option('No checked functions', ''));
    updateEditControls();
    if (report.probe_metadata !== undefined || !report.agent_view) {
      const selectedProbe = contextSelector.value;
      const specs = report.probe_metadata ?? []; checkedProbeCount = specs.length;
      contextSelector.replaceChildren(...specs.map((spec, index) => new Option(`Probe ${index} · predicate ${spec.predicate_key.slice(0, 8)}`, `probe:${index}`)));
      if (specs.some((_, index) => `probe:${index}` === selectedProbe)) contextSelector.value = selectedProbe;
      if (!specs.length) contextSelector.add(new Option('No checked probes', ''));
      contextQuery.disabled = Boolean(contextWorker) || !checkedProbeCount;
      renderContext();
    }
    const names = report.graph.functions.map(f => f.name); const selected = focus.value;
    checkedTargets = new Set(names);
    const previousTarget = target.value;
    target.replaceChildren(...report.graph.functions.map(f => new Option(f.signature ?? f.name, f.name)));
    if (names.includes(previousTarget)) target.value = previousTarget;
    if (!names.length) target.add(new Option(previousTarget ? `Unverified target: ${previousTarget}` : 'No checked functions', previousTarget));
    invoke.disabled = busy || !names.length; renderCall();
    focus.replaceChildren(...names.map(n => new Option(n, n)));
    if (names.includes(selected)) focus.value = selected;
    if (!names.length) focus.add(new Option('No functions', ''));
    const view = report.agent_view;
    if (names.length && view?.focus !== focus.value) {
      text('agent-text', 'Focus changed. Requesting compiler facts for the selected function…');
      analyze(); return;
    }
    text('agent-text', view?.text ?? 'Agent View unavailable: source did not pass checking.');
    text('agent-budget', view ? `${view.used_bytes} / ${view.required_bytes} required UTF-8 bytes · ${view.overflow ? 'OVERFLOW — facts omitted' : 'within text budget'}` : 'No checked facts');
    el('omissions').replaceChildren(...(view?.omitted ?? ['All compiler context unavailable']).map(value => { const li = document.createElement('li'); li.textContent = value; return li; }));
    text('graph', JSON.stringify({ compiler: report.compiler, revision: report.revision, limits: report.limits, graph: report.graph, agent_view: report.agent_view }, null, 2));
  }
  function renderEvidence() {
    renderCall();
    const container = el('evidence'); container.replaceChildren();
    if (!lastRun && !receipts.length) {
      const note = document.createElement('p'); note.className = 'empty'; note.textContent = 'A probe checks a declared finite domain. A failure leaves a replayable ghost here.'; container.append(note);
    }
    if (lastRun) {
      const historical = executedSource !== source.value;
      text('revision', `${historical ? 'Historical' : 'Executed'} · ${lastRun.revision.slice(0, 10)}`);
      for (const [index, p] of lastRun.probes.entries()) {
        const card = document.createElement('article'); card.className = 'evidence-card';
        const head = document.createElement('strong'); head.textContent = `${p.status === 'Fail' ? 'Counterexample (Fail)' : p.status} · ${p.completed_cases} completed cases`; card.append(head);
        const detail = document.createElement('p'); detail.textContent = `Domain ${p.domain.start}..=${p.domain.end}${p.failing_input !== null ? ` · failing input ${p.failing_input}` : ''}. ${p.claim}`; card.append(detail);
        const badge = document.createElement('p'); badge.className = 'mono evidence-key';
        const candidate = latestAnalysis?.probe_metadata?.[index];
        const current = candidate?.predicate_key === p.predicate_key ? candidate : undefined;
        badge.textContent = `${historical ? 'Historical source revision; not current execution.' : 'Observed on this exact source.'} Key ${p.dependency_key.slice(0, 10)}${current ? ` · ${current.dependency_key === p.dependency_key ? 'dependency key unchanged; no re-execution' : 'STALE — dependencies changed'}` : historical ? ' · current dependency status unknown' : ''}`; card.append(badge); container.append(card);
      }
      if (!lastRun.probes.length) { const note = document.createElement('p'); note.className = 'empty'; note.textContent = 'No probe evidence produced by this execution. Source errors or interrupted top-level execution cannot count as passing probes.'; container.append(note); }
    }
    for (const receipt of receipts) {
      const card = document.createElement('article'); card.className = 'ghost-card';
      const title = document.createElement('strong'); title.textContent = `Ghost · input ${receipt.ghost.input} · revision ${receipt.ghost.revision.slice(0, 10)}`; card.append(title);
      const note = document.createElement('p'); note.textContent = receipt.replay ? `New replay: ${receipt.replay.status} on ${receipt.replay.revision.slice(0, 10)}. A passing replay is not a Clear probe.` : receipt.imported ? 'Imported historical failure reproduced under archived limits. This is not authentication of claimed history.' : 'Historical failing input. Kept unchanged when source changes. Receipts are local, not authenticated.'; card.append(note);
      const replay = document.createElement('button'); replay.textContent = `Replay input ${receipt.ghost.input}`; replay.disabled = busy; replay.onclick = () => execute(receipt); card.append(replay);
      const save = document.createElement('button'); save.textContent = 'Export ghost + source'; save.disabled = busy; save.className = 'export-ghost'; save.onclick = () => artifactTask({ op: 'archive', source: receipt.source, ghost: receipt.ghost, limits: receipt.limits }, receipt); card.append(save);
      const privacy = document.createElement('p'); privacy.className = 'artifact-warning'; privacy.textContent = 'Download contains the entire historical source and execution limits. Review before sharing.'; card.append(privacy);
      const oldSource = document.createElement('details'); const summary = document.createElement('summary'); summary.textContent = 'Historical source / receipt'; const pre = document.createElement('pre'); pre.textContent = `${receipt.source}\n\n${JSON.stringify(receipt.ghost, null, 2)}`; oldSource.append(summary, pre); card.append(oldSource); container.append(card);
    }
  }
  function currentEditFunction() {
    return editFacts?.source === source.value ? editFacts.functions.find(fn => fn.name === editTarget.value) : undefined;
  }
  function snapshotCurrent(snapshot: EditSnapshot) {
    return snapshot.sourceGeneration === sourceGeneration && snapshot.inputGeneration === editGeneration && snapshot.source === source.value && snapshot.target === editTarget.value && snapshot.replacement === replacement.value && editFacts?.source === source.value && editFacts.revision === snapshot.revision && editFacts.compiler === snapshot.compiler && JSON.stringify(editFacts.limits) === snapshot.config;
  }
  function updateEditControls() {
    const usable = Boolean(currentEditFunction());
    editLoad.disabled = Boolean(editWorker) || !usable;
    editPreview.disabled = Boolean(editWorker) || !usable || !replacement.value;
    editStop.disabled = !editWorker;
    editApply.disabled = Boolean(editWorker) || !prepared || prepared.stale || !snapshotCurrent(prepared.snapshot);
  }
  function stopEdit(reason: string) {
    if (!editWorker) return;
    editWorker.terminate(); editWorker = undefined; clearTimeout(editDeadline); prepared = undefined;
    updateEditControls(); text('edit-status', `Unknown — ${reason}. No prepared edit accepted; editor unchanged.`);
  }
  function invalidateEdit(reason: string) {
    editGeneration++;
    const pending = Boolean(editWorker);
    if (editWorker) stopEdit(`${reason}; preview cancelled`);
    if (prepared) { prepared.stale = true; text('edit-status', `Stale preview — ${reason}. Preview again; editor unchanged by this tool.`); }
    else if (!pending) text('edit-status', `Edit inputs changed — ${reason}. No current prepared edit; editor unchanged by this tool.`);
    updateEditControls();
  }
  function bytesAt(value: string, span: ByteSpan) {
    const bytes = new TextEncoder().encode(value);
    if (!Number.isInteger(span.start) || !Number.isInteger(span.end) || span.start < 0 || span.end < span.start || span.end > bytes.length) throw new Error('Invalid compiler byte span');
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes.subarray(span.start, span.end));
  }
  function validPrepared(body: Partial<PreparedBody> | undefined, snapshot: EditSnapshot): body is PreparedBody {
    if (!body || body.version !== 1 || body.state !== 'prepared' || body.target !== snapshot.target || body.base_revision !== snapshot.revision || body.base_body_hash !== snapshot.body.body_hash || typeof body.source !== 'string' || !/^[0-9a-f]{64}$/.test(body.candidate_revision ?? '') || !/^[0-9a-f]{64}$/.test(body.candidate_body_hash ?? '')) return false;
    const audit = body.preservation;
    if (!audit?.checked || !audit.prefix || !audit.suffix || !audit.signature || !audit.records || !audit.other_functions || !audit.top_level_statements || !Array.isArray(audit.probes) || audit.probes.some(probe => !probe.text_preserved || !probe.domain_preserved)) return false;
    if (!body.base_body_span || !body.candidate_body_span || !body.insertion_range) return false;
    if (body.base_body_span.start !== snapshot.body.body_span.start || body.base_body_span.end !== snapshot.body.body_span.end) return false;
    const baseBytes = new TextEncoder().encode(snapshot.source); const nextBytes = new TextEncoder().encode(body.source);
    const range = body.insertion_range; const parsed = body.candidate_body_span;
    const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((value, index) => value === b[index]);
    try {
      bytesAt(body.source, range); bytesAt(body.source, parsed);
      if (nextBytes.length > snapshot.limits.source_bytes || parsed.start < range.start || parsed.end > range.end) return false;
      if (!same(baseBytes.subarray(0, snapshot.body.body_span.start), nextBytes.subarray(0, range.start))) return false;
      if (!same(baseBytes.subarray(snapshot.body.body_span.end), nextBytes.subarray(range.end))) return false;
      return bytesAt(body.source, range) === snapshot.replacement;
    } catch { return false; }
  }
  function previewEdit() {
    if (editWorker) stopEdit('new preview superseded prior request');
    const fn = currentEditFunction(); const facts = editFacts;
    if (!fn || !facts) { text('edit-status', 'No current checked baseline/function. Check source first.'); return; }
    prepared = undefined;
    for (const name of ['edit-before', 'edit-after', 'edit-source', 'edit-json', 'edit-identity']) text(name, '');
    if (new TextEncoder().encode(replacement.value).length > 65536) { updateEditControls(); text('edit-status', 'Unknown — replacement exceeds 64 KiB host limit. No edit accepted.'); return; }
    const snapshot: EditSnapshot = { source: source.value, sourceGeneration, inputGeneration: editGeneration, target: fn.name, replacement: replacement.value, compiler: facts.compiler, revision: facts.revision, body: fn, limits: facts.limits, config: JSON.stringify(facts.limits) };
    const id = ++serial; const worker = makeWorker(); editWorker = worker; updateEditControls();
    text('edit-status', 'Preparing guarded candidate in Rust. No source change or execution.');
    editDeadline = setTimeout(() => stopEdit('preview deadline; worker terminated'), 5000);
    const finish = () => { clearTimeout(editDeadline); worker.terminate(); editWorker = undefined; updateEditControls(); };
    worker.onerror = () => { if (editWorker !== worker) return; finish(); text('edit-status', 'Error — preview worker failed. No edit accepted; editor unchanged.'); };
    worker.onmessage = (event: MessageEvent<{ id: number; report?: EditResponse; error?: string }>) => {
      if (editWorker !== worker || event.data.id !== id) return;
      finish();
      if (!snapshotCurrent(snapshot)) { text('edit-status', 'Stale preview reply discarded. No edit accepted; editor unchanged.'); return; }
      const report = event.data.report;
      text('edit-json', JSON.stringify(report ?? { error: event.data.error }, null, 2));
      if (report?.status !== 'Ready' || report.new_execution !== false) { text('edit-status', `${report?.status ?? 'Error'} — preparation not accepted; editor unchanged. ${report?.diagnostics.map(diagnosticMessage).join('; ') || event.data.error || ''} Document-tagged causes remain in the preparation JSON.`); return; }
      if (report.compiler !== snapshot.compiler || report.revision !== snapshot.revision || !validPrepared(report.edit, snapshot)) { text('edit-status', 'Error — invalid preparation response/guards. No edit accepted; editor unchanged.'); return; }
      prepared = { body: report.edit, snapshot, stale: false }; updateEditControls();
      text('edit-before', bytesAt(snapshot.source, snapshot.body.body_span)); text('edit-after', snapshot.replacement); text('edit-source', report.edit.source);
      text('edit-identity', `${snapshot.target} · base ${report.edit.base_revision.slice(0, 12)} → candidate ${report.edit.candidate_revision.slice(0, 12)} · body ${report.edit.candidate_body_hash.slice(0, 12)} · ${report.edit.preservation.probes.length} indexed probe specifications retained`);
      text('edit-status', 'Prepared preview — baseline/candidate checked only. No source changed, execution or probe result. Review before Apply.');
    };
    worker.postMessage({ id, request: { op: 'edit', source: snapshot.source, focus: snapshot.target, limits: snapshot.limits, change: { expected_revision: snapshot.revision, expected_body_hash: fn.body_hash, replacement: snapshot.replacement } } });
  }
  function applyEdit() {
    const candidate = prepared;
    if (!candidate || candidate.stale || editWorker || !snapshotCurrent(candidate.snapshot) || !validPrepared(candidate.body, candidate.snapshot)) { editApply.disabled = true; text('edit-status', 'No current prepared edit. Preview again; editor unchanged.'); return; }
    prepared = undefined; editApply.disabled = true;
    source.value = candidate.body.source; source.dispatchEvent(new Event('input'));
    text('edit-status', 'Applied explicit checked candidate to editor once. No execution ran. Prior evidence keeps its original revision; Run or Replay separately.');
  }
  function renderContext() {
    if (!lastContext?.report.context) return;
    const { report } = lastContext; const c = report.context!;
    const historical = lastContext.historical || lastContext.source !== source.value || lastContext.selector !== contextSelector.value || lastContext.budget !== contextBudget.value;
    text('context-status', `${historical ? 'Historical query — inputs changed' : 'Ready — submitted inputs'} · compiler-derived metadata only; no execution or probe result.`);
    text('context-identity', `${c.selector} · source ${report.revision.slice(0, 12)} · query ${c.query_key.slice(0, 12)} · run dependency ${c.selected_probe.dependency_key.slice(0, 12)}`);
    text('context-accounting', `${c.used_bytes} included / ${c.required_bytes} eligible UTF-8 bytes · effective budget ${c.budget_bytes} · ${c.overflow ? 'OVERFLOW — atomic chunks omitted' : 'All eligible chunks fit; scope omissions still apply'}`);
    text('context-text', c.text);
    el('context-ledger').replaceChildren(...c.ledger.map(entry => {
      const row = document.createElement('tr');
      for (const value of [entry.id, entry.disposition, String(entry.eligible), String(entry.chunk_bytes), String(entry.included_bytes), entry.source_hash.slice(0, 12)]) {
        const cell = document.createElement('td'); cell.textContent = value; row.append(cell);
      }
      return row;
    }));
    text('context-scope', JSON.stringify({ scope_omissions: c.scope_omissions, assumptions: c.assumptions, unknowns: c.unknowns, observations: c.observations, proofs: c.proofs, budget_scope: c.budget_scope, identity_scope: c.identity_scope }, null, 2));
    text('context-json', JSON.stringify(report, null, 2));
  }
  function cancelContext(reason: string) {
    if (!contextWorker) return;
    contextWorker.terminate(); contextWorker = undefined; clearTimeout(contextDeadline);
    contextQuery.disabled = !checkedProbeCount; contextStop.disabled = true;
    text('context-status', `Unknown — ${reason}. No new context accepted; no execution occurred.`);
  }
  function contextInputsChanged() {
    const pending = Boolean(contextWorker);
    if (lastContext) lastContext.historical = true;
    if (contextWorker) cancelContext('query inputs changed; request cancelled');
    if (!lastContext && !pending) text('context-status', 'Query inputs changed. No checked context accepted for these inputs.');
    renderContext();
  }
  function queryContext() {
    if (contextWorker || !checkedProbeCount) return;
    const submitted = source.value; const selector = contextSelector.value; const budgetInput = contextBudget.value;
    const budgetBytes = Math.max(0, Math.min(65536, Number(budgetInput) || 0));
    const id = ++serial; const worker = makeWorker(); contextWorker = worker; lastContext = undefined;
    contextQuery.disabled = true; contextStop.disabled = false;
    text('context-status', 'Querying compiler metadata. No execution or accepted context yet.');
    for (const name of ['context-text', 'context-identity', 'context-accounting', 'context-scope', 'context-json']) text(name, '');
    el('context-ledger').replaceChildren();
    contextDeadline = setTimeout(() => cancelContext('query deadline; worker terminated'), 5000);
    const finish = () => { clearTimeout(contextDeadline); worker.terminate(); contextWorker = undefined; contextStop.disabled = true; contextQuery.disabled = !checkedProbeCount; };
    worker.onerror = () => { if (contextWorker !== worker) return; finish(); text('context-status', 'Error — context worker failed. No context accepted; no execution occurred.'); };
    worker.onmessage = (event: MessageEvent<{ id: number; report?: Report; error?: string }>) => {
      if (contextWorker !== worker || event.data.id !== id) return;
      finish();
      if (submitted !== source.value || selector !== contextSelector.value || budgetInput !== contextBudget.value) { text('context-status', 'Historical reply discarded — query inputs changed. No context accepted.'); return; }
      const report = event.data.report;
      if (report?.status !== 'Ready' || !report.context || report.context.version !== 1 || report.new_execution !== false) {
        text('context-status', `${report?.status ?? 'Error'} — no checked context accepted. ${report?.diagnostics.map(d => `${d.kind}${d.path ? ` ${d.path}` : ` source bytes ${d.span.start}..${d.span.end}`}: ${diagnosticMessage(d)}`).join('; ') || event.data.error || 'Unexpected context response'}`); return;
      }
      lastContext = { report, source: submitted, selector, budget: budgetInput, historical: false }; renderContext();
    };
    worker.postMessage({ id, request: { op: 'context', source: submitted, focus: selector, budget: budgetBytes } });
  }
  function analyze() {
    clearTimeout(analysisTimer); analysisWorker?.terminate();
    const submitted = source.value; const id = ++serial;
    const worker = makeWorker(); analysisWorker = worker;
    const timeout = setTimeout(() => { worker.terminate(); if (analysisWorker === worker) text('diagnostics', 'Unknown · analysis worker exceeded host deadline. No checked facts.'); }, 5000);
    worker.onerror = () => { clearTimeout(timeout); worker.terminate(); if (analysisWorker === worker && submitted === source.value) text('diagnostics', 'Error · WASM analysis worker failed to load.'); };
    worker.onmessage = (event: MessageEvent<{ id: number; report?: Report; error?: string }>) => {
      clearTimeout(timeout); worker.terminate();
      if (analysisWorker !== worker || submitted !== source.value || event.data.id !== id) return;
      if (!event.data.report) { text('diagnostics', `Error · ${event.data.error ?? 'Worker transport failure'}`); return; }
      latestAnalysis = event.data.report; renderDiagnostics(latestAnalysis, submitted); renderAgent(latestAnalysis); renderEvidence();
    };
    worker.postMessage({ id, request: { op: 'analyze', source: submitted, ...(focus.value ? { focus: focus.value } : {}), budget: Math.max(0, Math.min(65536, Number(budget.value) || 0)) } });
  }
  function renderCall() {
    if (!lastCall || callActive) return;
    const { report } = lastCall;
    const historical = lastCall.source !== source.value || lastCall.args !== args.value || lastCall.target !== target.value;
    text('call-result', report.result ? JSON.stringify(report.result, null, 2) : `No result · ${report.status}`);
    text('call-evidence', `${historical ? 'Historical source/input/target' : 'Submitted current source/input/target'} · ${report.revision.slice(0, 10)} · ${report.invocation?.new_execution ? 'Execution attempted' : 'Not executed'} · ${report.status}${report.invocation?.execution_key ? ` · key ${report.invocation.execution_key.slice(0, 12)}` : ''}. One input only, never Clear or proof.`);
  }
  function setBusy(value: boolean) { busy = value; run.disabled = value; stop.disabled = !value; fileInput.disabled = value; invoke.disabled = value || !checkedTargets.has(target.value); renderEvidence(); }
  function cancel(reason: string) {
    if (!runWorker && !fileReader) return;
    fileReader?.abort(); fileReader = undefined;
    runWorker?.terminate(); runWorker = undefined; clearTimeout(runDeadline); setBusy(false);
    if (callActive) { callActive = false; lastCall = undefined; text('call-result', 'No result · Unknown — invocation interrupted.'); text('call-evidence', 'Unknown. No result from this invocation was accepted; not Clear or proof.'); }
    text('run-status', 'UNKNOWN'); text('activity', reason); text('output', 'Unknown — execution interrupted. No result from this execution is counted as passing. Previous evidence, if any, remains historical.');
    text('artifact-status', 'Interrupted. No artifact was accepted or exported by this operation.');
  }
  function invokeFunction() {
    if (busy) return;
    const submitted = source.value; const raw = args.value; const name = target.value;
    lastCall = undefined;
    if (new TextEncoder().encode(raw).length > 65_536) {
      text('call-result', 'No result · Unknown — input exceeds the 64 KiB host limit.'); text('call-evidence', 'Not executed. Input limit reached before dispatch.'); return;
    }
    // Validate one standalone value, but retain bytes for duplicate/type checks.
    // Invalid syntax is sent as null so Rust still checks the whole source first.
    let validSyntax = true; try { JSON.parse(raw); } catch { validSyntax = false; }
    clearTimeout(analysisTimer); analysisWorker?.terminate(); analysisWorker = undefined;
    const id = ++serial; const worker = makeWorker(); runWorker = worker; callActive = true; setBusy(true);
    text('activity', 'Invoking one typed function locally…'); text('run-status', 'CALLING'); text('call-result', 'Running. No result accepted yet.'); text('call-evidence', 'Only the selected function will execute. Top-level statements and probes are skipped.');
    runDeadline = setTimeout(() => cancel('Invocation deadline: worker terminated'), 5000);
    worker.onerror = () => { if (runWorker !== worker) return; cancel('Invocation worker failure'); text('run-status', 'ERROR'); text('output', 'Error — invocation worker failed. No accepted result.'); text('call-result', 'No result · Error — invocation worker failed.'); text('call-evidence', 'Error. No accepted invocation result; not Clear or proof.'); };
    worker.onmessage = (event: MessageEvent<{ id: number; report?: Report; error?: string }>) => {
      if (runWorker !== worker || event.data.id !== id) return;
      clearTimeout(runDeadline); worker.terminate(); runWorker = undefined; callActive = false;
      const report = event.data.report;
      if (!report) { setBusy(false); text('run-status', 'ERROR'); text('call-result', 'No result · Error — worker transport failed.'); text('call-evidence', event.data.error ?? 'No accepted invocation report.'); return; }
      lastCall = { report, source: submitted, args: raw, target: name }; setBusy(false);
      text('run-status', `CALL ${report.status.toUpperCase()}`); text('output', report.output || '(No captured function output; top-level statements skipped)'); text('activity', 'Typed invocation finished');
      if (submitted === source.value) {
        if (raw === args.value && name === target.value) renderDiagnostics(report, submitted, { args: raw, target: name });
        renderAgent(report);
      }
      renderCall();
    };
    const requestJson = `{"op":"call","source":${JSON.stringify(submitted)},"function":${JSON.stringify(name)},"args":${validSyntax ? raw : 'null'},"focus":${JSON.stringify(focus.value || name)},"budget":${Math.max(0, Math.min(65536, Number(budget.value) || 0))}}`;
    worker.postMessage({ id, requestJson });
  }
  function artifactTask(request: unknown, exporting?: Receipt, requestJson?: string, deadline = performance.now() + 5000) {
    if (runWorker) return;
    clearTimeout(analysisTimer); analysisWorker?.terminate(); analysisWorker = undefined;
    const id = ++serial; const worker = makeWorker(); runWorker = worker; setBusy(true);
    text('activity', 'Reproducing historical failure locally…'); text('artifact-status', 'Validating source, configuration and first failure with Rust…');
    runDeadline = setTimeout(() => cancel('Artifact deadline: worker terminated'), Math.max(0, deadline - performance.now()));
    const finish = () => { clearTimeout(runDeadline); worker.terminate(); runWorker = undefined; setBusy(false); };
    worker.onerror = () => { if (runWorker !== worker) return; finish(); text('artifact-status', 'Error — artifact worker failed. No artifact accepted.'); text('activity', 'Artifact validation failed'); };
    worker.onmessage = (event: MessageEvent<{ id: number; report?: Report; error?: string }>) => {
      if (runWorker !== worker || event.data.id !== id) return;
      finish(); const report = event.data.report;
      if (report?.status !== 'Ready' || !report.artifact) {
        text('artifact-status', `${report?.status ?? 'Error'} — ${report?.diagnostics.map(diagnosticMessage).join('; ') || event.data.error || 'Artifact validation failed'}. No artifact accepted.`);
        text('activity', 'Artifact not accepted'); return;
      }
      const artifact = report.artifact;
      if (exporting) {
        exporting.artifact = artifact;
        const url = URL.createObjectURL(new Blob([JSON.stringify(artifact, null, 2) + '\n'], { type: 'application/json' }));
        const link = document.createElement('a'); link.href = url; link.download = `wisp-ghost-${artifact.ghost.witness_id.slice(0, 12)}.json`; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        text('artifact-status', 'Export prepared: historical failure reproduced. File includes source + limits; reproduction is not authentication or proof.');
      } else {
        const existing = receipts.find(r => r.ghost.witness_id === artifact.ghost.witness_id);
        if (existing) existing.artifact = artifact;
        else receipts.push({ ghost: artifact.ghost, source: artifact.source, limits: artifact.limits, artifact, imported: true });
        text('artifact-status', 'Imported: historical failure reproduced under archived limits. Current editor unchanged. No authentication or proof of claimed history.');
      }
      text('activity', 'Local artifact validation finished'); renderEvidence();
    };
    worker.postMessage({ id, ...(requestJson === undefined ? { request } : { requestJson }) });
  }
  fileInput.onchange = () => {
    const file = fileInput.files?.[0]; fileInput.value = '';
    if (!file || busy) return;
    if (file.size > 1_048_576) { text('artifact-status', 'Error — file exceeds the 1 MiB import limit. No artifact accepted.'); return; }
    const reader = new FileReader(); fileReader = reader; setBusy(true); text('artifact-status', 'Reading selected local file. Nothing is uploaded.');
    const deadline = performance.now() + 5000;
    runDeadline = setTimeout(() => cancel('Artifact deadline: file read interrupted'), 5000);
    const failRead = (message: string) => { clearTimeout(runDeadline); fileReader = undefined; setBusy(false); text('artifact-status', `Error — ${message}. No artifact accepted.`); };
    reader.onerror = () => { if (fileReader !== reader) return; failRead('could not read local file'); };
    reader.onload = () => {
      if (fileReader !== reader) return;
      if (performance.now() >= deadline) { cancel('Artifact deadline: file read interrupted'); return; }
      // Preserve raw JSON: Rust validates duplicate fields and numeric widths.
      let raw: string;
      try { raw = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(reader.result as ArrayBuffer); }
      catch { failRead('file is not valid UTF-8'); return; }
      // Syntax-only check; discard the result and retain raw bytes for Rust.
      try { JSON.parse(raw); } catch { failRead('file must contain one standalone JSON value'); return; }
      if (performance.now() >= deadline) { cancel('Artifact deadline: file read interrupted'); return; }
      clearTimeout(runDeadline); fileReader = undefined;
      artifactTask(undefined, undefined, `{"op":"inspect-artifact","source":"","artifact":${raw}}`, deadline);
    };
    reader.readAsArrayBuffer(file);
  };
  function execute(receipt?: Receipt) {
    if (busy) return;
    clearTimeout(analysisTimer); analysisWorker?.terminate(); analysisWorker = undefined;
    const submitted = source.value; const id = ++serial;
    const worker = makeWorker(); runWorker = worker; setBusy(true); text('run-status', 'RUNNING'); text('activity', receipt ? 'Replaying one historical input…' : 'Executing in local WASM…');
    runDeadline = setTimeout(() => cancel('Host deadline: worker terminated'), 5000);
    worker.onerror = () => { if (runWorker !== worker) return; cancel('Worker failure'); text('run-status', 'ERROR'); text('output', 'Error — WASM worker failed to load or execute. No passing result.'); };
    worker.onmessage = (event: MessageEvent<{ id: number; report?: Report; error?: string }>) => {
      if (runWorker !== worker || event.data.id !== id) return;
      clearTimeout(runDeadline); worker.terminate(); runWorker = undefined;
      const report = event.data.report;
      if (!report) { setBusy(false); text('run-status', 'ERROR'); text('output', `Error — ${event.data.error ?? 'Worker transport failure'}`); text('activity', 'Execution failed'); return; }
      if (receipt?.artifact && !report.artifact) {
        setBusy(false); text('run-status', report.status.toUpperCase());
        text('output', `Historical artifact not accepted. No current-source replay executed.\n${report.diagnostics.map(diagnosticMessage).join('\n')}`);
        text('activity', 'Historical validation failed'); return;
      }
      if (receipt) receipt.replay = { revision: report.revision, status: report.replay?.status ?? report.status };
      else {
        lastRun = report; executedSource = submitted;
        for (const p of report.probes) if (p.ghost && !receipts.some(r => r.ghost.witness_id === p.ghost!.witness_id)) receipts.push({ ghost: p.ghost, source: submitted, limits: report.limits });
      }
      setBusy(false); text('run-status', (report.replay?.status ?? report.status).toUpperCase());
      text('output', receipt ? `Replay input ${receipt.ghost.input}: ${report.replay?.status ?? report.status}. New execution on ${report.revision.slice(0, 10)}. Not a full-domain probe.\n${report.replay?.diagnostic ? diagnosticMessage(report.replay.diagnostic) : report.diagnostics.map(diagnosticMessage).join('\n')}` : report.output || '(No captured output)');
      text('activity', `Local execution finished${submitted !== source.value ? ' · historical source' : ''}`);
      if (submitted === source.value) { renderDiagnostics(report, submitted); renderAgent(report); }
      renderEvidence();
    };
    worker.postMessage({ id, request: { op: receipt?.artifact ? 'replay-artifact' : receipt ? 'replay' : 'run', source: submitted, ...(receipt?.artifact ? { artifact: receipt.artifact } : receipt ? { ghost: receipt.ghost } : {}), ...(focus.value ? { focus: focus.value } : {}), budget: Math.max(0, Math.min(65536, Number(budget.value) || 0)) } });
  }
  run.onclick = () => execute(); stop.onclick = () => cancel('Stopped: worker terminated');
  invoke.onclick = invokeFunction; args.oninput = inputEdited; target.onchange = inputEdited;
  contextQuery.onclick = queryContext; contextStop.onclick = () => cancelContext('stopped; worker terminated');
  contextSelector.onchange = contextInputsChanged; contextBudget.oninput = contextInputsChanged;
  editTarget.onchange = () => invalidateEdit('function target changed'); replacement.oninput = () => invalidateEdit('replacement changed');
  editPreview.onclick = previewEdit; editStop.onclick = () => stopEdit('stopped; worker terminated'); editApply.onclick = applyEdit;
  editLoad.onclick = () => {
    const fn = currentEditFunction(); if (!fn) return;
    try { replacement.value = bytesAt(source.value, fn.body_span); replacement.dispatchEvent(new Event('input')); text('edit-status', 'Loaded exact checked body. Edit it and Preview; source editor unchanged.'); }
    catch { text('edit-status', 'Error — compiler body range unavailable. Editor unchanged.'); }
  };
  source.oninput = () => { sourceGeneration++; editFacts = undefined; invalidateEdit('source changed'); latestAnalysis = undefined; diagnosticInput = undefined; checkedTargets.clear(); invoke.disabled = true; checkedProbeCount = 0; contextQuery.disabled = true; contextInputsChanged(); analysisWorker?.terminate(); renderEvidence(); text('filename', 'scratch.wisp · editable'); text('diagnostics', 'Checking current source…'); text('agent-text', 'Source changed. Previous compiler facts are not current.'); clearTimeout(analysisTimer); analysisTimer = setTimeout(analyze, 250); };
  source.onkeydown = event => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && !busy) { event.preventDefault(); execute(); } };
  focus.onchange = analyze; budget.oninput = analyze;
  el<HTMLSelectElement>('example').onchange = event => { const key = (event.target as HTMLSelectElement).value; source.value = ({ snacks, repaired, inventory, invoice, loan, 'invoice-batch': invoiceBatch } as Record<string, string>)[key]; args.value = key === 'invoice-batch' ? invoiceBatchArgs.trim() : key === 'loan' ? '[{"principal":"30000000","annual_bps":"600","payment":"179865","extra":"0","months":"360"}]' : key === 'invoice' ? '[{"quantity":"9","unit_price":"100"}]' : key === 'inventory' ? '["20", "5"]' : '["9"]'; source.dispatchEvent(new Event('input')); text('filename', `${key === 'repaired' ? 'snacks-repaired' : key}.wisp · editable`); };
  document.querySelector('.call-panel')!.insertAdjacentHTML('beforeend', callInputsMarkup());
  setupCallInputs(source, args, target, makeWorker);
  setupReview(source, makeWorker);
  analyze();
}
