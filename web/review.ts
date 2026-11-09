import './review.css';
import beforeExample from '../examples/policies/reservations-before.wisp?raw';
import afterExample from '../examples/policies/reservations-after.wisp?raw';
import casesExample from '../examples/policies/cases.json?raw';

export function reviewMarkup() {
  return `<section id="policy-review" class="review-panel"><div class="panel-head"><h3><span class="orange">08</span> Policy change workbench</h3><span class="tag">EXPLICIT CASES · NOT APPROVAL</span></div>
  <p>Capture a baseline, edit the candidate in Code above, then compare explicit typed cases. Rust executes both versions with fresh limits per invocation. No top-level statements or probes run. Expectations are your specification—not automatically repaired.</p>
  <div class="review-controls"><button id="review-capture">Capture editor as baseline</button><button id="review-example">Load reservation walkthrough (replaces editor)</button><button id="review-run" disabled>Review cases</button><button id="review-stop" disabled>Stop review</button></div>
  <details><summary>Captured baseline — unchanged until explicit recapture</summary><label class="sr-only" for="review-baseline">Captured review baseline</label><textarea id="review-baseline" readonly spellcheck="false" placeholder="Capture the editor or load the walkthrough first."></textarea></details>
  <label for="review-suite">Case suite JSON <span>1–16 named cases · 64 KiB · canonical Int strings · exact expected output</span></label><textarea id="review-suite" spellcheck="false"></textarea>
  <p id="review-status" role="status" aria-live="polite">No review. Capture a baseline or load the walkthrough. Nothing is applied or approved.</p><p id="review-identity" class="mono"></p><p id="review-summary" class="mono"></p><div id="review-cases"></div>
  <details><summary>Inspect review JSON and document-owned diagnostics</summary><pre id="review-json"></pre></details>
  <p>Pass means only these candidate examples matched under their limits. Changed is not approved intent; Unknown is incomplete. Baseline/candidate faults remain visible. Every edit, recapture or case change—including edit-and-revert—makes prior results historical. Stop discards the worker; it does not guess how many cases executed. Existing Run output and ghosts stay separate.</p></section>`;
}

interface Observation { document: string; status: string; revision: string; new_execution: boolean; output: string; result?: unknown; diagnostics: unknown[]; usage?: unknown }
interface ReviewCase { id: string; comparison: string; comparison_reason: string; expectation: string; expected: unknown; before: Observation; after: Observation }
interface ReviewReport { status: string; diagnostics: unknown[]; review?: { contract_version: number; phase: string; approval: string; new_execution: boolean; baseline_revision: string; candidate_revision: string | null; suite_hash: string | null; query_key?: string; cases: ReviewCase[]; summary?: { total: number; changed: number; unchanged: number; faulted: number; unknown: number; expectation_pass: number; expectation_fail: number; expectation_error: number; expectation_unknown: number; attempted_invocations: number } } }

