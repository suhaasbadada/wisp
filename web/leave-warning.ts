import type { ReviewWorkspace } from './review';

/** Conservative input-change warning, not a saved-copy or recovery guarantee. */
export function setupLeaveWarning(workspace: ReviewWorkspace) {
  const initial = workspace.read();
  let listening = false;
  const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
  function refresh() {
    const current = workspace.read();
    const changed = current?.baseline !== initial?.baseline || current?.candidate !== initial?.candidate || current?.suite_json !== initial?.suite_json;
    if (changed === listening) return;
    if (changed) window.addEventListener('beforeunload', warn);
    else window.removeEventListener('beforeunload', warn);
    listening = changed;
  }
  for (const id of ['source', 'review-suite']) {
    document.getElementById(id)!.addEventListener('input', refresh);
    document.getElementById(id)!.addEventListener('change', refresh);
  }
  for (const id of ['review-capture', 'review-example']) document.getElementById(id)!.addEventListener('click', refresh);
}
