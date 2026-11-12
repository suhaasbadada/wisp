import './review.css';
import { readableReview } from './readable-review';
import { reviewPackage } from './review-package';
import { renderSourceChanges } from './source-changes';
import { renderValueChanges } from './value-changes';
import { diagnosticLocation } from './diagnostic-location';
import { setupWorkspace, workspaceMarkup } from './workspace';
import type { Workspace } from './workspace';
import beforeExample from '../examples/policies/reservations-before.wisp?raw';
import afterExample from '../examples/policies/reservations-after.wisp?raw';
import casesExample from '../examples/policies/cases.json?raw';

export function reviewMarkup() {
  return `<section id="policy-review" class="review-panel"><div class="panel-head"><h3><span class="orange">08</span> Policy change workbench</h3><span class="tag">EXPLICIT CASES · NOT APPROVAL</span></div>
  <p>Capture a baseline, edit the candidate in Code above, then compare explicit typed cases. Rust executes both versions with fresh limits per invocation. No top-level statements or probes run. Expectations are your specification—not automatically repaired.</p>
  <div class="review-controls"><button id="review-capture">Capture editor as baseline</button><button id="review-example">Load reservation walkthrough (replaces editor)</button><button id="review-run" disabled>Review cases</button><button id="review-stop" disabled>Stop review</button></div>
   <div class="review-controls"><button id="review-download-source" disabled>Download reviewed candidate</button><button id="review-download-evidence" disabled>Download review + both sources</button><button id="review-download-readable" disabled>Download readable review</button><button id="review-download-package" disabled>Download runnable review package</button></div>
   <p>Downloads include policy data; the JSON bundle, readable HTML and runnable package contain both complete sources and all cases. Nothing is uploaded. A failed review can be downloaded too—export is not acceptance or Apply.</p>
   ${workspaceMarkup()}
   <details><summary>Captured baseline — unchanged until explicit recapture</summary><label class="sr-only" for="review-baseline">Captured review baseline</label><textarea id="review-baseline" readonly spellcheck="false" placeholder="Capture the editor or load the walkthrough first."></textarea></details>
  <label for="review-suite">Case suite JSON <span>1–16 named cases · 64 KiB · canonical Int strings · exact expected output</span></label><textarea id="review-suite" spellcheck="false"></textarea>
  <button id="review-format-suite" disabled>Format validated case JSON for editing</button><p>For compact or differently formatted files: review first, then explicitly format. Rust must accept suite preflight; this never repairs invalid or duplicate fields. Formatting changes suite bytes, makes the review historical and requires another review for current downloads. Supported shapes then open as forms.</p>
    <p id="review-status" role="status" aria-live="polite">No review. Capture a baseline or load the walkthrough. Nothing is applied or approved.</p><p id="review-identity" class="mono"></p><p id="review-summary" class="mono"></p>
   <div id="review-filters" class="review-controls" hidden><button id="review-filter-all" aria-pressed="true">All scenarios</button><button id="review-filter-attention" aria-pressed="false">Needs attention</button></div>
    <div id="review-source-host"></div><div id="review-decisions" class="decision-scroll"></div><div id="review-cases"></div>
   <div id="review-diagnostics"></div><details><summary>Inspect review JSON and document-owned diagnostics</summary><pre id="review-json"></pre></details>
  <p>Pass means only these candidate examples matched under their limits. Changed is not approved intent; Unknown is incomplete. Baseline/candidate faults remain visible. Every edit, recapture or case change—including edit-and-revert—makes prior results historical. Stop discards the worker; it does not guess how many cases executed. Existing Run output and ghosts stay separate.</p></section>`;
}

interface Observation { document: string; status: string; revision: string; new_execution: boolean; output: string; result?: unknown; diagnostics: unknown[]; usage?: unknown }
interface ReviewCase { id: string; index: number; comparison: string; comparison_reason: string; expectation: string; expected: unknown; before: Observation; after: Observation }
export interface ReviewReport { compiler?: string; revision?: string; status: string; diagnostics: unknown[]; review?: { contract_version: number; phase: string; approval: string; new_execution: boolean; baseline_revision: string; candidate_revision: string | null; suite_hash: string | null; query_key?: string; diagnostic_document?: unknown; cause?: unknown; cases: ReviewCase[]; summary?: { total: number; changed: number; unchanged: number; faulted: number; unknown: number; expectation_pass: number; expectation_fail: number; expectation_error: number; expectation_unknown: number; attempted_invocations: number } } }

