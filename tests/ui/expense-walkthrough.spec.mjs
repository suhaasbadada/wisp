import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const baseline = await readFile('examples/policies/expenses-before.wisp', 'utf8');
const candidate = await readFile('examples/policies/expenses-after.wisp', 'utf8');
const fixture = JSON.parse(await readFile('examples/policies/expenses-cases.json', 'utf8'));
const suite = JSON.stringify(fixture, null, 2);
const inputs = [baseline, candidate, suite];
const values = page => page.evaluate(() => ['review-baseline', 'source', 'review-suite'].map(id => document.getElementById(id).value));
const load = page => page.getByRole('button', { name: 'Load expense walkthrough (replaces all three inputs)', exact: true }).click();
const card = (page, id) => page.locator('.scenario-card').filter({ has: page.locator('summary', { hasText: new RegExp(`^${id}$`) }) });
async function workspaceControls(page) {
  await page.locator('summary').filter({ hasText: 'Save or reopen your workspace' }).click();
}
async function review(page, status = 'Pass') {
  await page.locator('#review-run').click();
  await expect(page.locator('#review-status')).toContainText(`Submitted inputs · ${status}`);
  return JSON.parse(await page.locator('#review-json').textContent());
}
async function cleared(page) {
  for (const id of ['review-json', 'review-identity', 'review-summary', 'review-source-host', 'review-diagnostics', 'review-decisions', 'review-cases', 'workspace-recorded']) {
    await expect(page.locator('#' + id)).toHaveText('');
  }
  for (const id of ['source', 'evidence', 'readable', 'package']) await expect(page.locator('#review-download-' + id)).toBeDisabled();
  await expect(page.locator('#review-status')).toContainText('no current review');
}
function expectExpenseReport(report) {
  expect(report.status).toBe('Pass');
  expect(report.review).toMatchObject({ phase: 'executed', approval: 'not_granted', new_execution: true,
    summary: { total: 7, attempted_invocations: 14, changed: 2, unchanged: 5, faulted: 0, unknown: 0, expectation_pass: 7, expectation_fail: 0, expectation_error: 0, expectation_unknown: 0 } });
  expect(report.review.cases.filter(row => row.comparison === 'Changed').map(row => row.id)).toEqual(['receipt-boundary', 'cap-boundary']);
  for (const [index, row] of report.review.cases.entries()) {
    expect(row.id).toBe(fixture.cases[index].id);
    expect(row.expectation).toBe('Pass');
    for (const side of ['before', 'after']) expect(row[side]).toMatchObject({ status: 'Complete', new_execution: true, diagnostics: [], output: '' });
    expect(row.after.result).toEqual(fixture.cases[index].expect.result);
    if (row.comparison === 'Unchanged') expect(row.before.result).toEqual(row.after.result);
  }
  expect(report.review.cases[3].before.result).toEqual({ type: 'Decision', value: { reimbursable: false, reason: 'receipt required' } });
  expect(report.review.cases[5].before.result).toEqual({ type: 'Decision', value: { reimbursable: false, reason: 'over cap' } });
}

test('expense loading is explicit, preserves all edited inputs and repeated loading keeps Restore', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker; window.workerStarts = 0;
    window.Worker = class extends NativeWorker { constructor(...args) { super(...args); window.workerStarts++; } };
  });
  await page.goto('?workbench');
  await expect(page.locator('#source')).toHaveValue(await readFile('examples/policies/reservations-after.wisp', 'utf8'));
  await expect(page.locator('#workbench-expense')).toBeVisible();
  await expect(page.locator('#workbench-expense-status')).toHaveText('');
  expect(await page.evaluate(() => window.workerStarts)).toBe(0);
  // Preserve even invalid owner text; replacement is not normalization or edit undo.
  await page.locator('#source').fill('invalid edited baseline\n// café 😀\n');
  await page.locator('#review-capture').click();
  await page.locator('#source').fill('invalid edited candidate\n');
  await page.locator('#review-suite').evaluate(node => { node.value = '{invalid owner suite\n'; node.dispatchEvent(new Event('input')); });
  const edited = await values(page);
  await load(page); expect(await values(page)).toEqual(inputs); await cleared(page);
  await expect(page.locator('#workbench-expense-status')).toContainText('Select Review cases');
  expect(await page.evaluate(() => window.workerStarts)).toBe(0);
  await load(page); expect(await values(page)).toEqual(inputs);
  await expect(page.locator('#workbench-expense-status')).toContainText('previous inputs unchanged');
  await workspaceControls(page);
  await page.locator('#workspace-restore-previous').click(); expect(await values(page)).toEqual(edited); await cleared(page);
  await page.locator('#workspace-restore-previous').click(); expect(await values(page)).toEqual(inputs); await cleared(page);
});

