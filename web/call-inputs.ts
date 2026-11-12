import { fixedPackage } from './fixed-package';
import { jsonInputLocation } from './json-input-location';

const encoder = new TextEncoder();
const cap = 65_536;
const compiler = 'wisp-0.1.0-semantics-7';
const identifier = /^[A-Za-z_][A-Za-z0-9_]*$/;
// JS `$` can also match before a final line terminator. Require the full match.
const safeTarget = (value: string) => identifier.exec(value)?.[0] === value;
const readyText = 'Inputs Ready — types only; function/top-level/probes NOT executed; not success/approval. Separate earlier attempts may already exist.';

export function callInputsMarkup(): string {
  return `<details id="call-inputs"><summary>Open, check or reproduce function inputs</summary>
    <p id="call-input-privacy">Selecting alone does not read, replace or run inputs. Load replaces current JSON arguments only, not source or target. Nothing is uploaded or automatically run. Saving is off unless explicitly enabled elsewhere. Local JSON files: max 64 KiB, UTF-8 without BOM, LF only.</p>
    <label for="call-input-file">JSON inputs file <input id="call-input-file" type="file" accept=".json,application/json" aria-describedby="call-input-privacy"></label>
    <div class="run-actions"><button id="call-input-load">Load inputs</button><button id="call-input-check">Check input shapes</button><button id="call-input-stop" disabled>Stop input work</button></div>
    <p id="call-input-status" role="status" aria-live="polite">No input shape check. Invoke remains a separate execution action.</p>
    <p>Download includes full source and data in plaintext. Inspect before sharing. Recorded validation is not fresh execution success or approval. No compiler or executable is included.</p>
    <button id="call-input-download" disabled>Download runnable inputs package</button>
    <details><summary>Native input validation / diagnostics</summary><pre id="call-input-report" tabindex="0"></pre></details>
    <div id="call-input-locations" aria-label="JSON input diagnostic navigation"></div>
  </details>`;
}

interface Snapshot { source: string; args: string; target: string; generation: number; deadline: number }
type NativeReport = Record<string, unknown>;
interface Accepted { snapshot: Snapshot; report: NativeReport }

