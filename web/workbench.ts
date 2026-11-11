import { reviewMarkup, setupReview } from './review';
import { policyFilesMarkup, setupPolicyFiles } from './policy-files';
import './workbench.css';
import exampleSuite from '../examples/policies/cases.json?raw';

export function workbenchMarkup() {
  return `<div class="wrap product-workbench">
    <div class="eyebrow">WISP POLICY WORKBENCH · LOCAL / NO ACCOUNT</div>
    <h1>Change a rule.<br>See the consequences.</h1>
    <p class="intro">Check reservation decisions before you ship a policy change.</p>
    <p>The sample fixes pack rounding and expired stock. Seven saved scenarios cover boundaries and rejection rules. Edit the candidate, compare decisions, then download your code and review. Nothing is uploaded or automatically saved.</p>
    <ol class="workbench-steps"><li>Edit the proposed policy</li><li>Review saved scenarios</li><li>Download code + evidence</li></ol>
    ${policyFilesMarkup()}
    <section class="code-panel"><div class="panel-head"><h2>1. Proposed policy</h2><span>Wisp source · editable</span></div>
    <label class="sr-only" for="source">Proposed policy source</label><textarea id="source" spellcheck="false"></textarea></section>
    ${reviewMarkup()}
    <p>New to the example? Expand a case to compare the old decision, proposed decision and required result. To use your own policy, paste its source, capture it as the baseline, then edit the candidate and supply its case suite. <a href="?playground#playground">Open the full language playground</a>.</p>
  </div>`;
}

export function setupWorkbench() {
  const source = document.querySelector<HTMLTextAreaElement>('#source')!;
  const workspace = setupReview(source, () => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }));
  setupPolicyFiles(workspace);
  document.getElementById('review-example')!.click();
  const suite = document.querySelector<HTMLTextAreaElement>('#review-suite')!;
  const editor = document.createElement('div'); editor.id = 'scenario-editor';
  const details = document.createElement('details');
  const summary = document.createElement('summary'); summary.textContent = 'Advanced: edit or replace the complete case suite JSON';
  const label = document.querySelector<HTMLLabelElement>('label[for="review-suite"]')!;
  label.before(editor, details); details.append(summary, label, suite);
  function scenarios() {
    editor.replaceChildren();
    const heading = document.createElement('h3'); heading.textContent = '2. Saved scenarios and required decisions'; editor.append(heading);
    const note = document.createElement('p'); note.textContent = 'Inputs and requirements are yours. Changing them invalidates the review; requirements are never repaired automatically. Time values use the same integer unit.'; editor.append(note);
    try {
      const parsed: unknown = JSON.parse(suite.value);
      // Only expose a form when serialization preserves every byte of the
      // supplied representation. This excludes duplicate members and prevents
      // a form edit from silently repairing a Rust-rejected raw suite.
      if (JSON.stringify(parsed, null, 2) !== suite.value) throw new Error('Raw suite');
      // This form edits only the reservation example schema. Arbitrary suites
      // remain raw text for Rust validation, never coerced into this form.
      const data = parsed as { target: string; cases: { id: string; args: Record<string, string>[]; expect: { result: { type: string; value: { accepted: boolean; packs: string; reason: string } }; output: string } }[] };
      if (data.target !== 'decide' || !Array.isArray(data.cases) || data.cases.length > 16 || !data.cases.every(row =>
        typeof row.id === 'string' && row.args?.length === 2 &&
        ['quantity', 'pack_size', 'expires_at'].every(key => typeof row.args[0]?.[key] === 'string') &&
        ['available', 'now'].every(key => typeof row.args[1]?.[key] === 'string') &&
        row.expect?.result?.type === 'Decision' && typeof row.expect.result.value?.accepted === 'boolean' &&
        typeof row.expect.result.value.packs === 'string' && typeof row.expect.result.value.reason === 'string')) throw new Error('Custom suite');
      let snapshot = suite.value;
      for (const row of data.cases) {
        const card = document.createElement('details'); card.className = 'scenario-card';
        const title = document.createElement('summary'); title.textContent = row.id; card.append(title);
        const fields = document.createElement('div'); fields.className = 'scenario-fields'; card.append(fields);
        const field = (name: string, value: string | boolean, update: (value: string | boolean) => void) => {
          const label = document.createElement('label'); label.append(document.createTextNode(`${name} `));
          const input = document.createElement('input'); input.type = typeof value === 'boolean' ? 'checkbox' : 'text';
          if (typeof value === 'boolean') input.checked = value; else input.value = value;
          input.addEventListener('input', () => {
            if (suite.value !== snapshot) { scenarios(); return; }
            update(input.type === 'checkbox' ? input.checked : input.value);
            snapshot = JSON.stringify(data, null, 2); suite.value = snapshot; suite.dispatchEvent(new Event('input'));
          });
          label.append(input); fields.append(label);
        };
        for (const [index, keys] of [[0, ['quantity', 'pack_size', 'expires_at']], [1, ['available', 'now']]] as const)
          for (const key of keys) field(key.replaceAll('_', ' '), row.args[index][key], value => { row.args[index][key] = String(value); });
        field('Required: accepted', row.expect.result.value.accepted, value => { row.expect.result.value.accepted = Boolean(value); });
        field('Required: packs', row.expect.result.value.packs, value => { row.expect.result.value.packs = String(value); });
        field('Required: reason', row.expect.result.value.reason, value => { row.expect.result.value.reason = String(value); });
        editor.append(card);
      }
    } catch {
      const message = document.createElement('p'); message.textContent = 'Custom or incomplete suite: use the complete JSON editor below. Rust validates it when you review.'; editor.append(message); details.open = true;
    }
  }
  function loadedExample() {
    // Only the bundled, explicitly loaded fixture may be formatted here.
    if (suite.value === exampleSuite) suite.value = JSON.stringify(JSON.parse(exampleSuite), null, 2);
    scenarios();
  }
  loadedExample(); suite.addEventListener('change', scenarios);
  document.getElementById('review-example')!.addEventListener('click', loadedExample);
}
