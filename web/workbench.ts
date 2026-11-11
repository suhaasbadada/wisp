import { reviewMarkup, setupReview } from './review';
import { policyFilesMarkup, setupPolicyFiles } from './policy-files';
import { setupScenarioEditor } from './scenarios';
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
  const scenarios = setupScenarioEditor(suite);
  function loadedExample() {
    // Only the bundled, explicitly loaded fixture may be formatted here.
    if (suite.value === exampleSuite) suite.value = JSON.stringify(JSON.parse(exampleSuite), null, 2);
    scenarios();
  }
  loadedExample(); suite.addEventListener('change', scenarios);
  document.getElementById('review-example')!.addEventListener('click', loadedExample);
}
