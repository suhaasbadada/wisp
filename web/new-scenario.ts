// UI transport only. Rust describes declarations; owners supply every value.
import type { ReviewWorkspace } from './review';
import { validWorkspace } from './workspace';

type Type = { kind: 'Int' | 'Bool' | 'String' } | { kind: 'Record'; name: string };
type Member = { name: string; type: Type };
type FunctionShape = { name: string; parameters: Member[]; return_type: Type };
type Value = string | boolean | { [key: string]: Value };
const object = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x);
const keys = (x: unknown, names: string[]): x is Record<string, unknown> => object(x) && Object.keys(x).length === names.length && names.every(n => Object.hasOwn(x, n));
const scalar = (x: unknown): x is string => typeof x === 'string' && !x.includes('\r') && new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(new TextEncoder().encode(x)) === x;
const caseId = (x: unknown): x is string => typeof x === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(x);
function fail(message: string): never { throw new Error(message); }

export function newScenarioMarkup() {
  return `<details id="new-scenario"><summary>Create a scenario from function inputs</summary>
    <p>Starting your own policy? Capture editor as baseline first. This builder never captures or repairs it. Read candidate shapes checks declarations in Rust without running top-level code, probes or cases. Metadata Ready is not a case Pass or approval. Separate reviews may already have made attempts; stopping or replacing inputs does not prove zero prior execution. Unadded form values are not workspace inputs: they are not saved or recovered, and rereading or changing inputs resets them. Select Add to keep a case.</p>
    <button id="scenario-read">Read candidate function shapes</button> <button id="scenario-read-stop" disabled>Stop reading</button>
    <p id="scenario-build-status" role="status" aria-live="polite">No candidate shapes read. This builder has requested no case execution.</p>
    <label>Candidate function <select id="scenario-function" disabled><option value="">Read shapes first</option></select></label>
    <div id="scenario-new-fields" class="scenario-fields"></div>
    <label><input id="scenario-replace" type="checkbox"> Replace existing scenarios</label>
    <p>Unchecked: append only to an exact pretty-printed, supported version 1 suite for the same function (maximum 16 cases). Otherwise explicitly choose replacement. Add keeps both policies unchanged and keeps the previous complete inputs in this tab for Restore previous inputs. It clears review evidence; no cases run.</p>
    <button id="scenario-add" disabled>Add scenario</button>
  </details>`;
}

function metadata(raw: unknown) {
  if (!object(raw) || raw.compiler !== 'wisp-0.1.0-semantics-6' || typeof raw.revision !== 'string' || !/^[a-f0-9]{64}$/.test(raw.revision) || raw.status !== 'Ready' || raw.output !== '' ||
      !Array.isArray(raw.probes) || raw.probes.length !== 0 || !Array.isArray(raw.diagnostics) || raw.diagnostics.length !== 0) fail('Not a supported native Ready description.');
  const report = raw as Record<string, unknown>;
  const api = report.interface;
  if (!keys(api, ['contract_version', 'phase', 'new_execution', 'functions', 'records', 'encodings', 'scope']) || api.contract_version !== 1 || api.phase !== 'described' || api.new_execution !== false ||
      !Array.isArray(api.functions) || !Array.isArray(api.records) || api.functions.length > 2048 || api.records.length > 2048 || typeof api.scope !== 'string') fail('Unsupported native interface.');
  const shape = api as Record<string, unknown>;
  const encoding = shape.encodings;
  const expected = { Int: 'canonical_signed_i64_string', Bool: 'JSON_boolean', String: 'JSON_string', Unit: 'JSON_null', Record: 'exact_field_object' };
  if (!keys(encoding, Object.keys(expected)) || !Object.entries(expected).every(([key, value]) => encoding[key] === value)) fail('Unsupported native value encodings.');
  function type(x: unknown): x is Type {
    return keys(x, ['kind']) && ['Int', 'Bool', 'String'].includes(String(x.kind)) || keys(x, ['kind', 'name']) && x.kind === 'Record' && scalar(x.name) && x.name.length > 0;
  }
  function members(x: unknown): x is Member[] {
    return Array.isArray(x) && x.length <= 2048 && x.every(m => keys(m, ['name', 'type']) && scalar(m.name) && m.name.length > 0 && type(m.type)) && new Set(x.map(m => m.name)).size === x.length;
  }
  const records = new Map<string, Member[]>();
  for (const r of shape.records as unknown[]) {
    if (!keys(r, ['name', 'fields']) || !scalar(r.name) || !r.name || !members(r.fields) || records.has(r.name)) fail('Malformed native record catalog.');
    const record = r as { name: string; fields: Member[] }; records.set(record.name, record.fields);
  }
  const functions: FunctionShape[] = [];
  for (const f of shape.functions as unknown[]) {
    if (!keys(f, ['name', 'parameters', 'return_type']) || !scalar(f.name) || !f.name || !members(f.parameters) || !type(f.return_type) || functions.some(item => item.name === f.name)) fail('Malformed or unsupported native function.');
    functions.push(f as unknown as FunctionShape);
  }
  return { functions, records, revision: report.revision };
}

