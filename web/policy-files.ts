import type { ReviewWorkspace } from './review';
import { validWorkspace } from './workspace';

export function policyFilesMarkup() {
  return `<section class="workspace-files" aria-labelledby="policy-files-heading">
    <h2 id="policy-files-heading">Open your policy files</h2>
    <p>Select a baseline .wisp and scenario JSON, plus an optional candidate .wisp (defaults to the exact baseline). Open files replaces all current unsaved inputs. Selection alone changes nothing; no cases run on import and nothing is uploaded. Browser draft saving occurs only if you opted in.</p>
    <p>Each file must be at most 64 KiB, valid UTF-8 without a BOM, with LF-only line endings. Sources and scenario text are kept unchanged; Rust validates them when you review.</p>
    <label>Baseline policy (required) <input id="policy-files-baseline" type="file" accept=".wisp,text/plain" required></label>
    <label>Candidate policy (optional) <input id="policy-files-candidate" type="file" accept=".wisp,text/plain"></label>
    <label>Scenario JSON (required) <input id="policy-files-suite" type="file" accept=".json,application/json" required></label>
    <button id="policy-files-open" disabled>Open files — replace unsaved inputs</button>
    <p id="policy-files-status" role="status" aria-live="polite">Select the required files, then explicitly open them. Workspace unchanged.</p>
  </section>`;
}

export function setupPolicyFiles(workspace: ReviewWorkspace) {
  const baseline = document.getElementById('policy-files-baseline') as HTMLInputElement;
  const candidate = document.getElementById('policy-files-candidate') as HTMLInputElement;
  const suite = document.getElementById('policy-files-suite') as HTMLInputElement;
  const open = document.getElementById('policy-files-open') as HTMLButtonElement;
  const status = document.getElementById('policy-files-status')!;
  let selection = 0;
  let pending = false;
  const refresh = () => { open.disabled = pending || !baseline.files?.[0] || !suite.files?.[0]; };
  for (const input of [baseline, candidate, suite]) input.addEventListener('change', () => {
    selection++; pending = false; refresh();
    status.textContent = 'Selection changed. Explicitly open the required files to replace unsaved inputs. Workspace unchanged.';
  });
  open.onclick = async () => {
    const before = baseline.files?.[0]; const after = candidate.files?.[0]; const cases = suite.files?.[0];
    if (pending || !before || !cases) return;
    const token = selection; const generation = workspace.generation();
    pending = true; refresh(); status.textContent = 'Reading selected local files. Workspace unchanged.';
    try {
      const files = after ? [before, cases, after] : [before, cases];
      // Check every size before reading any file. Only browser File handles are
      // read; suite contents are never interpreted as paths or instructions.
      if (files.some(file => file.size > 65536)) throw new Error('File limit');
      const texts = await Promise.all(files.map(async file => {
        const bytes = await file.arrayBuffer();
        if (bytes.byteLength > 65536) throw new Error('File limit');
        // ignoreBOM preserves U+FEFF so we can reject it, never silently strip it.
        const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
        if (text.startsWith('\uFEFF')) throw new Error('BOM unsupported');
        return text;
      }));
      if (token !== selection) return;
      if (generation !== workspace.generation()) {
        status.textContent = 'Workspace changed while reading. Nothing replaced. Select Open files again only if you want to replace current unsaved inputs.';
        return;
      }
      const value = { baseline: texts[0], candidate: texts[2] ?? texts[0], suite_json: texts[1] };
      if (!validWorkspace(value)) throw new Error('Unsupported text');
      workspace.replace(value);
      status.textContent = 'Files opened. No cases executed; no current review, approval or Apply. Download a workspace draft to keep these inputs.';
    } catch {
      if (token === selection) status.textContent = 'Cannot open files: each must be readable UTF-8 without a BOM, at most 64 KiB, with LF-only line endings. Workspace unchanged.';
    } finally {
      if (token === selection) { pending = false; refresh(); }
    }
  };
  refresh();
}
