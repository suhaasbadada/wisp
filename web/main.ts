import './style.css';
import snacks from '../examples/snacks.wisp?raw';
import repaired from '../examples/snacks-repaired.wisp?raw';
import inventory from '../examples/inventory.wisp?raw';
import language from '../Docs/Language.md?raw';
import protocol from '../Docs/Protocol.md?raw';

const base = import.meta.env.BASE_URL;
const repo = 'https://github.com/suhaasbadada/wisp';
const isDocs = /\/documentation\/?(?:index\.html)?$/.test(location.pathname);
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <a class="skip" href="#main">Skip to content</a>
  <header class="nav"><a class="brand" href="${base}" aria-label="Wisp home"><span class="mark" aria-hidden="true">w<span>·</span></span> wisp</a>
    <nav aria-label="Main"><a href="${base}#playground">Playground</a><a href="${base}documentation/" ${isDocs ? 'aria-current="page"' : ''}>Documentation</a><a href="${repo}">GitHub <span aria-hidden="true">↗</span></a></nav>
    <span class="experimental"><span aria-hidden="true">●</span> Experimental / v0.1</span>
  </header>
  <main id="main">${isDocs ? docsMarkup() : homeMarkup()}</main>
  <footer><a class="brand" href="${base}">wisp<span class="orange">.</span></a><span>A small language. A visible trail of evidence.</span><a href="${repo}/tree/main/Docs">Engineering notes ↗</a><span>Experimental · License pending</span></footer>`;

function homeMarkup() {
  return `<section class="hero wrap"><div class="eyebrow"><span class="dash"></span> AN EXPERIMENT IN AGENT-FIRST PROGRAMMING</div>
    <div class="hero-grid"><div><h1>Built for agents.<br><span>By agents.</span></h1><p class="intro">Small functions. Concrete counterexamples.<br>Context you can inspect—not just trust.</p>
      <p class="subintro">Wisp pairs a statically typed language with finite probes and revision-aware evidence. Start with a broken snack bill. Find the ghost. Try a repair.</p>
      <div class="hero-actions"><a class="button primary" href="#playground">Try the playground <span aria-hidden="true">↘</span></a><a class="text-link" href="${base}documentation/">Read the agent protocol ↗</a></div></div>
      <aside class="specimen" aria-label="Example counterexample"><div class="specimen-head"><span>01 / GOBLIN SNACK BUREAU</span><span class="dot"></span></div><pre><span class="muted">// More snacks. A smaller bill?</span>