export interface ReviewWorkspace {
  read: () => Readonly<Workspace> | undefined;
  replace: (value: Readonly<Workspace>) => void;
  generation: () => number;
}

export interface ScenarioNavigation {
  available: (rawSuite: string, index: number, id: string) => boolean;
  select: (rawSuite: string, index: number, id: string) => boolean;
}

export function setupReview(source: HTMLTextAreaElement, makeWorker: () => Worker, navigation?: ScenarioNavigation): ReviewWorkspace {
  const get = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const put = (id: string, value: string) => { get(id).textContent = value; };
  const suite = get<HTMLTextAreaElement>('review-suite'); const baselineView = get<HTMLTextAreaElement>('review-baseline');
  const run = get<HTMLButtonElement>('review-run'); const stop = get<HTMLButtonElement>('review-stop');
  let baseline: string | undefined; let generation = 0; let serial = 0; let worker: Worker | undefined;
  let deadline: ReturnType<typeof setTimeout>;
  let accepted: { report: ReviewReport; historical: boolean; baseline: string; candidate: string; suite: string; generation: number } | undefined;
  let diagnosticButtons: { button: HTMLButtonElement; current: () => boolean }[] = [];
  let scenarioButtons: { button: HTMLButtonElement; current: () => boolean }[] = [];
  let attentionOnly = false;
  function clearResults() {
    accepted = undefined; attentionOnly = false;
    diagnosticButtons = [];
    scenarioButtons = [];
    for (const id of ['review-json', 'review-identity', 'review-summary']) put(id, '');
    for (const id of ['review-cases', 'review-decisions', 'review-diagnostics', 'review-source-host']) get(id).replaceChildren();
    get('review-filters').hidden = true;
    get('review-filter-all').setAttribute('aria-pressed', 'true');
    get('review-filter-attention').setAttribute('aria-pressed', 'false');
  }
  const downloadSource = get<HTMLButtonElement>('review-download-source');
  const downloadEvidence = get<HTMLButtonElement>('review-download-evidence');
  const downloadReadable = get<HTMLButtonElement>('review-download-readable');
  const downloadPackage = get<HTMLButtonElement>('review-download-package');
  const formatSuite = get<HTMLButtonElement>('review-format-suite');
  const restoreInputs = get<HTMLButtonElement>('workspace-restore-previous');
  let previousInputs: Readonly<Workspace> | undefined;
  function formattedSuite() {
    if (!accepted || accepted.historical || worker || accepted.report.review?.phase !== 'executed' ||
        accepted.suite !== suite.value || accepted.candidate !== source.value || accepted.baseline !== baseline) return;
    // Native executed-phase evidence means all suite/typed inputs passed Rust
    // preflight, including duplicate-member checks. Never format rejected input.
    const formatted = JSON.stringify(JSON.parse(accepted.suite), null, 2);
    if (formatted !== accepted.suite && new TextEncoder().encode(formatted).length <= 65536) return formatted;
  }
  formatSuite.onclick = () => {
    const formatted = formattedSuite();
    if (formatted === undefined) return;
    suite.value = formatted; suite.dispatchEvent(new Event('input')); suite.dispatchEvent(new Event('change'));
  };
  const readWorkspace = () => baseline === undefined ? undefined : Object.freeze({ baseline, candidate: source.value, suite_json: suite.value });
  const replaceWorkspace = (value: Readonly<Workspace>) => {
    previousInputs = readWorkspace();
    invalidate('Workspace replaced'); clearResults();
    put('workspace-recorded', ''); get('workspace-history').hidden = true;
    baseline = value.baseline; baselineView.value = baseline; source.value = value.candidate; suite.value = value.suite_json;
    source.dispatchEvent(new Event('input')); suite.dispatchEvent(new Event('change'));
    put('review-status', 'Workspace opened — no current review. Select Review cases; nothing applied or approved.'); controls();
  };
  restoreInputs.onclick = () => { if (previousInputs) replaceWorkspace(previousInputs); };
  const workspace = setupWorkspace(readWorkspace, replaceWorkspace);
  suite.value = JSON.stringify({ version: 1, target: 'bill', cases: [
    { id: 'nine', args: ['9'], expect: { result: { type: 'Int', value: '900' }, output: '' } },
    { id: 'ten', args: ['10'], expect: { result: { type: 'Int', value: '980' }, output: '' } }
  ] }, null, 2);
  function controls() {
    restoreInputs.disabled = previousInputs === undefined;
    workspace.refresh();
    run.disabled = baseline === undefined || Boolean(worker); stop.disabled = !worker;
    downloadSource.disabled = downloadEvidence.disabled = downloadReadable.disabled = downloadPackage.disabled = !accepted || accepted.historical || Boolean(worker);
    formatSuite.disabled = formattedSuite() === undefined;
    for (const { button, current } of diagnosticButtons) button.disabled = !current();
    for (const { button, current } of scenarioButtons) button.disabled = !current();
  }
  function download(value: string | Blob, name: string, type: string) {
    const url = URL.createObjectURL(new Blob([value], { type }));
    const link = document.createElement('a'); link.href = url; link.download = name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  downloadSource.onclick = () => { if (accepted && !accepted.historical && !worker) download(accepted.candidate, 'candidate.wisp', 'text/plain'); };
  downloadEvidence.onclick = () => {
    if (accepted && !accepted.historical && !worker) download(JSON.stringify({
      format: 'wisp-browser-review-v1', approval: 'not_granted', applied: false,
      baseline: accepted.baseline, candidate: accepted.candidate, suite_json: accepted.suite, report: accepted.report
    }, null, 2), 'policy-review.json', 'application/json');
  };
  downloadReadable.onclick = () => {
    if (accepted && !accepted.historical && !worker) download(readableReview(accepted, document), 'policy-review.html', 'text/html;charset=utf-8');
  };
  downloadPackage.onclick = () => {
    if (!accepted || accepted.historical || worker) return;
    try { download(reviewPackage(accepted, document), 'policy-review.tar', 'application/x-tar'); }
    catch { put('review-status', 'Review package could not be created. No package downloaded; nothing applied or approved.'); }
  };
  function renderStatus() {
    if (!accepted) return;
    const r = accepted.report;
    put('review-status', `${accepted.historical ? 'Historical review — inputs changed' : 'Submitted inputs'} · ${r.status}. Finite cases only; approval not granted.`);
    const title = get('review-source-host').querySelector('summary');
    if (title) title.textContent = `Source changes — ${accepted.historical ? 'Historical review; saved inputs, not live editor' : 'saved submitted inputs'}`;
  }
  function cancel(reason: string) {
    if (!worker) return;
    worker.terminate(); worker = undefined; clearTimeout(deadline); controls();
    put('review-status', `Host interruption — ${reason}. No review accepted; executed-case count unknown. Editor and Run evidence unchanged.`);
  }
  function invalidate(reason: string) {
    generation++;
    const pending = Boolean(worker);
    if (worker) cancel(`${reason}; request cancelled`);
    if (accepted) { accepted.historical = true; renderStatus(); renderCases(); }
    else if (!pending) put('review-status', `${reason}. No current review; nothing approved.`);
    controls();
  }
  function renderDiagnostics(report: ReviewReport) {
    const host = get('review-diagnostics'); host.replaceChildren();
    diagnosticButtons = [];
    const value: unknown = report.diagnostics;
    if (!Array.isArray(value) || value.length === 0) return;
    const owner = report.review?.diagnostic_document;
    const heading = document.createElement('h4'); heading.textContent = 'Native diagnostics (document-owned)';
    const list = document.createElement('ul');
    for (const item of value.slice(0, 20)) {
      const entry = document.createElement('li');
      if (item && typeof item === 'object') {
        const fields = item as Record<string, unknown>;
        const parts = ['code', 'kind', 'message', 'document', 'path'].flatMap(key => typeof fields[key] === 'string' ? [`${key}: ${fields[key]}`] : []);
        const diagnosticDocument = typeof fields.document === 'string' ? fields.document : typeof owner === 'string' ? owner : undefined;
        if (diagnosticDocument && typeof fields.document !== 'string') parts.push(`document: ${diagnosticDocument}`);
        const span = fields.span as { start?: unknown; end?: unknown } | undefined;
        // JSON paths are not source offsets. Candidate remapping can carry a
        // placeholder span; only display its separately owned native cause.
        if (span && !fields.path && ['baseline', 'candidate'].includes(diagnosticDocument ?? '') && Number.isSafeInteger(span.start) && Number.isSafeInteger(span.end)) parts.push(`${diagnosticDocument} source offsets: ${span.start}–${span.end}`);
        const cause = report.review?.cause as { document?: unknown; diagnostic?: { span?: { start?: unknown; end?: unknown } } } | undefined;
        const causeSpan = cause?.diagnostic?.span;
        const causeFields = cause?.diagnostic as Record<string, unknown> | undefined;
        if (causeSpan && cause?.document === owner && ['baseline', 'candidate'].includes(String(owner)) &&
            ['code', 'kind', 'message'].every(key => typeof fields[key] === 'string' && fields[key] === causeFields?.[key]) &&
            Number.isSafeInteger(causeSpan.start) && Number.isSafeInteger(causeSpan.end)) parts.push(`${cause?.document} cause source offsets: ${causeSpan.start}–${causeSpan.end}`);
        entry.textContent = parts.join('\n') || 'Diagnostic details unavailable; inspect full JSON.';
        const held = accepted;
        // Only accepted native preflight source errors own source coordinates.
        // Candidate root spans are remapped placeholders; use the matching cause.
        const review = report.review;
        const record = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
        const ownedCause = record(review?.cause);
        const original = record(ownedCause?.diagnostic);
        const sourceOwner = owner === 'baseline' || owner === 'candidate' ? owner : undefined;
        const owned = sourceOwner && (fields.document === undefined || fields.document === sourceOwner) &&
          (sourceOwner === 'baseline'
            ? fields.path === undefined && review?.cause === undefined
            : fields.path === '/candidate' && ownedCause?.document === 'candidate' && original?.path === undefined &&
              (original?.document === undefined || original.document === 'candidate') &&
              ['code', 'kind', 'message'].every(key => typeof fields[key] === 'string' && fields[key] === original?.[key]));
        const diagnostic = sourceOwner === 'candidate' ? original : fields;
        const sourceSpan = record(diagnostic?.span);
        const text = sourceOwner === 'baseline' ? held?.baseline : held?.candidate;
        const sourceDiagnostic = diagnostic && ['code', 'kind', 'message'].every(key => typeof diagnostic[key] === 'string') &&
          ['Syntax', 'Type', 'Purity'].includes(String(diagnostic.kind));
        const location = text !== undefined && owned && sourceDiagnostic ? diagnosticLocation(text, sourceSpan) : undefined;
        if (held?.report === report && review?.phase === 'preflight' && location && sourceSpan && sourceOwner) {
          const current = () => accepted === held && !held.historical && !worker && generation === held.generation &&
            baseline === held.baseline && baselineView.value === held.baseline && source.value === held.candidate && suite.value === held.suite &&
            diagnosticLocation(held.baseline, { start: 0, end: 0 }) !== undefined && diagnosticLocation(held.candidate, { start: 0, end: 0 }) !== undefined;
          const button = document.createElement('button'); button.type = 'button'; button.className = 'diagnostic-select';
          button.textContent = `Select ${sourceOwner} error (line ${location.line}, bytes ${sourceSpan.start}–${sourceSpan.end})`;
          button.disabled = !current();
          button.onclick = () => {
            if (!current()) return;
            const editor = sourceOwner === 'baseline' ? baselineView : source;
            if (sourceOwner === 'baseline') { const details = baselineView.closest('details'); if (details) details.open = true; }
            editor.focus(); editor.setSelectionRange(location.start, location.end); editor.scrollIntoView({ block: 'center' });
          };
          diagnosticButtons.push({ button, current }); entry.append(button);
        }
      } else entry.textContent = 'Diagnostic details unavailable; inspect full JSON.';
      list.append(entry);
    }
    host.append(heading, list);
    if (value.length > 20) { const note = document.createElement('p'); note.textContent = `Showing 20 of ${value.length} diagnostics (truncated). Full JSON retains all entries.`; host.append(note); }
  }
  function render(report: ReviewReport, snapshot: { baseline: string; candidate: string; suite: string; generation: number }) {
    put('review-json', JSON.stringify(report, null, 2));
    renderDiagnostics(report);
    const review = report.review;
    if (!review) { put('review-status', `${report.status} — request rejected. See native diagnostics; no review accepted; no current review.`); return; }
    const hash = (value: unknown) => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
    const count = review.summary;
    const rows = Array.isArray(review.cases) ? review.cases : [];
    const executedShape = review.phase === 'executed' && review.new_execution === true && hash(review.candidate_revision) && Boolean(count) && rows.length >= 1 && rows.length <= 16 && count?.total === rows.length && count.attempted_invocations === rows.length * 2 &&
      Object.values(count).every(value => Number.isSafeInteger(value) && value >= 0) && count.changed + count.unchanged + count.faulted + count.unknown === count.total && count.expectation_pass + count.expectation_fail + count.expectation_error + count.expectation_unknown === count.total &&
      rows.every(row => row && typeof row.id === 'string' && ['Changed', 'Unchanged', 'Faulted', 'Unknown'].includes(row.comparison) && ['Pass', 'Fail', 'Error', 'Unknown'].includes(row.expectation) && row.before?.document === 'baseline' && row.after?.document === 'candidate' && row.before.revision === review.baseline_revision && row.after.revision === review.candidate_revision && row.before.new_execution === true && row.after.new_execution === true);
    const preflightShape = review.phase === 'preflight' && review.new_execution === false && review.cases?.length === 0 && ['Error', 'Unknown'].includes(report.status);
    if (review.contract_version !== 1 || review.approval !== 'not_granted' || !hash(review.baseline_revision) || !Array.isArray(review.cases) || !['Pass', 'Fail', 'Unknown', 'Error'].includes(report.status) || !(executedShape || preflightShape)) {
      put('review-status', 'Error — unexpected review response. No review accepted.'); return;
    }
    accepted = { report, historical: false, baseline: snapshot.baseline, candidate: snapshot.candidate, suite: snapshot.suite, generation: snapshot.generation }; attentionOnly = false;
    renderDiagnostics(report);
    get('review-source-host').replaceChildren(renderSourceChanges(document, accepted.baseline, accepted.candidate));
    renderStatus(); controls();
    put('review-identity', `baseline ${review.baseline_revision.slice(0, 12)} → candidate ${review.candidate_revision?.slice(0, 12) ?? 'unavailable'} · suite ${review.suite_hash?.slice(0, 12) ?? 'unavailable'} · query ${review.query_key?.slice(0, 12) ?? 'unavailable'}`);
    put('review-summary', count ? `${count.total} cases · ${count.changed} Changed · ${count.unchanged} Unchanged · ${count.faulted} Faulted · ${count.unknown} Unknown · candidate expectations ${count.expectation_pass} Pass / ${count.expectation_fail} Fail / ${count.expectation_error} Error / ${count.expectation_unknown} Unknown · ${count.attempted_invocations} fresh invocations` : 'Preflight rejected — no case invocations executed. Diagnostics retain their document/data-path ownership.');
    renderCases();
  }
  function renderCases() {
    if (!accepted?.report.review) return;
    scenarioButtons = [];
    const held = accepted;
    const review = accepted.report.review;
    const editAction = (row: ReviewCase, index: number) => {
      const id = row.id;
      const available = navigation?.available; const select = navigation?.select;
      const current = () => accepted === held && !held.historical && !worker && generation === held.generation &&
        baseline === held.baseline && baselineView.value === held.baseline && source.value === held.candidate && suite.value === held.suite &&
        review.phase === 'executed' && Number.isSafeInteger(row.index) && row.index === index &&
        available?.(held.suite, index, id) === true;
      if (!current()) return;
      const button = document.createElement('button'); button.type = 'button'; button.className = 'scenario-select';
      button.textContent = `Edit saved scenario ${id}`;
      button.title = 'Selection does not write or run. Editing invalidates results; review separately. Finite Pass is not approval.';
      button.onclick = () => { if (current()) select?.(held.suite, index, id); };
      scenarioButtons.push({ button, current });
      return button;
    };
    // Display only, after native shape validation. Never use live edited inputs,
    // coerce decimal strings, or derive caller requirements from observations.
    let inputs: unknown[] = [];
    try {
      const parsed = review.cases.length ? JSON.parse(accepted.suite) : undefined;
      if (Array.isArray(parsed?.cases) && parsed.cases.length === review.cases.length) inputs = parsed.cases;
    } catch { /* Unmatched display data stays explicitly unavailable. */ }
    const args = (row: ReviewCase, index: number) => {
      const saved = inputs[index] as { id?: unknown; args?: unknown } | undefined;
      return Number.isSafeInteger(row.index) && row.index === index && saved?.id === row.id && Array.isArray(saved.args) ? JSON.stringify(saved.args) : 'unavailable';
    };
    const visible = review.cases.map((row, index) => ({ row, index })).filter(({ row }) => !attentionOnly || row.expectation !== 'Pass' || row.before.status !== 'Complete' || row.after.status !== 'Complete');
    get('review-filters').hidden = review.cases.length === 0;
    get('review-filter-all').setAttribute('aria-pressed', String(!attentionOnly));
    get('review-filter-attention').setAttribute('aria-pressed', String(attentionOnly));
    const table = document.createElement('table'); table.className = 'decision-table';
    const caption = table.createCaption(); caption.textContent = `${accepted.historical ? 'Historical review · ' : ''}Decisions across saved scenarios · ${visible.length} displayed / ${review.cases.length} total · ${attentionOnly ? 'Needs attention' : 'All scenarios'}${attentionOnly && !visible.length ? ' · No scenarios need attention.' : ''}`;
    const header = table.createTHead().insertRow();
    for (const title of ['Scenario / inputs', 'Before observed', 'Proposed observed', 'Owner-required result + output', 'Native status']) { const th = document.createElement('th'); th.scope = 'col'; th.textContent = title; header.append(th); }
    const body = table.createTBody();
    const decision = (observation: Observation) => {
      return `${observation.status}\n${required({ result: observation.result, output: observation.output })}${observation.status !== 'Complete' ? `\nDiagnostics: ${JSON.stringify(observation.diagnostics)}` : ''}`;
    };
    const required = (expected: unknown) => {
      const data = expected as { result?: { type?: string; value?: unknown }; output?: unknown } | undefined;
      const result = data?.result;
      const value = result?.value;
      const resultText = value !== null && typeof value === 'object' && !Array.isArray(value)
        ? Object.entries(value).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join('\n')
        : JSON.stringify(value);
      return `Result (${result?.type ?? 'unavailable'}): ${resultText ?? 'unavailable'}\nOutput: ${typeof data?.output === 'string' ? JSON.stringify(data.output) : 'unavailable'}`;
    };
    for (const { row, index } of visible) {
      const tr = body.insertRow();
      for (const value of [`${row.id}\nInputs: ${args(row, index)}`, decision(row.before), decision(row.after), required(row.expected), `Expectation: ${row.expectation}\nComparison: ${row.comparison}\n${row.comparison_reason}`]) tr.insertCell().textContent = value;
      const nativeStatus = document.createElement('span'); nativeStatus.className = 'native-case-status'; nativeStatus.textContent = tr.cells[4].textContent;
      tr.cells[4].replaceChildren(nativeStatus, renderValueChanges(document, row));
      const action = editAction(row, index); if (action) tr.cells[0].append(action);
    }
    if (scenarioButtons.length) caption.append(' Selection does not write or run; editing invalidates results. Review separately. Finite Pass is not approval.');
    get('review-decisions').replaceChildren(table);
    get('review-cases').replaceChildren(...visible.map(({ row, index }) => {
      const card = document.createElement('details'); card.className = 'review-case';
      const title = document.createElement('summary'); title.textContent = `${row.id} · ${row.comparison} · candidate expectation ${row.expectation}`;
      const note = document.createElement('p'); note.textContent = `Inputs: ${args(row, index)}\nComparison reason: ${row.comparison_reason}. These observations do not authorize applying or deploying a change.`;
      const grid = document.createElement('div'); grid.className = 'review-observations';
      for (const [label, observation] of [['Before / baseline', row.before], ['After / candidate', row.after]] as const) {
        const section = document.createElement('section'); const head = document.createElement('h4'); head.textContent = label;
        const pre = document.createElement('pre'); pre.textContent = JSON.stringify(observation, null, 2); section.append(head, pre); grid.append(section);
      }
      const expected = document.createElement('pre'); expected.className = 'review-expected'; expected.textContent = `Caller-owned expectation\n${JSON.stringify(row.expected, null, 2)}`;
      card.append(title, note, grid, expected, renderValueChanges(document, row));
      const action = editAction(row, index); if (action) card.append(action);
      return card;
    }));
  }
  function start() {
    if (worker || baseline === undefined) return;
    clearResults();
    controls();
    const snapshot = { baseline, candidate: source.value, suite: suite.value, generation };
    if ([snapshot.baseline, snapshot.candidate, snapshot.suite].some(value => new TextEncoder().encode(value).length > 65536)) {
      put('review-status', 'Host limit — each source and suite must fit 64 KiB. No review submitted.'); return;
    }
    // Require exactly one standalone value before embedding raw suite text in
    // the transport envelope. Keep the original bytes so Rust still rejects
    // duplicate members and validates types/schema, without JS coercion.
    try { JSON.parse(snapshot.suite); }
    catch { put('review-status', 'Host input error — suite must be standalone JSON. No review submitted.'); return; }
    const id = ++serial; const current = makeWorker(); worker = current; controls();
    put('review-status', 'Reviewing both revisions in Rust. Nothing applied or approved.');
    deadline = setTimeout(() => cancel('deadline; worker terminated'), 5000);
    const finish = () => { clearTimeout(deadline); current.terminate(); worker = undefined; controls(); };
    current.onerror = () => { if (worker !== current) return; finish(); put('review-status', 'Error — review worker failed. No review accepted.'); };
    current.onmessage = (event: MessageEvent<{ id: number; report?: ReviewReport; error?: string }>) => {
      if (worker !== current || event.data.id !== id) return;
      finish();
      if (generation !== snapshot.generation || baseline !== snapshot.baseline || source.value !== snapshot.candidate || suite.value !== snapshot.suite) {
        put('review-status', 'Historical reply discarded — review inputs changed. No review accepted.'); return;
      }
      if (!event.data.report) { put('review-status', `Error — no review accepted. ${event.data.error ?? 'No report'}`); return; }
      render(event.data.report, snapshot);
    };
    current.postMessage({ id, requestJson: `{"op":"review","source":${JSON.stringify(snapshot.baseline)},"candidate":${JSON.stringify(snapshot.candidate)},"suite":${snapshot.suite}}` });
  }
  source.addEventListener('input', () => invalidate('Candidate source changed'));
  suite.oninput = () => invalidate('Case suite changed');
  suite.addEventListener('change', () => invalidate('Case suite editor refreshed'));
  get<HTMLButtonElement>('review-capture').onclick = () => { invalidate('Baseline recaptured'); baseline = source.value; baselineView.value = baseline; controls(); };
  get<HTMLButtonElement>('review-example').onclick = () => {
    invalidate('Reservation walkthrough loaded'); baseline = beforeExample; baselineView.value = baseline; suite.value = casesExample;
    source.value = afterExample; source.dispatchEvent(new Event('input')); controls();
    const notice = 'Walkthrough loaded: baseline captured, candidate in Code, seven explicit expectations. Select Review cases; this walkthrough has not been submitted.';
    if (accepted) { renderStatus(); put('review-status', `${get('review-status').textContent} ${notice}`); }
    else put('review-status', notice);
  };
  get('review-filter-all').onclick = () => { attentionOnly = false; renderCases(); };
  get('review-filter-attention').onclick = () => { attentionOnly = true; renderCases(); };
  run.onclick = start; stop.onclick = () => cancel('stopped; worker terminated'); controls();
  return { read: readWorkspace, replace: replaceWorkspace, generation: () => generation };
}
