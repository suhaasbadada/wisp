import type { ReviewWorkspace } from './review';
import { validWorkspace, type Workspace } from './workspace';

const key = 'wisp-browser-library-v1';
const limit = 2 * 1024 * 1024;
interface Entry { name: string; workspace: Workspace }
const bytes = (text: string) => new TextEncoder().encode(text).length;
const bounded = (raw: string) => raw.length <= limit && bytes(raw) <= limit;
const objectKeys = (value: unknown, keys: string[]): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === keys.length && keys.every(name => Object.hasOwn(value, name));
function validName(name: unknown): name is string {
  if (typeof name !== 'string' || name.trim() !== name || !name.length || /[\u0000-\u001f\u007f]/u.test(name) || bytes(name) > 80) return false;
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(new TextEncoder().encode(name)) === name;
}
function parse(raw: string | null): Entry[] | undefined {
  if (raw === null) return [];
  if (!bounded(raw)) return;
  try {
    const value: unknown = JSON.parse(raw);
    if (JSON.stringify(value) !== raw || !objectKeys(value, ['format', 'approval', 'applied', 'entries']) ||
        value.format !== key || value.approval !== 'not_granted' || value.applied !== false ||
        !Array.isArray(value.entries) || value.entries.length > 8) return;
    const entries: Entry[] = [];
    for (const entry of value.entries) {
      if (!objectKeys(entry, ['name', 'workspace']) || !validName(entry.name) ||
          !objectKeys(entry.workspace, ['baseline', 'candidate', 'suite_json']) || !validWorkspace(entry.workspace) ||
          entries.some(other => other.name === entry.name)) return;
      entries.push({ name: entry.name, workspace: { baseline: entry.workspace.baseline, candidate: entry.workspace.candidate, suite_json: entry.workspace.suite_json } });
    }
    return entries;
  } catch { return; }
}
const encode = (entries: Entry[]) => JSON.stringify({ format: key, approval: 'not_granted', applied: false, entries });
const same = (a: Readonly<Workspace> | undefined, b: Readonly<Workspace>) =>
  a?.baseline === b.baseline && a.candidate === b.candidate && a.suite_json === b.suite_json;

export function workspaceLibraryMarkup() {
  return `<details class="workspace-files" id="workspace-library"><summary>Named workspaces on this browser</summary>
    <p>Optional, explicit saved copies, separate from automatic draft recovery. No save on edit or open on selection. Only the three inputs are saved, never evidence, approval, previous inputs or unadded forms. Saved copies are not validation; select Review cases for fresh native finite-case evidence.</p>
    <p>Up to 8 exact, case-sensitive names (1–80 UTF-8 bytes; no surrounding whitespace or control characters). Each input: at most 64 KiB, scalar Unicode, LF only. Entire encoded library: at most 2 MiB; escaped text can allow fewer than 8 workspaces. No automatic eviction.</p>
    <label>Workspace name <input id="library-name" type="text" autocomplete="off"></label>
    <label><input id="library-overwrite" type="checkbox"> Replace existing saved name</label>
    <p>Saving stores entire policies and scenario data UNENCRYPTED on this browser origin, accessible to other browser users and scripts. Do not use for sensitive data or on a shared browser. Browser storage can vanish; this is not cloud backup. Keep downloaded files. Selecting Save is consent for this copy only, not automatic draft saving.</p>
    <button id="library-save">Save current workspace</button>
    <label>Saved workspace <select id="library-select"><option value="">Select a saved name</option></select></label>
    <p id="library-preview">No saved name selected. Inputs unchanged.</p>
    <button id="library-open" disabled>Open selected workspace (replaces all three inputs)</button>
    <p>Opening different inputs keeps the previous complete inputs in this tab, cancels active review and clears evidence and imported history. This action requests no case execution; prior reviews may already have attempted cases. Opening identical inputs changes nothing.</p>
    <label><input id="library-delete-confirm" type="checkbox"> Confirm deletion of selected saved workspace</label>
    <button id="library-delete" disabled>Delete selected saved workspace</button>
    <button id="library-refresh">Refresh saved names</button>
    <label><input id="library-forget-confirm" type="checkbox"> Confirm irreversible data deletion of the entire named library</label>
    <button id="library-forget" disabled>Forget entire named library</button>
    <p id="library-status" role="status" aria-live="polite"></p>
  </details>`;
}

