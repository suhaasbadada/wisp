import { reviewMarkup, setupReview } from './review';
import { policyFilesMarkup, setupPolicyFiles } from './policy-files';
import { setupScenarioEditor } from './scenarios';
import { setupLeaveWarning } from './leave-warning';
import { newScenarioMarkup, setupNewScenario } from './new-scenario';
import { workspaceLibraryMarkup, setupWorkspaceLibrary } from './workspace-library';
import './workbench.css';
import exampleSuite from '../examples/policies/cases.json?raw';
import reservationBaseline from '../examples/policies/reservations-before.wisp?raw';
import reservationCandidate from '../examples/policies/reservations-after.wisp?raw';
import expenseBaseline from '../examples/policies/expenses-before.wisp?raw';
import expenseCandidate from '../examples/policies/expenses-after.wisp?raw';
import expenseSuite from '../examples/policies/expenses-cases.json?raw';

export function workbenchMarkup() {
  return `<div class="wrap product-workbench">
    <div class="eyebrow">WISP POLICY WORKBENCH · LOCAL / NO ACCOUNT</div>
    <h1>Change a rule. See the consequences.</h1>
    <p class="intro">Compare policy decisions before you ship a rule change.</p>
    <nav class="workbench-actions" aria-label="Policy workbench actions"><div id="workbench-review-actions"></div><a href="#source">Policy</a><a href="#scenario-editor">Scenarios</a><a href="#review-status">Results</a></nav>
    <p class="workbench-privacy">Local only: nothing uploaded. Browser saving is off unless explicitly enabled. The leaving warning is not a save or backup.</p>
    <section class="workbench-start" aria-label="Start your workspace">
      <article><h2>Try examples</h2><p>Starts with seven reservation scenarios. Loading an example does not request a review.</p>
        <div id="workbench-reservation"></div>
        <button id="workbench-expense">Load expense walkthrough (replaces all three inputs)</button>
        <p>Loads replace all three inputs; previous complete inputs stay in this tab for Restore. No execution requested or approval granted.</p>
        <p>Expense is illustrative, not finance, tax or company advice or approval.</p>
      </article>
      <article><h2>Open your own policy</h2><p>Bring baseline Wisp, an optional candidate, and scenario JSON. Choose files first; open them only when ready.</p><a href="#policy-files-heading">Open policy file tools</a></article>
      <article><h2>Resume work</h2><p>Use an explicitly saved browser copy or a downloaded workspace. Navigation alone loads and saves nothing.</p>
        <button id="workbench-resume-library">Find a browser workspace</button>
        <button id="workbench-resume-file">Reopen a downloaded workspace</button>
      </article>
    </section>
    <p id="workbench-expense-status" role="status" aria-live="polite"></p>
    <details class="workbench-guide"><summary>Example rules and boundaries</summary>
      <p>The reservation sample fixes pack rounding and expired stock. Seven saved scenarios cover boundaries and rejection rules. Edit the candidate, review saved scenarios, then download code and evidence.</p>
      <p>Expense owner requirements: reject negative amounts, allow amounts up to 10000 cents inclusive, and require a receipt only above 2500 cents. The candidate fixes two boundary mistakes. This illustration is not finance, tax or company advice or approval.</p>
    </details>
    <section class="code-panel"><div class="panel-head"><h2>1. Proposed policy</h2><span>Wisp source · editable</span></div>
    <label class="sr-only" for="source">Proposed policy source</label><textarea id="source" spellcheck="false"></textarea></section>
    ${reviewMarkup()}
    ${newScenarioMarkup()}
    <section class="workbench-tools" aria-label="Workspace tools">${policyFilesMarkup()}${workspaceLibraryMarkup()}</section>
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
  const reservation = document.getElementById('review-example')!;
  reservation.click();
  document.getElementById('workbench-reservation')!.append(reservation);
  reservation.textContent = 'Load reservation walkthrough (replaces all three inputs)';
  const suite = document.querySelector<HTMLTextAreaElement>('#review-suite')!;
  scenarios = setupScenarioEditor(suite);
  document.getElementById('scenario-editor')!.before(document.getElementById('new-scenario')!);
  // Startup alone uses the original walkthrough handler. Explicit subsequent
  // loads replace complete workspaces, preserving even invalid previous text.
  // Only these known bundled fixtures are normalized, never owner input.
  suite.value = JSON.stringify(JSON.parse(exampleSuite), null, 2);
  scenarios.refresh(); suite.addEventListener('change', scenarios.refresh);
  function loadExample(baseline: string, candidate: string, rawSuite: string, label: string) {
    const value = { baseline, candidate, suite_json: JSON.stringify(JSON.parse(rawSuite), null, 2) };
    const current = workspace.read();
    const same = current?.baseline === value.baseline && current.candidate === value.candidate && current.suite_json === value.suite_json;
    if (!same) workspace.replace(value);
    document.getElementById('workbench-expense-status')!.textContent = same
      ? `${label} inputs already loaded; inputs and previous inputs unchanged. No cases executed by this action; nothing applied or approved.`
      : `${label} inputs replaced; previous complete inputs kept for Restore. Evidence cleared. Select Review cases for fresh results. This action requested no case execution; a prior review may already have attempted cases. Nothing applied or approved.`;
  }
  reservation.onclick = () => loadExample(reservationBaseline, reservationCandidate, exampleSuite, 'Reservation');
  document.getElementById('workbench-expense')!.onclick = () => loadExample(expenseBaseline, expenseCandidate, expenseSuite, 'Illustrative expense');
  document.getElementById('policy-files-heading')!.tabIndex = -1;
  const reveal = (target: HTMLElement) => {
    target.closest('details')!.open = true;
    target.focus(); target.scrollIntoView({ block: 'start' });
  };
  document.getElementById('workbench-resume-library')!.onclick = () => reveal(document.querySelector<HTMLElement>('#workspace-library > summary')!);
  document.getElementById('workbench-resume-file')!.onclick = () => reveal(document.getElementById('workspace-file')!);
  setupLeaveWarning(workspace);
  setupNewScenario(workspace, source, makeWorker);
  setupWorkspaceLibrary(workspace);
}
