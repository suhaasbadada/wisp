import { reviewMarkup, setupReview } from './review';
import { policyFilesMarkup, setupPolicyFiles } from './policy-files';
import { setupScenarioEditor } from './scenarios';
import { setupLeaveWarning } from './leave-warning';
import { newScenarioMarkup, setupNewScenario } from './new-scenario';
import './workbench.css';
import exampleSuite from '../examples/policies/cases.json?raw';

export function workbenchMarkup() {
  return `<div class="wrap product-workbench">
    <div class="eyebrow">WISP POLICY WORKBENCH · LOCAL / NO ACCOUNT</div>
    <h1>Change a rule.<br>See the consequences.</h1>
    <p class="intro">Check reservation decisions before you ship a policy change.</p>
    <nav class="workbench-actions" aria-label="Policy workbench actions"><div id="workbench-review-actions"></div><a href="#source">Policy</a><a href="#scenario-editor">Scenarios</a><a href="#review-status">Results</a></nav>
    <p>The sample fixes pack rounding and expired stock. Seven saved scenarios cover boundaries and rejection rules. Edit the candidate, compare decisions, then download your code and review. Nothing is uploaded. Browser draft saving is off unless you opt in under Save or reopen your workspace. Browsers may warn before leaving with changed inputs; this does not save them.</p>
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
  const workspace = setupReview(source, makeWorker);
  // Move the real controls: retain their existing worker, cancellation and
  // disabled-state lifecycle rather than introducing proxy execution buttons.
  const run = document.getElementById('review-run')!; const stop = document.getElementById('review-stop')!;
  document.getElementById('workbench-review-actions')!.append(run, stop); run.classList.add('primary');
  run.addEventListener('click', () => document.getElementById('review-status')!.scrollIntoView({ block: 'start' }));
  setupPolicyFiles(workspace);
  document.getElementById('review-example')!.click();
  const suite = document.querySelector<HTMLTextAreaElement>('#review-suite')!;
  const scenarios = setupScenarioEditor(suite);
  document.getElementById('scenario-editor')!.before(document.getElementById('new-scenario')!);
  function loadedExample() {
    // Only the bundled, explicitly loaded fixture may be formatted here.
    if (suite.value === exampleSuite) suite.value = JSON.stringify(JSON.parse(exampleSuite), null, 2);
    scenarios();
  }
  loadedExample(); suite.addEventListener('change', scenarios);
  document.getElementById('review-example')!.addEventListener('click', loadedExample);
  setupLeaveWarning(workspace);
  setupNewScenario(workspace, source, makeWorker);
}