// Conservative lossless append boundary, not a language/suite validator.
function appendable(raw: string, target: string) {
  const data: unknown = JSON.parse(raw);
  if (JSON.stringify(data, null, 2) !== raw || !keys(data, ['version', 'target', 'cases']) || data.version !== 1 || data.target !== target || !Array.isArray(data.cases) || data.cases.length < 1 || data.cases.length >= 16) fail('Cannot append: use a canonical supported suite for this function with fewer than 16 cases, or explicitly Replace existing scenarios.');
  let count = 1;
  function value(x: unknown, depth = 0): boolean {
    if (++count > 2048) return false;
    return scalar(x) || typeof x === 'boolean' || object(x) && depth < 16 && Object.keys(x).length <= 32 && Object.entries(x).every(([key, item]) => scalar(key) && value(item, depth + 1));
  }
  const suite = data as { version: 1; target: string; cases: { id: string; args: Value[]; expect: { result: { type: string; value: Value }; output: string } }[] };
  if (!suite.cases.every(row => {
    count += 3;
    return keys(row, ['id', 'args', 'expect']) && scalar(row.id) && Array.isArray(row.args) && row.args.every(arg => value(arg)) && keys(row.expect, ['result', 'output']) && scalar(row.expect.output) && keys(row.expect.result, ['type', 'value']) && scalar(row.expect.result.type) && value(row.expect.result.value);
  }) || count > 2048) fail('Cannot append unsupported existing values. Explicit replacement is required.');
  if (!suite.cases.every(row => caseId(row.id)) || new Set(suite.cases.map(row => row.id)).size !== suite.cases.length) fail('Cannot append: existing scenario IDs must be unique, 1–64 ASCII letters, digits, underscores or hyphens. Explicit replacement is required.');
  return suite;
}