function checkedText(text: string, label: string): void {
  if (encoder.encode(text).length > cap) throw new Error(`${label} exceeds 64 KiB`);
  if (text.startsWith('\uFEFF')) throw new Error(`${label}: UTF-8 BOM is not supported`);
  if (text.includes('\r')) throw new Error(`${label}: LF only; CR is not supported`);
  if (new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(encoder.encode(text)) !== text) throw new Error(`${label}: invalid Unicode`);
}
function argumentCount(raw: string): number {
  checkedText(raw, 'Arguments');
  // Syntax/root shape only. Never use the parsed value to construct a request,
  // calculate the raw fragment hash, replace the editor, or export data.
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error('Arguments must be a standalone JSON array');
  return parsed.length;
}
async function sha256(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', encoder.encode(text));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}
function record(value: unknown): value is NativeReport { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function nativeReady(report: NativeReport, snapshot: Snapshot, revision: string, hash: string, count: number): boolean {
  const marker = report.input_validation;
  return report.status === 'Ready' && report.compiler === compiler && report.revision === revision && /^[a-f0-9]{64}$/.test(revision)
    && report.output === '' && Array.isArray(report.probes) && report.probes.length === 0
    && Array.isArray(report.diagnostics) && report.diagnostics.length === 0
    && report.new_execution !== true
    && ['result', 'usage', 'invocation', 'execution_key', '__encoded_call_value'].every(key => !(key in report))
    && record(marker) && marker.contract_version === 1 && marker.phase === 'validated' && marker.new_execution === false
    && marker.target === snapshot.target && marker.argument_count === count && marker.argument_hash === hash
    && Object.keys(marker).length === 6;
}

function nativePreflight(report: NativeReport, snapshot: Snapshot, revision: string): boolean {
  const marker = report.input_validation;
  return (report.status === 'Error' || report.status === 'Unknown') && report.compiler === compiler
    && report.revision === revision && /^[a-f0-9]{64}$/.test(revision)
    && report.output === '' && Array.isArray(report.probes) && report.probes.length === 0
    && Array.isArray(report.diagnostics) && report.diagnostics.every(d => record(d)
      && typeof d.kind === 'string' && typeof d.message === 'string' && typeof d.code === 'string')
    && (!('new_execution' in report) || report.new_execution === false)
    && ['result', 'usage', 'invocation', 'execution_key', '__encoded_call_value'].every(key => !(key in report))
    && record(marker) && marker.contract_version === 1 && marker.phase === 'preflight'
    && marker.new_execution === false && marker.target === snapshot.target && Object.keys(marker).length === 4;
}

function instructions(target: string): string {
  if (!safeTarget(target)) throw new Error('Unsupported target identifier');
  return `Wisp function inputs package

Full source and data are plaintext. Inspect all files before sharing or use.
Extract only into a new empty directory, never over existing sensitive files.
Nothing auto-executes. No compiler, executable or script is included.

Use a TRUSTED installed Wisp compiler matching the exact compiler identity in
input-validation.json. That identity is plain data, not an installation command.
From the new directory these commands make separate, fresh attempts:

wisp validate program.wisp ${target} --args-file args.json
wisp call program.wisp ${target} --args-file args.json

Exit codes: 0 Complete/Ready; 1 Error; 3 Unknown; 2 host/usage failure.
Ready means input types only: function, top-level statements and probes were NOT
executed. Recorded validation is not fresh execution success or approval.
Even a fresh Complete is one observed execution, not proof or approval.

program.wisp and args.json contain the exact submitted UTF-8 source and full raw
arguments (including surrounding whitespace). input-validation.json is complete
native nonexecution metadata, not an invocation result. Its argument_hash covers
the retained JSON value fragment: internal whitespace included, surrounding JSON
separator whitespace excluded. It is not the full args.json file digest.
Archive metadata is fixed for reproducibility, not timestamp authentication.
`;
}

/** Independent read-only work: never owns Invoke, output or invocation history. */
export function setupCallInputs(source: HTMLTextAreaElement, args: HTMLTextAreaElement, target: HTMLSelectElement, makeWorker: () => Worker): void {
  const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const file = element<HTMLInputElement>('call-input-file');
  const load = element<HTMLButtonElement>('call-input-load');
  const check = element<HTMLButtonElement>('call-input-check');
  const stop = element<HTMLButtonElement>('call-input-stop');
  const download = element<HTMLButtonElement>('call-input-download');
  const status = element<HTMLElement>('call-input-status');
  const evidence = element<HTMLElement>('call-input-report');
  const locations = element<HTMLElement>('call-input-locations');
  let generation = 0;
  let serial = 0;
  let reader: FileReader | undefined;
  let worker: Worker | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let accepted: Accepted | undefined;
  let navigation: Accepted | undefined;
  let active = false;
  const snapshot = (): Snapshot => ({ source: source.value, args: args.value, target: target.value, generation, deadline: performance.now() + 5000 });
  const current = (s: Snapshot) => s.generation === generation && s.source === source.value && s.args === args.value && s.target === target.value;
  function controls() { load.disabled = active; check.disabled = active; stop.disabled = !active && !accepted && !navigation; download.disabled = !accepted || !current(accepted.snapshot); }
  function finish() {
    clearTimeout(timer); timer = undefined;
    const old = reader; reader = undefined;
    if (old) { old.onload = old.onerror = old.onabort = null; if (old.readyState === FileReader.LOADING) old.abort(); }
    worker?.terminate(); worker = undefined;
    active = false; controls();
  }
  function invalidate(message: string) {
    generation++; accepted = undefined; navigation = undefined; locations.replaceChildren(); finish(); evidence.textContent = ''; status.textContent = message;
  }
  function timely(s: Snapshot): boolean {
    if (performance.now() < s.deadline) return true;
    invalidate('Input work deadline (5 seconds); cancelled. No inputs replaced or validation accepted.');
    return false;
  }
  function fail(message: string) { accepted = undefined; navigation = undefined; locations.replaceChildren(); finish(); status.textContent = `No accepted input validation — ${message}. Not executed by this input work.`; }
  function locate(report: NativeReport, s: Snapshot) {
    const binding: Accepted = { snapshot: s, report };
    for (const diagnostic of report.diagnostics as NativeReport[]) {
      if (!['Input', 'Limit'].includes(String(diagnostic.kind)) || typeof diagnostic.path !== 'string') continue;
      const range = jsonInputLocation(s.args, diagnostic.path);
      if (!current(s) || !timely(s)) return;
      if (!range) continue;
      navigation = binding;
      const row = document.createElement('p');
      const description = document.createElement('span');
      description.textContent = `${diagnostic.path}: ${String(diagnostic.message)}${typeof diagnostic.code === 'string' ? ` [${diagnostic.code}]` : ''} `;
      const button = document.createElement('button'); button.textContent = 'Select JSON input value';
      button.onclick = () => {
        if (navigation !== binding || active || !current(s) || args.value !== s.args) return;
        args.focus(); args.setSelectionRange(range.start, range.end);
      };
      row.append(description, button); locations.append(row);
    }
    controls();
  }
  function begin(): Snapshot {
    invalidate('Input work pending; no accepted validation.'); active = true; controls();
    timer = setTimeout(() => invalidate('Input work deadline (5 seconds); cancelled. No inputs replaced or validation accepted.'), 5000);
    return snapshot();
  }
  for (const owner of [source, args, target]) {
    for (const event of ['input', 'change']) owner.addEventListener(event, () => invalidate('Inputs changed; check input shapes again. Prior validation is not current.'));
  }
  file.addEventListener('change', () => {
    invalidate(file.files?.[0] ? `Selected ${file.files[0].name}. Not read. Load replaces JSON arguments only; no upload or automatic run.` : 'No file selected. Current inputs unchanged.');
  });
  stop.onclick = () => invalidate('Input work stopped. No new validation accepted. Separate invocation/run work is unaffected.');
  load.onclick = () => {
    const selected = file.files?.[0];
    if (!selected) { status.textContent = 'Choose a JSON file first. Current inputs unchanged.'; return; }
    const s = begin();
    if (selected.size > cap) { fail('File exceeds 64 KiB; current inputs unchanged'); return; }
    try {
      const pending = new FileReader(); reader = pending;
      pending.onerror = () => { if (reader === pending && current(s)) fail('File read failed; current inputs unchanged'); };
      pending.onabort = () => { if (reader === pending && current(s)) fail('File read aborted; current inputs unchanged'); };
      pending.onload = () => {
        if (reader !== pending || !current(s) || file.files?.[0] !== selected || !timely(s)) return;
        try {
          if (!(pending.result instanceof ArrayBuffer) || pending.result.byteLength > cap) throw new Error('Invalid or oversized file read');
          const bytes = new Uint8Array(pending.result);
          const raw = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
          argumentCount(raw);
          const encoded = encoder.encode(raw);
          if (encoded.length !== bytes.length || !encoded.every((byte, index) => byte === bytes[index])) throw new Error('UTF-8 roundtrip failed');
          if (!current(s) || !timely(s)) return;
          finish(); args.value = raw; args.dispatchEvent(new Event('input', { bubbles: true }));
          status.textContent = 'Loaded exact raw JSON arguments only. Source and target unchanged. Not checked or executed; select Check input shapes explicitly.';
        } catch (error) { fail(`File rejected: ${String(error)}; current inputs unchanged`); }
      };
      pending.readAsArrayBuffer(selected);
    } catch (error) { fail(`File read failed: ${String(error)}; current inputs unchanged`); }
  };
  check.onclick = () => {
    const s = begin(); const id = ++serial;
    try {
      checkedText(s.source, 'Source'); const count = argumentCount(s.args);
      if (!safeTarget(s.target)) throw new Error('Target must be an ASCII function identifier');
      const pending = makeWorker(); worker = pending;
       const live = () => worker === pending && active && current(s) && timely(s);
      pending.onerror = () => { if (live()) fail('Validation worker failed'); };
      // Chromium exposes the event but not an onmessageerror property on Worker.
      pending.addEventListener('messageerror', () => { if (live()) fail('Validation worker message failed'); });
      pending.onmessage = async (event: MessageEvent<{ id: number; report?: unknown; error?: unknown }>) => {
        if (!live() || event.data.id !== id) return;
        const report = event.data.report;
        if (!record(report)) { fail('Validation worker returned no report'); return; }
        // A second response cannot supersede the immutable first native report.
        pending.onmessage = null; pending.terminate();
        evidence.textContent = JSON.stringify(report, null, 2);
        try {
          if (report.status !== 'Ready') {
            const diagnostics = Array.isArray(report.diagnostics) ? report.diagnostics.filter(record).map(d => `${String(d.kind)} ${typeof d.path === 'string' ? d.path : 'source'}: ${String(d.message)}${typeof d.code === 'string' ? ` [${d.code}]` : ''}`).join('\n') : '';
            const revision = await sha256(s.source);
            if (!live()) return;
            const supported = nativePreflight(report, s, revision);
            fail(`${report.status === 'Unknown' ? 'Unknown' : 'Error'} — ${diagnostics || 'no input Ready metadata'}${supported ? '' : '; unsupported native preflight metadata'}`);
            if (supported) locate(report, s);
            return;
          }
          // RawValue excludes only JSON separator whitespace around the value.
          const [revision, hash] = await Promise.all([sha256(s.source), sha256(s.args.replace(/^[\x20\x09\x0a\x0d]+|[\x20\x09\x0a\x0d]+$/g, ''))]);
          if (!live()) return;
          if (!nativeReady(report, s, revision, hash, count)) { fail('Unsupported or inconsistent native Ready metadata'); return; }
          accepted = { snapshot: s, report }; finish(); status.textContent = readyText;
        } catch { if (live()) fail('Validation identity digest failed'); }
      };
      const requestJson = `{"op":"validate-call","source":${JSON.stringify(s.source)},"function":${JSON.stringify(s.target)},"args":${s.args}}`;
      pending.postMessage({ id, requestJson });
    } catch (error) { fail(String(error)); }
  };
  download.onclick = () => {
    const saved = accepted;
    if (!saved || !current(saved.snapshot) || active) { invalidate('No current Inputs Ready metadata; check input shapes first.'); return; }
    try {
      const blob = fixedPackage([
        ['program.wisp', saved.snapshot.source], ['args.json', saved.snapshot.args],
        ['input-validation.json', JSON.stringify(saved.report, null, 2)], ['README.txt', instructions(saved.snapshot.target)]
      ]);
      const url = URL.createObjectURL(blob);
      try {
        const link = document.createElement('a'); link.href = url; link.download = 'function-inputs.tar'; link.click();
      } finally { setTimeout(() => URL.revokeObjectURL(url), 0); }
    } catch (error) { status.textContent = `Package download failed: ${String(error)}`; }
  };
  controls();
}
