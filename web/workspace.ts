import { draftRecoveryMarkup, setupDraftRecovery } from './draft-recovery';

export interface Workspace { baseline: string; candidate: string; suite_json: string }

export function workspaceMarkup() {
  return `<details class="workspace-files"><summary>Save or reopen your workspace</summary>
    <p>Download a draft before closing the tab, even without a passing review. Files include both full policies and scenario data. Nothing is uploaded. Automatic browser draft saving is off unless explicitly enabled below.</p>
    <button id="workspace-save" disabled>Download workspace draft</button>
    <label>Open downloaded workspace or review <input id="workspace-file" type="file" accept=".json,application/json"></label>
    <button id="workspace-replace" disabled>Replace current workspace with opened file</button>
    <button id="workspace-restore-previous" disabled>Restore previous inputs (replaces current)</button>
    <p>Opening files, a workspace or browser recovery keeps one previous complete set of inputs in this tab only, including its captured baseline. Restore replaces all current inputs, clears review results and keeps the replaced inputs so you can switch back, including edits since opening. This is not edit undo; without a captured baseline there is no complete workspace to keep. The previous-input buffer is not exported or browser-saved and is lost on reload or close. Download the workspace you want to keep. If browser saving is enabled, it saves the current restored inputs, not the previous buffer.</p>
    <p id="workspace-status" role="status" aria-live="polite">No file opened. Import is limited to 8 MiB; each source and suite is limited to 64 KiB.</p>
    <details id="workspace-history" hidden><summary>Imported review — historical, unverified, not current acceptance</summary><pre id="workspace-recorded"></pre></details>
    ${draftRecoveryMarkup()}
  </details>`;
}

export function validWorkspace(value: unknown): value is Workspace & Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  return ['baseline', 'candidate', 'suite_json'].every(key => {
    const text = (value as Record<string, unknown>)[key];
    // Textarea setters normalize CR/CRLF. Reject these representations rather
    // than silently changing accepted source/suite bytes during restoration.
    if (typeof text !== 'string' || text.includes('\r')) return false;
    const bytes = new TextEncoder().encode(text);
    return bytes.length <= 65536 && new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes) === text;
  });
}

export function setupWorkspace(read: () => Workspace | undefined, replace: (value: Workspace) => void) {
  const fileInput = document.getElementById('workspace-file') as HTMLInputElement;
  const open = document.getElementById('workspace-replace') as HTMLButtonElement;
  const save = document.getElementById('workspace-save') as HTMLButtonElement;
  const status = document.getElementById('workspace-status')!;
  let selection = 0;
  let staged: { workspace: Workspace; history: string } | undefined;
  save.onclick = () => {
    const value = read();
    if (!validWorkspace(value)) { status.textContent = 'Cannot download draft: capture a baseline and keep each source/suite within 64 KiB of valid Unicode with LF line endings. Inputs unchanged.'; return; }
    const text = JSON.stringify({ format: 'wisp-browser-workspace-v1', approval: 'not_granted', applied: false, ...value }, null, 2);
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'policy-workspace.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = 'Workspace download requested. Keep the file to reopen your draft; it is not a review or approval.';
  };
  fileInput.onchange = async () => {
    const current = ++selection; staged = undefined; open.disabled = true;
    const file = fileInput.files?.[0];
    if (!file) { status.textContent = 'No file selected. Workspace unchanged.'; return; }
    status.textContent = 'Reading local file. Workspace unchanged.';
    try {
      if (file.size > 8 * 1024 * 1024) throw new Error('File limit');
      const raw = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
      if (current !== selection) return;
      const data = JSON.parse(raw);
      // Accept our lossless export representation, not duplicate-member JSON
      // that JSON.parse would silently normalize. Suite text stays opaque.
      if (JSON.stringify(data, null, 2) !== raw.trim() || !validWorkspace(data)) throw new Error('Shape');
      const reviewed = data.format === 'wisp-browser-review-v1';
      const keys = ['format', 'approval', 'applied', 'baseline', 'candidate', 'suite_json', ...(reviewed ? ['report'] : [])];
      if ((!reviewed && data.format !== 'wisp-browser-workspace-v1') || Object.keys(data).length !== keys.length ||
          !keys.every(key => Object.hasOwn(data, key)) || data.approval !== 'not_granted' || data.applied !== false ||
          (reviewed && (data.report === null || typeof data.report !== 'object' || Array.isArray(data.report)))) throw new Error('Envelope');
      staged = { workspace: { baseline: data.baseline, candidate: data.candidate, suite_json: data.suite_json }, history: reviewed ? JSON.stringify(data.report, null, 2) : '' };
      open.disabled = false;
      status.textContent = 'File ready. Replacing will discard current unsaved inputs. Imported reviews are unverified history; rerun cases for current results.';
    } catch {
      if (current === selection) status.textContent = 'Cannot open file: use an unmodified workbench export within the size limits, valid UTF-8 and LF-only source/suite line endings. Workspace unchanged.';
    } finally {
      if (current === selection) fileInput.value = '';
    }
  };
  open.onclick = () => {
    if (!staged) return;
    replace(staged.workspace);
    document.getElementById('workspace-recorded')!.textContent = staged.history;
    document.getElementById('workspace-history')!.hidden = !staged.history;
    status.textContent = 'Workspace opened. No cases executed. Imported review, if present, is unverified history. Select Review cases for fresh results.';
    staged = undefined; open.disabled = true;
  };
  const recovery = setupDraftRecovery(read, value => {
    replace(value);
    document.getElementById('workspace-recorded')!.textContent = '';
    document.getElementById('workspace-history')!.hidden = true;
  });
  return { refresh: () => { save.disabled = read() === undefined; recovery.refresh(); } };
}