<span class="code-accent">probe</span> n in 1..=11 {
  bill(n + 1) &gt;= bill(n)
}</pre><div class="witness"><span class="ghost-icon" aria-hidden="true">↳</span><div><strong>Meet your first ghost.</strong><p>n = 9 · bill(9) = 900 · bill(10) = 800</p></div><span class="tag fail">FAIL</span></div><p class="specimen-foot">A concrete failing input. Not a guess at your intent.</p></aside></div>
    <div class="principles"><span><b>01</b> One Rust core, native + WASM</span><span><b>02</b> Local execution, no API key</span><span><b>03</b> Finite evidence, not proof</span></div></section>
    <section class="play-section" id="playground"><div class="wrap"><div class="section-head"><div><div class="eyebrow">THE FIRST PLAYABLE</div><h2>Break a rule. Keep the evidence.</h2></div><p>Edit real Wisp. Run the shared compiler in your browser.<br>No server. No hidden JavaScript interpreter.</p></div>
      <div class="toolbar"><label>Example <select id="example"><option value="snacks">Goblin Snack Bureau</option><option value="repaired">Snack Bureau — proposed repair</option><option value="inventory">Inventory reorder</option></select></label><div class="run-actions"><span id="activity" role="status">Local WASM worker</span><button id="stop" disabled>Stop</button><button class="primary" id="run">Run <span aria-hidden="true">↗</span></button></div></div>
      <div class="workspace"><section class="code-panel"><div class="panel-head"><h3><span class="orange">01</span> Code</h3><span>snacks.wisp · editable</span></div><label class="sr-only" for="source">Wisp source</label><textarea id="source" spellcheck="false" autocapitalize="off" autocomplete="off" aria-describedby="editor-hint"></textarea><div class="editor-foot" id="editor-hint">Ctrl/⌘ + Enter to run · Int / Bool / String · no host IO</div><div id="diagnostics" role="status" aria-live="polite"></div></section>
        <section class="result-panel"><div class="panel-head"><h3><span class="orange">02</span> Output</h3><span class="tag" id="run-status">NOT RUN</span></div><pre id="output" tabindex="0">The bureau is open. Run the program.</pre><div class="panel-head evidence-head"><h3><span class="orange">03</span> Evidence</h3><span id="revision" class="mono">No execution yet</span></div><div id="evidence"><p class="empty">A probe checks a declared finite domain. A failure leaves a replayable ghost here.</p></div></section></div>
      <section class="agent-panel"><div class="panel-head"><h3><span class="orange">04</span> Agent View <span class="tag">COMPILER-DERIVED</span></h3><div class="agent-controls"><label>Focus <select id="focus" aria-label="Agent View function"><option>bill</option></select></label><label>Text budget <input id="budget" type="number" min="0" max="65536" value="4096" aria-label="Agent View byte budget"> bytes</label></div></div><div class="agent-grid"><pre id="agent-text" tabindex="0">Compiler facts will appear after analysis.</pre><div><p id="agent-budget" class="mono"></p><strong>What is left out?</strong><ul id="omissions"></ul><p class="muted">Syntactic call dependencies, not a guaranteed task-relevant or complete context. The byte budget covers the text field, not this UI or JSON metadata.</p><details><summary>Inspect compiler graph / JSON</summary><pre id="graph"></pre></details></div></div></section>
      <p class="limit-note">Bounded execution: 64 KiB source · 100k expression fuel · 32 calls · 1,000 probe inputs · 8 KiB output. Stop terminates the worker. Logical allocation accounting is not an absolute browser-memory guarantee. <a href="${base}documentation/">Full limits & protocol ↗</a></p>
    </div></section>
    <section class="wrap story"><div><div class="eyebrow">A LANGUAGE WITH RECEIPTS</div><h2>Make uncertainty<br>part of the interface.</h2></div><div class="story-cards"><article><span>01 / OBSERVED</span><h3>A ghost is an input.</h3><p>Keep a failure attached to its source revision. Replay it on new code as a new execution—not a rewritten history.</p></article><article><span>02 / COMPILER-DERIVED</span><h3>A graph is a map.</h3><p>Inspect function bodies and dependency signatures. See omissions and budget overflow. A map is not proof of complete context.</p></article><article><span>03 / STILL A HYPOTHESIS</span><h3>Earn the claims.</h3><p>No speed, token or memory superiority is claimed. No solver yet. No production-readiness promise. Just a small, working experiment.</p></article></div></section>`;
}

function docsMarkup() {
  return `<section class="wrap docs"><div class="eyebrow">DOCUMENTATION / FIRST PLAYABLE</div><h1>One language.<br><span>Two ways in.</span></h1><div class="docs-heading"><p class="intro">A precise contract for agents. A guided path for humans.</p><div class="mode-toggle" role="group" aria-label="Documentation mode"><button id="agent-mode" aria-pressed="true">Agent</button><button id="human-mode" aria-pressed="false">Human</button></div></div><p id="mode-note" class="muted"></p>
    <div id="agent-docs"><div class="docs-callout"><strong>WISP / AGENT CONTRACT v0.1</strong><p>Permissions: none. Core cannot execute host code or access filesystem/network. Provenance: graph = compiler-derived; finite probe outcomes = observed; user intent = unknown. No solver or proved state.</p><a href="${base}Docs/Language.md">Raw language contract ↗</a> · <a href="${base}Docs/Protocol.md">Raw JSON protocol ↗</a></div>
      <h2>Runnable request</h2><pre id="request-example"></pre><h2>Grammar, errors & limits</h2><pre class="contract" id="language-contract"></pre><h2>Machine interface & evidence identity</h2><pre class="contract" id="protocol-contract"></pre></div>
    <div id="human-docs" hidden><article class="tutorial"><h2>Your first ghost</h2><p>The Goblin Snack Bureau gives bulk discounts. But its first formula accidentally makes ten snacks cheaper than nine. A finite probe asks whether each next bill is at least as large.</p><pre id="tutorial-source"></pre><ol><li>Open the <a href="${base}#playground">playground</a> and run “Goblin Snack Bureau”. Output is <code>900</code>.</li><li>The probe stops at <code>n = 9</code>. Nine snacks cost 900; ten cost 800. This concrete failure is the ghost.</li><li>Replace <code>snacks * 80</code> with <code>900 + (snacks - 9) * 80</code>, or select the proposed repair example. Your pricing requirement has not been changed.</li><li>Replay the old ghost: that input now passes. Then run the full probe: all 11 declared adjacent comparisons pass. Neither result is a universal proof, nor a guarantee that this is the price you wanted.</li></ol><h2>Read evidence, not reassurance</h2><p>Clear means all inputs in the declared finite domain completed true. Fail means an observed counterexample. Unknown means a limit or interruption prevented completion. Error means an invalid program or a runtime fault. Historical evidence stays historical after an edit; matching dependency keys do not create a new execution.</p><h2>Understand the boundary</h2><p>Functions declare Int, Bool or String inputs and outputs. There are no classes, mutable variables, loops, records or host permissions yet. Agent View exposes the focused body and transitive dependency signatures; other bodies and top-level statements are explicitly omitted. The graph is metadata, not the runtime.</p><p>Run natively with <code>cargo run -- examples/snacks.wisp</code>. See the Agent mode for the exact shared JSON API, syntax and resource limits.</p></article></div>
    <section class="engineering"><h2>Engineering notebook</h2><p>The source of truth lives in <code>Docs/</code>. Behavior changes require documentation changes.</p><div class="doc-links">${['Scope', 'Architecture', 'Language', 'Protocol', 'Scope-changes', 'Testing', 'Roadmap', 'Contributing'].map(name => `<a href="${base}Docs/${name}.md">${name.replace('-', ' ')} ↗</a>`).join('')}<a href="${base}Docs/Decisions/0001-first-playable.md">ADR 0001 ↗</a></div><p>Research direction, not a novelty claim: compiler-accounted boundaries with property-specific assumptions/unknowns and inspectable omissions. Prior art includes Sley, Zerolang and Unison. Benchmarks and adoption remain unmeasured.</p></section></section>`;
}

function el<T extends HTMLElement = HTMLElement>(id: string) { return document.getElementById(id) as T; }
function text(id: string, value: string) { el(id).textContent = value; }

if (isDocs) {
  text('language-contract', language);
  text('protocol-contract', protocol);
  text('tutorial-source', snacks);
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
} else {
  setupPlayground();
}

interface Diagnostic { kind: string; message: string; span: { start: number; end: number } }
interface Ghost { revision: string; predicate_key: string; dependency_key: string; input: string; witness_id: string }
interface Probe { status: string; completed_cases: number; domain: { start: string; end: string }; failing_input: string | null; dependency_key: string; predicate_key: string; ghost: Ghost | null; claim: string; diagnostic: Diagnostic | null }
interface Report { revision: string; compiler: string; status: string; output: string; diagnostics: Diagnostic[]; probes: Probe[]; probe_metadata?: { predicate_key: string; dependency_key: string }[]; limits: unknown; graph: { functions: { name: string }[] }; agent_view?: { focus: string | null; text: string; overflow: boolean; used_bytes: number; required_bytes: number; omitted: string[] }; replay?: { status: string; input: string; new_execution: boolean; diagnostic: Diagnostic | null } }
interface Receipt { ghost: Ghost; source: string; replay?: { revision: string; status: string } }

function setupPlayground() {
  const source = el<HTMLTextAreaElement>('source'); source.value = snacks;
  const run = el<HTMLButtonElement>('run'); const stop = el<HTMLButtonElement>('stop');
  const focus = el<HTMLSelectElement>('focus'); const budget = el<HTMLInputElement>('budget');
  let serial = 0; let analysisWorker: Worker | undefined; let runWorker: Worker | undefined;
  let analysisTimer: ReturnType<typeof setTimeout>; let runDeadline: ReturnType<typeof setTimeout>;
  let latestAnalysis: Report | undefined; let lastRun: Report | undefined; let executedSource = '';
  const receipts: Receipt[] = []; // Immutable receipts live for this page session; no silent persistence or authentication claim.
  let busy = false;
  const makeWorker = () => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  function renderDiagnostics(report: Report, submitted: string) {
    const messages = report.diagnostics.concat(report.probes.flatMap(p => p.diagnostic ? [p.diagnostic] : []));
    if (!messages.length) { text('diagnostics', 'Checked by Rust · no source diagnostics'); return; }
    text('diagnostics', messages.map(d => {
      // Spans are byte offsets, not JavaScript UTF-16 offsets.
      const before = new TextDecoder().decode(new TextEncoder().encode(submitted).slice(0, d.span.start));
      const lines = before.split('\n');
      return `${d.kind} · ${lines.length}:${Array.from(lines.at(-1) ?? '').length + 1} · ${d.message}`;
    }).join('\n'));
  }
  function renderAgent(report: Report) {
    const names = report.graph.functions.map(f => f.name); const selected = focus.value;
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
      const note = document.createElement('p'); note.textContent = receipt.replay ? `New replay: ${receipt.replay.status} on ${receipt.replay.revision.slice(0, 10)}. A passing replay is not a Clear probe.` : 'Historical failing input. Kept unchanged when source changes. Receipts are local, not authenticated.'; card.append(note);
      const replay = document.createElement('button'); replay.textContent = `Replay input ${receipt.ghost.input}`; replay.disabled = busy; replay.onclick = () => execute(receipt); card.append(replay);
      const oldSource = document.createElement('details'); const summary = document.createElement('summary'); summary.textContent = 'Historical source / receipt'; const pre = document.createElement('pre'); pre.textContent = `${receipt.source}\n\n${JSON.stringify(receipt.ghost, null, 2)}`; oldSource.append(summary, pre); card.append(oldSource); container.append(card);
    }
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
  function setBusy(value: boolean) { busy = value; run.disabled = value; stop.disabled = !value; renderEvidence(); }
  function cancel(reason: string) {
    if (!runWorker) return;
    runWorker.terminate(); runWorker = undefined; clearTimeout(runDeadline); setBusy(false);
    text('run-status', 'UNKNOWN'); text('activity', reason); text('output', 'Unknown — execution interrupted. No result from this execution is counted as passing. Previous evidence, if any, remains historical.');
  }
  function execute(receipt?: Receipt) {
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
      if (receipt) receipt.replay = { revision: report.revision, status: report.replay?.status ?? report.status };
      else {
        lastRun = report; executedSource = submitted;
        for (const p of report.probes) if (p.ghost && !receipts.some(r => r.ghost.witness_id === p.ghost!.witness_id)) receipts.push({ ghost: p.ghost, source: submitted });
      }
      setBusy(false); text('run-status', (report.replay?.status ?? report.status).toUpperCase());
      text('output', receipt ? `Replay input ${receipt.ghost.input}: ${report.replay?.status ?? report.status}. New execution on ${report.revision.slice(0, 10)}. Not a full-domain probe.\n${report.replay?.diagnostic?.message ?? report.diagnostics.map(d => d.message).join('\n')}` : report.output || '(No captured output)');
      text('activity', `Local execution finished${submitted !== source.value ? ' · historical source' : ''}`);
      if (submitted === source.value) { renderDiagnostics(report, submitted); renderAgent(report); }
      renderEvidence();
    };
    worker.postMessage({ id, request: { op: receipt ? 'replay' : 'run', source: submitted, ...(receipt ? { ghost: receipt.ghost } : {}), ...(focus.value ? { focus: focus.value } : {}), budget: Math.max(0, Math.min(65536, Number(budget.value) || 0)) } });
  }
  run.onclick = () => execute(); stop.onclick = () => cancel('Stopped: worker terminated');
  source.oninput = () => { latestAnalysis = undefined; analysisWorker?.terminate(); renderEvidence(); text('diagnostics', 'Checking current source…'); text('agent-text', 'Source changed. Previous compiler facts are not current.'); clearTimeout(analysisTimer); analysisTimer = setTimeout(analyze, 250); };
  source.onkeydown = event => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && !busy) { event.preventDefault(); execute(); } };
  focus.onchange = analyze; budget.oninput = analyze;
  el<HTMLSelectElement>('example').onchange = event => { const key = (event.target as HTMLSelectElement).value; source.value = ({ snacks, repaired, inventory } as Record<string, string>)[key]; source.dispatchEvent(new Event('input')); };
  analyze();
}