test('generic expense record forms render seven cases and real WASM observes only two changes', async ({ page }) => {
  await page.goto('?workbench'); await load(page);
  await expect(page.locator('.scenario-card')).toHaveCount(7);
  for (const row of fixture.cases) {
    const current = card(page, row.id); await current.locator('summary').click();
    await expect(current.getByLabel('Argument 1.amount_cents', { exact: true })).toHaveValue(row.args[0].amount_cents);
    await expect(current.getByLabel('Argument 1.receipt', { exact: true })).toBeChecked({ checked: row.args[0].receipt });
    await expect(current.getByLabel('Required result type', { exact: true })).toHaveValue('Decision');
    await expect(current.getByLabel('Required: reimbursable', { exact: true })).toBeChecked({ checked: row.expect.result.value.reimbursable });
    await expect(current.getByLabel('Required: reason', { exact: true })).toHaveValue(row.expect.result.value.reason);
  }
  expectExpenseReport(await review(page));
  const accepted = await page.locator('#review-json').textContent();
  await load(page); await expect(page.locator('#review-json')).toHaveText(accepted);
  await expect(page.locator('#review-download-evidence')).toBeEnabled();
  await expect(page.locator('#review-decisions tbody tr')).toHaveCount(7);
  await expect(page.locator('#review-decisions')).toContainText('receipt required');
  await expect(page.locator('#review-decisions')).toContainText('over cap');
});

test('loading alternate inputs clears reservation evidence without running and reservation button still works', async ({ page }) => {
  await page.goto('?workbench'); const reservation = await values(page);
  const previous = await review(page); expect(previous.review.summary.expectation_pass).toBe(7);
  await load(page); expect(await values(page)).toEqual(inputs); await cleared(page);
  expectExpenseReport(await review(page));
  await page.locator('#review-example').click(); expect(await values(page)).toEqual(reservation);
  const report = await review(page); expect(report.review.summary).toMatchObject({ expectation_pass: 7, attempted_invocations: 14 });
  await expect(page.locator('#review-decisions')).toContainText('packs: "3"');
});

test('an intentionally wrong owner expense requirement remains Fail and is never repaired', async ({ page }) => {
  await page.goto('?workbench'); await load(page);
  const boundary = card(page, 'receipt-boundary'); await boundary.locator('summary').click();
  await boundary.getByLabel('Required: reimbursable', { exact: true }).uncheck();
  const edited = await page.locator('#review-suite').inputValue();
  const report = await review(page, 'Fail');
  expect(report.review.summary).toMatchObject({ expectation_pass: 6, expectation_fail: 1, changed: 2, unchanged: 5 });
  expect(report.review.cases[3].after.result.value.reimbursable).toBe(true);
  expect(report.review.cases[3].expectation).toBe('Fail');
  await expect(page.locator('#review-suite')).toHaveValue(edited);
  await expect(boundary.getByLabel('Required: reimbursable', { exact: true })).not.toBeChecked();
  await review(page, 'Fail'); await expect(page.locator('#review-suite')).toHaveValue(edited);
});

test('expense workspace and native evidence export exact sources and round-trip with fresh execution', async ({ page }) => {
  await page.goto('?workbench'); await load(page); await workspaceControls(page);
  let pending = page.waitForEvent('download'); await page.locator('#workspace-save').click();
  const draftDownload = await pending; expect(draftDownload.suggestedFilename()).toBe('policy-workspace.json');
  const raw = await readFile(await draftDownload.path(), 'utf8');
  expect(JSON.parse(raw)).toEqual({ format: 'wisp-browser-workspace-v1', approval: 'not_granted', applied: false, baseline, candidate, suite_json: suite });
  expectExpenseReport(await review(page));
  pending = page.waitForEvent('download'); await page.locator('#review-download-source').click();
  const sourceDownload = await pending; expect(sourceDownload.suggestedFilename()).toBe('candidate.wisp');
  expect(await readFile(await sourceDownload.path(), 'utf8')).toBe(candidate);
  pending = page.waitForEvent('download'); await page.locator('#review-download-evidence').click();
  const evidence = JSON.parse(await readFile(await (await pending).path(), 'utf8'));
  expect(evidence).toMatchObject({ format: 'wisp-browser-review-v1', approval: 'not_granted', applied: false, baseline, candidate, suite_json: suite });
  expectExpenseReport(evidence.report);
  await page.locator('#review-example').click();
  await page.locator('#workspace-file').setInputFiles({ name: 'workspace.json', mimeType: 'application/json', buffer: Buffer.from(raw) });
  await page.locator('#workspace-replace').click(); expect(await values(page)).toEqual(inputs); await cleared(page);
  expectExpenseReport(await review(page));
});
