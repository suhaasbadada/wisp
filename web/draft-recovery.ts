import { validWorkspace, type Workspace } from './workspace';

const key = 'wisp-browser-draft-v1';
const keys = ['format', 'approval', 'applied', 'baseline', 'candidate', 'suite_json'];
const maxRecordBytes = 1024 * 1024;

function withinRecordLimit(raw: string) {
  return raw.length <= maxRecordBytes && new TextEncoder().encode(raw).length <= maxRecordBytes;
}

function parse(raw: string | null): Workspace | undefined {
  if (raw === null || !withinRecordLimit(raw)) return;
  try {
    const data = JSON.parse(raw);
    if (JSON.stringify(data, null, 2) !== raw || !validWorkspace(data) ||
        Object.keys(data).length !== keys.length || !keys.every(name => Object.hasOwn(data, name)) ||
        data.format !== 'wisp-browser-workspace-v1' || data.approval !== 'not_granted' || data.applied !== false) return;
    return { baseline: data.baseline, candidate: data.candidate, suite_json: data.suite_json };
  } catch { return; }
}

export function draftRecoveryMarkup() {
  return `<fieldset><legend>Optional browser draft recovery</legend>
    <p>Stores complete policy and scenario data unencrypted on this browser, accessible to other users of this browser and scripts on this origin. Do not enable on a shared browser or for sensitive data. Only inputs are kept: no results, review acceptance or approval. Limit: 64 KiB per source/suite and 1 MiB encoded record. No upload; browser storage can be cleared or unavailable. Keep downloaded files for durable copies.</p>
    <label><input id="draft-keep" type="checkbox"> Keep draft on this browser</label>
    <p>Restore explicitly replaces unsaved current inputs, cancels active review and clears current results. A saved record pauses saving until Restore or Forget. Another tab changing browser storage also pauses saving; editors stay unchanged.</p>
    <button id="draft-restore" disabled>Restore saved draft</button>
    <button id="draft-forget" disabled>Forget saved draft</button>
    <p id="draft-status" role="status" aria-live="polite">Browser draft recovery is off. No inputs saved automatically.</p>
  </fieldset>`;
}

export function setupDraftRecovery(read: () => Workspace | undefined, replace: (value: Workspace) => void) {
  const keep = document.getElementById('draft-keep') as HTMLInputElement;
  const restore = document.getElementById('draft-restore') as HTMLButtonElement;
  const forget = document.getElementById('draft-forget') as HTMLButtonElement;
  const status = document.getElementById('draft-status')!;
  let seen: string | null | undefined;
  let pending = false;
  let suspended = false;
  let failedSnapshot: string | undefined;
  const say = (text: string) => { status.textContent = text; };
  function controls() {
    keep.disabled = pending;
    restore.disabled = !parse(seen ?? null);
    forget.disabled = seen === null;
  }
  function failure() {
    say('Browser storage unavailable or draft not saved. No saved-copy guarantee; download a workspace draft instead.');
  }
  function observe(raw: string | null, changed: boolean) {
    seen = raw; pending = raw !== null; keep.checked = false; controls();
    say(raw !== null
      ? `${changed ? 'Browser draft changed in another tab. ' : ''}Saving paused. ${parse(raw) ? 'Saved draft available: Restore replaces current inputs, or Forget removes it.' : 'Saved record is invalid or too large; only Forget is available.'}`
      : `${changed ? 'Browser draft removed in another tab. ' : ''}Browser draft recovery is off. Current inputs unchanged.`);
  }
  // This is a conservative comparison, not atomic compare-and-swap. Web
  // Storage is not transactional; simultaneous writes can still race.
  function unchanged() {
    const raw = window.localStorage.getItem(key);
    if (raw !== seen) { observe(raw, true); return false; }
    return true;
  }
  function refresh() {
    if (suspended || pending || !keep.checked) return;
    const value = read();
    const snapshot = JSON.stringify(value);
    if (snapshot !== undefined && snapshot === failedSnapshot) return;
    failedSnapshot = undefined;
    try {
      if (!unchanged()) return;
      if (!validWorkspace(value)) {
        say('Current inputs not saved: capture a baseline and keep each source/suite within 64 KiB of valid Unicode with LF line endings. Download remains available for valid drafts.');
        return;
      }
      const raw = JSON.stringify({ format: 'wisp-browser-workspace-v1', approval: 'not_granted', applied: false, ...value }, null, 2);
      if (!withinRecordLimit(raw)) {
        say('Current inputs not saved: encoded browser draft exceeds 1 MiB. Download a workspace draft instead.');
        return;
      }
      if (raw !== seen) { window.localStorage.setItem(key, raw); seen = raw; }
      controls(); say('Draft inputs saved on this browser. No results or approval saved.');
    } catch { failedSnapshot = snapshot; failure(); }
  }
  keep.onchange = () => {
    if (keep.checked) { failedSnapshot = undefined; refresh(); }
    else observe(seen ?? null, false);
  };
  restore.onclick = () => {
    try {
      if (!unchanged()) return;
      const value = parse(seen ?? null);
      if (!value) return;
      suspended = true;
      try { replace(value); } finally { suspended = false; }
      pending = false; keep.checked = true; failedSnapshot = undefined; controls(); refresh();
    } catch { failure(); }
  };
  forget.onclick = () => {
    keep.checked = false; pending = seen !== null; controls();
    try {
      // If a missed event changed the record, acknowledge it without deleting;
      // a second explicit click is required to forget that newly observed copy.
      if (!unchanged()) return;
      window.localStorage.removeItem(key);
      observe(null, false);
      say('Saved browser draft forgotten. Recovery is off; current inputs unchanged.');
    } catch { failure(); }
  };
  window.addEventListener('storage', event => {
    if (event.key !== key && event.key !== null) return;
    try {
      if (event.storageArea !== window.localStorage) return;
      observe(window.localStorage.getItem(key), true);
    } catch { keep.checked = false; failure(); }
  });
  try { observe(window.localStorage.getItem(key), false); }
  catch { controls(); failure(); }
  return { refresh };
}