export function setupReview(source: HTMLTextAreaElement, makeWorker: () => Worker) {
  const get = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const put = (id: string, value: string) => { get(id).textContent = value; };
  const suite = get<HTMLTextAreaElement>('review-suite'); const baselineView = get<HTMLTextAreaElement>('review-baseline');
  const run = get<HTMLButtonElement>('review-run'); const stop = get<HTMLButtonElement>('review-stop');
  let baseline: string | undefined; let generation = 0; let serial = 0; let worker: Worker | undefined;
  let deadline: ReturnType<typeof setTimeout>;
  let accepted: { report: ReviewReport; historical: boolean } | undefined;
  suite.value = JSON.stringify({ version: 1, target: 'bill', cases: [
    { id: 'nine', args: ['9'], expect: { result: { type: 'Int', value: '900' }, output: '' } },
    { id: 'ten', args: ['10'], expect: { result: { type: 'Int', value: '980' }, output: '' } }
  ] }, null, 2);
  function controls() { run.disabled = baseline === undefined || Boolean(worker); stop.disabled = !worker; }
  function renderStatus() {
    if (!accepted) return;
    const r = accepted.report;
    put('review-status', `${accepted.historical ? 'Historical review — inputs changed' : 'Submitted inputs'} · ${r.status}. Finite cases only; approval not granted.`);
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
    if (accepted) { accepted.historical = true; renderStatus(); }
    else if (!pending) put('review-status', `${reason}. No current review; nothing approved.`);
    controls();
  }
  function render(report: ReviewReport) {
    put('review-json', JSON.stringify(report, null, 2));
    const review = report.review;
    if (!review) { put('review-status', `${report.status} — request rejected. See JSON diagnostics; no review accepted.`); return; }
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
    accepted = { report, historical: false }; renderStatus();
    put('review-identity', `baseline ${review.baseline_revision.slice(0, 12)} → candidate ${review.candidate_revision?.slice(0, 12) ?? 'unavailable'} · suite ${review.suite_hash?.slice(0, 12) ?? 'unavailable'} · query ${review.query_key?.slice(0, 12) ?? 'unavailable'}`);
    put('review-summary', count ? `${count.total} cases · ${count.changed} Changed · ${count.unchanged} Unchanged · ${count.faulted} Faulted · ${count.unknown} Unknown · candidate expectations ${count.expectation_pass} Pass / ${count.expectation_fail} Fail / ${count.expectation_error} Error / ${count.expectation_unknown} Unknown · ${count.attempted_invocations} fresh invocations` : 'Preflight rejected — no case invocations executed. Diagnostics retain their document/data-path ownership.');
    get('review-cases').replaceChildren(...review.cases.map(row => {
      const card = document.createElement('details'); card.className = 'review-case';
      const title = document.createElement('summary'); title.textContent = `${row.id} · ${row.comparison} · candidate expectation ${row.expectation}`;
      const note = document.createElement('p'); note.textContent = `Comparison reason: ${row.comparison_reason}. These observations do not authorize applying or deploying a change.`;
      const grid = document.createElement('div'); grid.className = 'review-observations';
      for (const [label, observation] of [['Before / baseline', row.before], ['After / candidate', row.after]] as const) {
        const section = document.createElement('section'); const head = document.createElement('h4'); head.textContent = label;
        const pre = document.createElement('pre'); pre.textContent = JSON.stringify(observation, null, 2); section.append(head, pre); grid.append(section);
      }
      const expected = document.createElement('pre'); expected.className = 'review-expected'; expected.textContent = `Caller-owned expectation\n${JSON.stringify(row.expected, null, 2)}`;
      card.append(title, note, grid, expected); return card;
    }));
  }
  function start() {
    if (worker || baseline === undefined) return;
    accepted = undefined;
    for (const id of ['review-json', 'review-identity', 'review-summary']) put(id, '');
    get('review-cases').replaceChildren();
    const snapshot = { baseline, candidate: source.value, suite: suite.value, generation };
    if ([snapshot.baseline, snapshot.candidate, snapshot.suite].some(value => new TextEncoder().encode(value).length > 65536)) {
      put('review-status', 'Host limit — each source and suite must fit 64 KiB. No review submitted.'); return;
    }
    // Validate one standalone value, but retain its raw text for Rust duplicate,
    // canonical integer and schema checks. Never rebuild it from JS numbers.
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
      render(event.data.report);
    };
    current.postMessage({ id, requestJson: `{"op":"review","source":${JSON.stringify(snapshot.baseline)},"candidate":${JSON.stringify(snapshot.candidate)},"suite":${snapshot.suite}}` });
  }
  source.addEventListener('input', () => invalidate('Candidate source changed'));
  suite.oninput = () => invalidate('Case suite changed');
  get<HTMLButtonElement>('review-capture').onclick = () => { invalidate('Baseline recaptured'); baseline = source.value; baselineView.value = baseline; controls(); };
  get<HTMLButtonElement>('review-example').onclick = () => {
    invalidate('Reservation walkthrough loaded'); baseline = beforeExample; baselineView.value = baseline; suite.value = casesExample;
    source.value = afterExample; source.dispatchEvent(new Event('input')); controls();
    put('review-status', 'Walkthrough loaded: baseline captured, candidate in Code, seven explicit expectations. Select Review cases; nothing has executed.');
  };
  run.onclick = start; stop.onclick = () => cancel('stopped; worker terminated'); controls();
}
