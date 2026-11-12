import { reviewMarkup, setupReview } from './review';
import { policyFilesMarkup, setupPolicyFiles } from './policy-files';
import { setupScenarioEditor } from './scenarios';
import { setupLeaveWarning } from './leave-warning';
import { newScenarioMarkup, setupNewScenario } from './new-scenario';
import './workbench.css';
import exampleSuite from '../examples/policies/cases.json?raw';
import expenseBaseline from '../examples/policies/expenses-before.wisp?raw';
import expenseCandidate from '../examples/policies/expenses-after.wisp?raw';
import expenseSuite from '../examples/policies/expenses-cases.json?raw';

export function workbenchMarkup() {
  return `<div class="wrap product-workbench">
    <div class="eyebrow">WISP POLICY WORKBENCH · LOCAL / NO ACCOUNT</div>
    <h1>Change a rule.<br>See the consequences.</h1>
    <p class="intro">Compare policy decisions before you ship a rule change.</p>
    <nav class="workbench-actions" aria-label="Policy workbench actions"><div id="workbench-review-actions"></div><a href="#source">Policy</a><a href="#scenario-editor">Scenarios</a><a href="#review-status">Results</a></nav>
    <p>The sample fixes pack rounding and expired stock. Seven saved scenarios cover boundaries and rejection rules. Edit the candidate, compare decisions, then download your code and review. Nothing is uploaded. Browser draft saving is off unless you opt in under Save or reopen your workspace. Browsers may warn before leaving with changed inputs; this does not save them.</p>
    <p>Alternate illustration: expense reimbursement in whole cents. Owner requirements: reject negative amounts, allow amounts up to 10000 cents inclusive, and require a receipt only above 2500 cents. The candidate fixes two boundary mistakes. This is not finance, tax or company advice or approval.</p>
    <button id="workbench-expense">Load expense walkthrough (replaces all three inputs)</button>
    <p>This explicit action replaces baseline, proposed policy and scenarios, keeping the previous complete inputs in this tab for Restore previous inputs under Save or reopen your workspace. It does not run cases or grant approval.</p>
    <p id="workbench-expense-status" role="status" aria-live="polite"></p>
    <ol class="workbench-steps"><li>Edit the proposed policy</li><li>Review saved scenarios</li><li>Download code + evidence</li></ol>
    ${policyFilesMarkup()}
    <section class="code-panel"><div class="panel-head"><h2>1. Proposed policy</h2><span>Wisp source · editable</span></div>
    <label class="sr-only" for="source">Proposed policy source</label><textarea id="source" spellcheck="false"></textarea></section>
    ${reviewMarkup()}
    ${newScenarioMarkup()}
    <p>New to the example? Expand a case to compare the old decision, proposed decision and required result. To use your own policy, paste its source, capture it as the baseline, then edit the candidate and create scenarios from its function inputs or import a case suite. <a href="?playground#playground">Open the full language playground</a>.</p>
  </div>`;
}

export function setupWorkbench() {
  document.documentElement.classList.add('workbench-page');
  const source = document.querySelector<HTMLTextAreaElement>('#source')!;
  const makeWorker = () => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  let scenarios: ReturnType<typeof setupScenarioEditor> | undefined;
  const workspace = setupReview(source, makeWorker, {
    get available() { return scenarios?.available ?? (() => false); },
    get select() { return scenarios?.select ?? (() => false); }
  });
  // Move the real controls: retain their existing worker, cancellation and
  // disabled-state lifecycle rather than introducing proxy execution buttons.
  const run = document.getElementById('review-run')!; const stop = document.getElementById('review-stop')!;
  document.getElementById('workbench-review-actions')!.append(run, stop); run.classList.add('primary');
  run.addEventListener('click', () => document.getElementById('review-status')!.scrollIntoView({ block: 'start' }));
  setupPolicyFiles(workspace);
  document.getElementById('review-example')!.click();
  const suite = document.querySelector<HTMLTextAreaElement>('#review-suite')!;
  scenarios = setupScenarioEditor(suite);
  document.getElementById('scenario-editor')!.before(document.getElementById('new-scenario')!);
  function loadedExample() {
    // Only the bundled, explicitly loaded fixture may be formatted here.
    if (suite.value === exampleSuite) suite.value = JSON.stringify(JSON.parse(exampleSuite), null, 2);
    scenarios!.refresh();
  }
  loadedExample(); suite.addEventListener('change', scenarios.refresh);
  document.getElementById('review-example')!.addEventListener('click', loadedExample);
  document.getElementById('workbench-expense')!.addEventListener('click', () => {
    // Only this known bundled fixture is normalized, never imported owner input.
    const value = { baseline: expenseBaseline, candidate: expenseCandidate, suite_json: JSON.stringify(JSON.parse(expenseSuite), null, 2) };
    const current = workspace.read();
    const same = current?.baseline === value.baseline && current.candidate === value.candidate && current.suite_json === value.suite_json;
    if (!same) workspace.replace(value);
    document.getElementById('workbench-expense-status')!.textContent = same
      ? 'Illustrative expense inputs already loaded; inputs and previous inputs unchanged. No cases executed by this action; nothing applied or approved.'
      : 'Illustrative expense inputs replaced; previous complete inputs kept for Restore. Evidence cleared. Select Review cases for fresh results. This action requested no case execution; a prior review may already have attempted cases. Nothing applied or approved.';
  });
  setupLeaveWarning(workspace);
  setupNewScenario(workspace, source, makeWorker);
}