export function setupWorkspaceLibrary(workspace: ReviewWorkspace) {
  const input = (id: string) => document.getElementById(`library-${id}`) as HTMLInputElement;
  const button = (id: string) => document.getElementById(`library-${id}`) as HTMLButtonElement;
  const select = document.getElementById('library-select') as HTMLSelectElement;
  const status = document.getElementById('library-status')!;
  const preview = document.getElementById('library-preview')!;
  const name = input('name');
  const overwrite = input('overwrite'); const deletion = input('delete-confirm'); const forget = input('forget-confirm');
  let overwriteName: string | undefined;
  let seen: string | null | undefined;
  let entries: Entry[] | undefined;
  let paused = true; let epoch = 0;
  let staged: { index: number; name: string; raw: string | null; epoch: number } | undefined;
  const say = (text: string) => { status.textContent = text; };
  function permissions() { overwrite.checked = false; overwriteName = undefined; deletion.checked = false; forget.checked = false; }
  overwrite.onchange = () => { overwriteName = overwrite.checked ? name.value : undefined; };
  name.addEventListener('input', () => { overwrite.checked = false; overwriteName = undefined; });
  function controls() {
    button('save').disabled = paused || !entries;
    select.disabled = paused || !entries;
    button('open').disabled = paused || !staged;
    button('delete').disabled = paused || !staged;
    button('forget').disabled = paused || seen === null || seen === undefined;
    for (const check of [overwrite, deletion, forget]) check.disabled = paused;
  }
  function pause(message: string) {
    paused = true; epoch++; staged = undefined; select.value = ''; permissions(); controls();
    preview.textContent = 'Selection invalidated. Inputs unchanged.'; say(message);
  }
  function failure() { pause('Browser storage unavailable or update unverified. No saved-copy guarantee; download a workspace draft instead. Refresh saved names before another action.'); }
  // Conservative version comparison, NOT atomic compare-and-swap. Web Storage
  // is synchronous but nontransactional; simultaneous writers can still race.
  function unchanged() {
    if (paused || seen === undefined) return false;
    if (window.localStorage.getItem(key) !== seen) {
      pause('Named library changed. Refresh saved names required; no action taken. Current inputs unchanged.'); return false;
    }
    return true;
  }
  function selected() {
    if (!entries || !staged || staged.epoch !== epoch || staged.raw !== seen ||
        select.value !== String(staged.index) || entries[staged.index]?.name !== staged.name) return;
    return entries[staged.index];
  }
  function render(preferred?: string) {
    select.replaceChildren(new Option('Select a saved name', ''));
    entries?.forEach((entry, index) => select.add(new Option(entry.name, String(index))));
    staged = undefined; preview.textContent = 'No saved name selected. Inputs unchanged.';
    const token = epoch;
    select.onchange = () => {
      if (token !== epoch || paused) return;
      permissions(); staged = undefined;
      const index = entries?.findIndex((_, index) => String(index) === select.value) ?? -1;
      const entry = entries?.[index];
      if (entry) {
        staged = { index, name: entry.name, raw: seen!, epoch };
        preview.textContent = `Saved input bytes: baseline ${bytes(entry.workspace.baseline)}, candidate ${bytes(entry.workspace.candidate)}, scenarios ${bytes(entry.workspace.suite_json)}. Selection changes no inputs.`;
      } else preview.textContent = 'No saved name selected. Inputs unchanged.';
      controls();
    };
    const index = entries?.findIndex(entry => entry.name === preferred) ?? -1;
    if (index >= 0) { select.value = String(index); select.onchange(new Event('change')); }
    bindActions(token); controls();
  }
  function updated(raw: string | null, message: string, preferred?: string) {
    seen = raw; entries = parse(raw); paused = false; epoch++; permissions(); render(preferred); say(message);
  }
  function write(raw: string | null, message: string, preferred?: string) {
    if (!unchanged()) return;
    if (raw === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, raw);
    if (window.localStorage.getItem(key) !== raw) { failure(); return; }
    updated(raw, message, preferred);
  }
  function bindActions(token: number) {
    button('save').onclick = () => {
      const consent = overwrite.checked && overwriteName === name.value; permissions();
      if (token !== epoch || paused || !entries) return;
      try {
        const generation = workspace.generation(); const current = workspace.read();
        if (!validName(name.value) || !validWorkspace(current)) { say('Cannot save: use a valid exact name and three inputs within 64 KiB each, scalar Unicode and LF only. Inputs unchanged.'); return; }
        const savedName = name.value;
        const value = { baseline: current.baseline, candidate: current.candidate, suite_json: current.suite_json };
        if (!unchanged()) return;
        const index = entries.findIndex(entry => entry.name === savedName);
        if (index >= 0 && same(entries[index].workspace, value)) { say('Identical inputs already saved under this name. No storage, inputs, evidence or previous inputs changed.'); return; }
        if (index >= 0 && !consent) { say('Name already exists with different inputs. Check Replace existing saved name to explicitly overwrite it. Nothing saved.'); return; }
        if (index < 0 && entries.length >= 8) { say('Library full: 8 names maximum. Nothing evicted or saved; delete a saved name explicitly or download instead.'); return; }
        const next = entries.slice(); const entry = { name: savedName, workspace: value };
        if (index < 0) next.push(entry); else next[index] = entry;
        const raw = encode(next);
        if (!bounded(raw)) { say('Encoded library would exceed 2 MiB. Nothing saved or evicted; download instead.'); return; }
        if (workspace.generation() !== generation || !same(workspace.read(), value)) { say('Current inputs changed. Nothing saved; select Save again for the inputs you want.'); return; }
        write(raw, 'Workspace inputs saved on this browser. No evidence or approval saved; keep downloaded files.', savedName);
      } catch { failure(); }
    };
    button('open').onclick = () => {
      permissions(); if (token !== epoch || paused) return;
      try {
        const entry = selected(); if (!entry || !unchanged()) return;
        // Revalidate the complete stored shape, not just a selected partial copy.
        const checked = parse(seen ?? null)?.[staged!.index];
        if (!checked || checked.name !== entry.name || !same(checked.workspace, entry.workspace)) { failure(); return; }
        if (!unchanged()) return;
        if (same(workspace.read(), checked.workspace)) { say('Identical workspace already open. Inputs, evidence and previous inputs unchanged. This action requested no case execution.'); return; }
        workspace.replace(checked.workspace);
        say('Workspace opened; previous complete inputs kept in this tab. Evidence and imported history cleared. No cases executed by this action. Select Review cases for fresh native results; nothing applied or approved.');
      } catch { failure(); }
    };
    button('delete').onclick = () => {
      const consent = deletion.checked; permissions(); if (token !== epoch || paused) return;
      try {
        const entry = selected(); if (!entry || !unchanged()) return;
        if (!consent) { say('Confirm deletion of the selected saved workspace first. Nothing deleted.'); return; }
        write(encode(entries!.filter(other => other.name !== entry.name)), 'Selected saved workspace deleted. Current inputs, evidence and previous inputs unchanged.');
      } catch { failure(); }
    };
    button('forget').onclick = () => {
      const consent = forget.checked; permissions(); if (token !== epoch || paused) return;
      try {
        if (!unchanged()) return;
        if (!consent) { say('Confirm irreversible deletion of the entire named library first. Nothing deleted.'); return; }
        write(null, 'Entire named library forgotten. Other browser keys, current inputs, evidence and previous inputs unchanged.');
      } catch { failure(); }
    };
  }
  function refresh() {
    const preferred = selected()?.name;
    permissions(); staged = undefined;
    try {
      const raw = window.localStorage.getItem(key);
      updated(raw, parse(raw) ? 'Saved names refreshed. Select a name to preview; open explicitly. No inputs changed or case execution requested.' : 'Named library invalid or too large. No partial loading or saving allowed. Only confirmed Forget entire named library can remove it.', preferred);
    } catch { failure(); }
  }
  button('refresh').onclick = refresh;
  window.addEventListener('storage', event => {
    if (event.key === key || event.key === null) pause('Named library may have changed in another tab. Refresh saved names required. Current inputs unchanged.');
  });
  refresh();
}