export function setupNewScenario(workspace: ReviewWorkspace, source: HTMLTextAreaElement, makeWorker: () => Worker) {
  const get = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const status = get('scenario-build-status'); const read = get<HTMLButtonElement>('scenario-read'); const stop = get<HTMLButtonElement>('scenario-read-stop');
  const add = get<HTMLButtonElement>('scenario-add'); const select = get<HTMLSelectElement>('scenario-function'); const host = get('scenario-new-fields');
  const replace = get<HTMLInputElement>('scenario-replace'); const suite = get<HTMLTextAreaElement>('review-suite');
  let serial = 0; let worker: Worker | undefined; let deadline: ReturnType<typeof setTimeout> | undefined;
  let ready: { api: ReturnType<typeof metadata>; source: string; suite: string; generation: number; serial: number } | undefined;
  let collect: (() => { id: string; args: Value[]; expect: { result: { type: string; value: Value }; output: string } }) | undefined;
  function finish() { worker?.terminate(); worker = undefined; clearTimeout(deadline); stop.disabled = true; read.disabled = false; }
  function invalidate(message = 'Inputs changed. Read candidate shapes again; this builder requested no case execution.') {
    serial++; finish(); ready = undefined; collect = undefined; add.disabled = true; select.disabled = true;
    select.replaceChildren(new Option('Read shapes first', '')); host.replaceChildren(); replace.checked = false; status.textContent = message;
  }
  const fresh = (snapshot: { source: string; suite: string; generation: number; serial: number }) => snapshot.serial === serial && snapshot.generation === workspace.generation() && snapshot.source === source.value && snapshot.suite === suite.value;
  for (const node of [source, suite, get('review-baseline')]) for (const event of ['input', 'change']) node.addEventListener(event, () => invalidate());
  get('review-capture').addEventListener('click', () => invalidate());
  // Actual example replacements dispatch source input and invalidate above.
  // An identical focused-workbench load is a true no-op, including unadded work.
  stop.onclick = () => invalidate('Reading stopped; worker terminated. This builder requested no case execution.');
  read.onclick = () => {
    invalidate('Reading candidate shapes in Rust; no cases execute.');
    const snapshot = { source: source.value, suite: suite.value, generation: workspace.generation(), serial };
    if (!validWorkspace({ baseline: '', candidate: snapshot.source, suite_json: snapshot.suite })) { status.textContent = 'Host input limit: sources and suite must be valid Unicode, LF-only, at most 64 KiB. No shapes read.'; return; }
    const id = serial;
    try {
      const current = makeWorker(); worker = current; read.disabled = true; stop.disabled = false;
      deadline = setTimeout(() => { if (worker === current) invalidate('Host deadline (5 seconds): reading stopped. No shapes accepted; this builder requested no case execution.'); }, 5000);
      current.onerror = () => { if (worker === current) invalidate('Error — shape worker failed. No shapes accepted.'); };
      current.onmessage = async event => {
        if (worker !== current || event.data.id !== id) return;
        finish();
        if (!fresh(snapshot)) { invalidate(); return; }
        try {
          const api = metadata(event.data.report);
          const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(snapshot.source));
          if (!fresh(snapshot)) return;
          const revision = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
          if (api.revision !== revision) fail('Native source revision mismatch.');
          ready = { api, ...snapshot }; select.replaceChildren(new Option('Choose a function', ''));
          api.functions.forEach((f, index) => select.append(new Option(f.name, String(index)))); select.disabled = false;
          status.textContent = 'Metadata Ready — native checked shapes only; new_execution: false. Choose a function and supply inputs and requirements. This builder requested no case execution; not Pass or approval.';
        } catch (error) {
          if (!fresh(snapshot)) return;
          const outcome = ['Error', 'Unknown'].includes(event.data.report?.status) ? `Native ${event.data.report.status} — ` : '';
          invalidate(`${outcome}No usable shapes: ${error instanceof Error ? error.message : 'invalid report'} Native diagnostics: ${JSON.stringify(event.data.report?.diagnostics ?? event.data.error ?? [])}`);
        }
      };
      current.postMessage({ id, requestJson: JSON.stringify({ op: 'describe', source: snapshot.source }) });
    } catch { invalidate('Error — could not start shape worker. No shapes accepted.'); }
  };
  select.onchange = () => {
    add.disabled = true; collect = undefined; host.replaceChildren();
    const binding = ready;
    if (!binding || !fresh(binding)) { invalidate(); return; }
    const fn = binding.api.functions.find((_, index) => String(index) === select.value);
    if (!fn) return;
    try {
      let count = 0; let labelBytes = 0;
      const labelText = (text: string) => {
        labelBytes += new TextEncoder().encode(text).length;
        if (labelBytes > 262144) fail('UI label budget (256 KiB) exceeded; not a policy validity judgment.');
        return text;
      };
      function control(name: string, kind: 'Int' | 'String' | 'Bool') {
        const label = document.createElement('label'); label.append(document.createTextNode(labelText(`${name} (${kind})`)));
        const input = kind === 'Bool' ? document.createElement('select') : kind === 'String' ? document.createElement('textarea') : document.createElement('input');
        if (input instanceof HTMLSelectElement) input.append(new Option('Choose true or false', ''), new Option('true', 'true'), new Option('false', 'false'));
        label.append(input); return { label, input };
      }
      function field(parent: HTMLElement, name: string, type: Type, depth = 0): () => Value {
        if (++count > 2048) fail('UI field limit (2048) exceeded.');
        if (type.kind === 'Record') {
          const fields = binding!.api.records.get(type.name);
          if (!fields || depth >= 16 || fields.length > 32) fail('Unsupported record layout (16 levels / 32 fields maximum).');
          const group = document.createElement('fieldset'); const legend = document.createElement('legend'); legend.textContent = labelText(`${name} (${type.name})`); group.append(legend); parent.append(group);
          const children = fields.map(member => [member.name, field(group, `${name}.${member.name}`, member.type, depth + 1)] as const);
          return () => Object.fromEntries(children.map(([key, readValue]) => [key, readValue()]));
        }
        const { label, input } = control(name, type.kind); parent.append(label);
        return () => {
          if (type.kind === 'Bool') { if (!['true', 'false'].includes(input.value)) fail(`Choose true or false for ${name}.`); return input.value === 'true'; }
          if (!scalar(input.value)) fail(`Use valid Unicode with LF line endings for ${name}.`);
          return input.value;
        };
      }
      const id = control('New scenario ID', 'String'); host.append(id.label);
      let index = 1; try { const ids = JSON.parse(suite.value).cases.map((row: { id: string }) => row.id); while (ids.includes(`case-${index}`)) index++; } catch { /* scaffold only */ }
      id.input.value = `case-${index}`;
      const args = fn.parameters.map(member => field(host, `Input ${member.name}`, member.type));
      const resultType = fn.return_type.kind === 'Record' ? fn.return_type.name : fn.return_type.kind;
      const typeLabel = document.createElement('label'); typeLabel.textContent = 'Required result type (from Rust)'; const typeInput = document.createElement('input'); typeInput.readOnly = true; typeInput.value = resultType; typeLabel.append(typeInput); host.append(typeLabel);
      const result = field(host, 'Required result', fn.return_type);
      const output = control('Required output — empty means explicitly require no output', 'String'); host.append(output.label);
      collect = () => {
        if (!caseId(id.input.value)) fail('Scenario ID must be 1–64 ASCII letters, digits, underscores or hyphens.');
        if (!scalar(output.input.value)) fail('Required output must be valid Unicode and LF text.');
        return { id: id.input.value, args: args.map(readValue => readValue()), expect: { result: { type: resultType, value: result() }, output: output.input.value } };
      };
      add.disabled = false;
    } catch (error) { collect = undefined; host.replaceChildren(); status.textContent = `No usable form: ${error instanceof Error ? error.message : 'unsupported shape'} This builder requested no case execution.`; }
  };
  add.onclick = () => {
    const binding = ready;
    if (!binding || !fresh(binding)) { invalidate(); return; }
    try {
      const original = workspace.read();
      if (!original) fail('Capture editor as baseline first. This builder does not capture it for you.');
      if (!validWorkspace(original) || original.candidate !== binding.source || original.suite_json !== binding.suite) fail('Workspace unavailable or changed. No inputs written.');
      if (!collect) fail('Choose a supported function first.');
      const fn = binding.api.functions.find((_, index) => String(index) === select.value);
      if (!fn) fail('Choose a supported function first.');
      const row = collect!();
      const data = replace.checked ? { version: 1, target: fn!.name, cases: [row] } : appendable(original.suite_json, fn!.name);
      if (!replace.checked) { if (data.cases.some(item => item.id === row.id)) fail('Scenario ID already exists. Choose a unique ID.'); data.cases.push(row); }
      const next = { ...original, suite_json: JSON.stringify(data, null, 2) };
      if (!validWorkspace(next)) fail('Result exceeds 64 KiB or is not valid Unicode/LF text. Inputs unchanged.');
      const latest = workspace.read();
      if (!fresh(binding) || !latest || latest.baseline !== original.baseline || latest.candidate !== original.candidate || latest.suite_json !== original.suite_json) { invalidate(); return; }
      workspace.replace(next);
      invalidate('Scenario added; both policies unchanged. Previous inputs kept in this tab. This builder requested no case execution. Read shapes again to add another, or Review cases for native validation and finite results. Not approval.');
    } catch (error) { status.textContent = `Cannot add scenario: ${error instanceof Error ? error.message : 'invalid input'} No inputs written; this builder requested no case execution.`; }
  };
}
