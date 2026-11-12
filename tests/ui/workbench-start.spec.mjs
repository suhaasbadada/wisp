import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const reservation = await Promise.all(['reservations-before.wisp', 'reservations-after.wisp', 'cases.json'].map(name => readFile('examples/policies/' + name, 'utf8')));
reservation[2] = JSON.stringify(JSON.parse(reservation[2]), null, 2);
const expense = await Promise.all(['expenses-before.wisp', 'expenses-after.wisp', 'expenses-cases.json'].map(name => readFile('examples/policies/' + name, 'utf8')));
expense[2] = JSON.stringify(JSON.parse(expense[2]), null, 2);
const values = page => page.evaluate(() => ['review-baseline', 'source', 'review-suite'].map(id => document.getElementById(id).value));
const storage = page => page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }));
const saveDetails = page => page.locator('summary').filter({ hasText: 'Save or reopen your workspace' });
const firstCase = page => page.locator('.scenario-card').first();
async function instrument(page) {
  await page.addInitScript(() => {
    const Native = window.Worker; window.workerRequests = [];
    window.Worker = class extends Native {
      postMessage(message) { window.workerRequests.push(message); super.postMessage(message); }
    };
  });
}
async function keyboardActivate(page, locator) { await locator.focus(); await page.keyboard.press('Enter'); }
async function belowBar(page, locator) {
  expect(await locator.evaluate(node => node.getBoundingClientRect().top >= document.querySelector('.workbench-actions').getBoundingClientRect().bottom)).toBe(true);
}
async function review(page) {
  await page.locator('#review-run').click();
  await expect(page.locator('#review-status')).toContainText('Submitted inputs · Pass');
  return JSON.parse(await page.locator('#review-json').textContent());
}

test('desktop opens with three starting paths and source within the first screen, without execution', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 }); await instrument(page); await page.goto('?workbench');
  await expect(page.getByRole('heading', { name: 'Change a rule. See the consequences.', exact: true })).toBeVisible();
  await expect(page.locator('.workbench-start > article')).toHaveCount(3);
  await expect(page.locator('#review-example')).toBeVisible(); await expect(page.locator('#workbench-expense')).toBeVisible();
  await expect(page.locator('#workbench-reservation #review-example')).toHaveCount(1);
  const metrics = await page.evaluate(() => ({ sourceTop: document.getElementById('source').getBoundingClientRect().top, headingTop: document.querySelector('.code-panel h2').getBoundingClientRect().top, columns: getComputedStyle(document.querySelector('.workbench-start')).gridTemplateColumns }));
  console.log('1280x900 opening metrics', metrics);
  expect(metrics.sourceTop).toBeLessThanOrEqual(900); expect(metrics.headingTop).toBeLessThan(900);
  expect(await values(page)).toEqual(reservation); await expect(page.locator('.scenario-card')).toHaveCount(7);
  expect(await page.evaluate(() => window.workerRequests)).toEqual([]); expect(await storage(page)).toEqual({ local: {}, session: {} });
  await expect(page.locator('.workbench-guide')).not.toHaveAttribute('open', '');
  await expect(page.locator('#workspace-library')).not.toHaveAttribute('open', '');
  expect(await page.locator('.workbench-tools').evaluate(node => node.compareDocumentPosition(document.getElementById('policy-review')) & Node.DOCUMENT_POSITION_PRECEDING)).toBeTruthy();
  expect(await page.locator('#new-scenario').evaluate(node => node.nextElementSibling.id)).toBe('scenario-editor');
});

test('phone stacks paths without horizontal overflow and keeps the single real Review reachable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('?workbench');
  expect(await page.locator('#review-run').evaluate(node => node.getBoundingClientRect().bottom < innerHeight)).toBe(true);
  const metrics = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, cardLefts: [...document.querySelectorAll('.workbench-start article')].map(node => node.getBoundingClientRect().left) }));
  console.log('390x844 opening metrics', metrics);
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.width); expect(new Set(metrics.cardLefts).size).toBe(1);
  await expect(page.locator('#review-run')).toHaveCount(1); await expect(page.locator('#review-stop')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Review cases', exact: true })).toHaveCount(1);
  const report = await review(page); expect(report.review.summary).toMatchObject({ total: 7, expectation_pass: 7, attempted_invocations: 14 });
});

test('keyboard starting paths focus the real tools below the sticky bar without side effects', async ({ page }) => {
  await instrument(page); await page.goto('?workbench'); const initial = await values(page); const saved = await storage(page);
  const events = []; page.on('filechooser', () => events.push('filechooser')); page.on('download', () => events.push('download'));
  await keyboardActivate(page, page.getByRole('link', { name: 'Open policy file tools', exact: true }));
  await expect(page.locator('#policy-files-heading')).toBeFocused(); await belowBar(page, page.locator('#policy-files-heading'));
  await expect(page.locator('#policy-files-open')).toBeVisible();
  await keyboardActivate(page, page.locator('#workbench-resume-library'));
  const summary = page.locator('#workspace-library > summary'); await expect(summary).toBeFocused(); await belowBar(page, summary);
  await expect(page.locator('#workspace-library')).toHaveAttribute('open', '');
  await expect(page.locator('#workspace-library')).toContainText('UNENCRYPTED');
  await expect(page.locator('#workspace-library')).toContainText('Confirm irreversible data deletion');
  await expect(page.locator('#library-select')).toBeVisible();
  await keyboardActivate(page, page.locator('#workbench-resume-file'));
  await expect(page.locator('#workspace-file')).toBeFocused(); await belowBar(page, page.locator('#workspace-file'));
  await expect(page.locator('#draft-keep')).not.toBeChecked();
  await keyboardActivate(page, page.getByRole('navigation', { name: 'Policy workbench actions' }).getByRole('link', { name: 'Policy', exact: true }));
  await expect(page.locator('#source')).toBeFocused(); await belowBar(page, page.locator('#source'));
  expect(await values(page)).toEqual(initial); expect(await storage(page)).toEqual(saved); expect(events).toEqual([]);
  expect(await page.evaluate(() => window.workerRequests)).toEqual([]);
  await expect(page.locator('#workspace-restore-previous')).toBeDisabled();
});

test('explicit reservation clears native evidence and restores all invalid edited inputs, without new execution', async ({ page }) => {
  await instrument(page); await page.goto('?workbench');
  await review(page);
  await page.locator('#source').fill('invalid baseline\n// café 😀\n'); await page.locator('#review-capture').click();
  await page.locator('#source').fill('invalid candidate\n');
  await page.locator('#review-suite').evaluate(node => { node.value = '{invalid suite\n'; node.dispatchEvent(new Event('input')); });
  const edited = await values(page);
  await page.locator('#review-example').click(); expect(await values(page)).toEqual(reservation);
  await expect(page.locator('#review-json')).toHaveText(''); await expect(page.locator('#review-download-evidence')).toBeDisabled();
  await saveDetails(page).click(); await page.locator('#workspace-restore-previous').click(); expect(await values(page)).toEqual(edited);
  await page.locator('#workspace-restore-previous').click(); expect(await values(page)).toEqual(reservation);
  expect(await page.evaluate(() => window.workerRequests.length)).toBe(1);
});

for (const example of ['reservation', 'expense']) test(`identical ${example} load keeps native evidence, prior inputs and live form action bindings`, async ({ page }) => {
  await instrument(page); await page.goto('?workbench');
  // Establish a previous workspace before loading the fixture again.
  await page.locator('#source').fill(reservation[1] + '\n// previous only'); const previous = await values(page);
  const button = page.locator(example === 'reservation' ? '#review-example' : '#workbench-expense');
  await button.click(); const expected = example === 'reservation' ? reservation : expense;
  const report = await review(page); expect(report.review.summary.expectation_pass).toBe(7);
  if (example === 'expense') expect(report.review.summary.changed).toBe(2);
  const accepted = await page.locator('#review-json').textContent();
  await firstCase(page).locator('summary').click();
  await firstCase(page).evaluate(node => { window.currentForm = node; });
  await button.click(); expect(await values(page)).toEqual(expected);
  await expect(page.locator('#review-json')).toHaveText(accepted); await expect(page.locator('#review-download-evidence')).toBeEnabled();
  expect(await firstCase(page).evaluate(node => node === window.currentForm && node.open)).toBe(true);
  const firstId = JSON.parse(expected[2]).cases[0].id;
  await page.locator('#review-decisions').getByRole('button', { name: `Edit saved scenario ${firstId}`, exact: true }).click();
  await expect(firstCase(page).getByLabel(example === 'reservation' ? 'Required: accepted' : 'Required: reimbursable', { exact: true })).toBeFocused();
  expect(await page.evaluate(() => window.workerRequests.length)).toBe(1);
  // Restore still points at the pre-load workspace, not the identical fixture.
  await saveDetails(page).click(); await page.locator('#workspace-restore-previous').click(); expect(await values(page)).toEqual(previous);
  await page.locator('#workspace-restore-previous').click(); expect(await values(page)).toEqual(expected);
  await review(page); await button.click();
  await firstCase(page).locator('summary').click();
  await firstCase(page).getByRole('button', { name: 'Duplicate scenario', exact: true }).click();
  await expect(page.locator('.scenario-card')).toHaveCount(8);
  expect(JSON.parse((await values(page))[2]).cases).toHaveLength(8);
  await expect(page.locator('#review-download-evidence')).toBeDisabled();
});

test('post-import edits survive selecting a second example and unadded builder values are not remapped or saved', async ({ page }) => {
  await instrument(page); await page.goto('?workbench');
  const own = ['fn own(n: Int) -> Int { n }\n', 'fn own(n: Int) -> Int { n + 1 }\n', '{invalid raw owner suite\n'];
  for (const [id, name, text] of [['baseline', 'before.wisp', own[0]], ['candidate', 'after.wisp', own[1]], ['suite', 'cases.json', own[2]]]) {
    await page.locator('#policy-files-' + id).setInputFiles({ name, mimeType: 'application/octet-stream', buffer: Buffer.from(text) });
  }
  await page.locator('#policy-files-open').click();
  await expect(page.locator('#policy-files-status')).toContainText('Files opened'); expect(await values(page)).toEqual(own);
  await page.locator('#source').fill(own[1] + '// post-import edit\n'); const edited = await values(page);
  await expect(page.locator('#scenario-editor')).toContainText('Custom or incomplete suite');
  await expect(page.locator('#policy-files-heading')).toBeVisible();
  await page.locator('#new-scenario > summary').click(); await page.locator('#scenario-read').click();
  await expect(page.locator('#scenario-build-status')).toContainText('Metadata Ready');
  await page.locator('#scenario-function').selectOption({ label: 'own' });
  await page.locator('#scenario-new-fields input').first().fill('unadded-secret');
  await page.locator('#workbench-expense').click(); expect(await values(page)).toEqual(expense);
  await expect(page.locator('#scenario-new-fields')).toHaveText('');
  await expect(page.locator('#scenario-add')).toBeDisabled();
  await saveDetails(page).click(); await page.locator('#workspace-restore-previous').click(); expect(await values(page)).toEqual(edited);
  await expect(page.locator('#scenario-new-fields')).toHaveText('');
  expect(await storage(page)).toEqual({ local: {}, session: {} });
  expect(await page.evaluate(() => window.workerRequests.length)).toBe(1); // declaration metadata only
  expect(JSON.parse(await page.evaluate(() => window.workerRequests[0].requestJson)).op).toBe('describe');
});

test('full language playground keeps original layout and example semantics', async ({ page }) => {
  await instrument(page); await page.goto('?playground');
  await expect(page.locator('.workbench-start')).toHaveCount(0); await expect(page.locator('#workbench-resume-library')).toHaveCount(0);
  await expect(page.locator('#policy-review #review-example')).toHaveCount(1);
  await expect(page.locator('#review-example')).toHaveText('Load reservation walkthrough (replaces editor)');
  await page.locator('#review-example').click();
  await expect(page.locator('#source')).toHaveValue(reservation[1]);
  expect(await page.evaluate(() => window.workerRequests.filter(message => message.requestJson && JSON.parse(message.requestJson).op === 'review'))).toEqual([]);
});

test('identical examples preserve native-described unadded fields, replacement consent and builder bindings', async ({ page }) => {
  await instrument(page);
  for (const example of ['reservation', 'expense']) {
    await page.goto('?workbench');
    const button = page.locator(example === 'reservation' ? '#review-example' : '#workbench-expense');
    if (example === 'expense') await button.click();
    const original = await values(page);
    await page.locator('#new-scenario > summary').click(); await page.locator('#scenario-read').click();
    await expect(page.locator('#scenario-build-status')).toContainText('Metadata Ready');
    await page.locator('#scenario-function').selectOption({ label: 'decide' });
    await page.locator('#scenario-new-fields input').first().fill('unadded-secret');
    await page.locator('#scenario-replace').check();
    const status = await page.locator('#scenario-build-status').textContent();
    await page.locator('#scenario-new-fields input').first().evaluate(node => { window.unaddedField = node; });
    await button.click();
    await expect(page.locator('#scenario-new-fields input').first()).toHaveValue('unadded-secret');
    expect(await page.locator('#scenario-new-fields input').first().evaluate(node => node === window.unaddedField)).toBe(true);
    await expect(page.locator('#scenario-replace')).toBeChecked(); await expect(page.locator('#scenario-add')).toBeEnabled();
    await expect(page.locator('#scenario-build-status')).toHaveText(status);
    expect(await values(page)).toEqual(original);
    expect(await page.evaluate(() => window.workerRequests.map(message => JSON.parse(message.requestJson).op))).toEqual(['describe']);
  }
});

test('identical example loads do not stop an in-flight native shape read or reject its reply', async ({ page }) => {
  await page.addInitScript(() => {
    const Native = window.Worker; window.shapeReplies = [];
    window.Worker = class extends Native { set onmessage(handler) { super.onmessage = event => {
      window.shapeReplies.push(() => handler?.(event));
    }; } };
  });
  for (const example of ['reservation', 'expense']) {
    await page.goto('?workbench');
    const button = page.locator(example === 'reservation' ? '#review-example' : '#workbench-expense');
    if (example === 'expense') await button.click();
    await page.locator('#new-scenario > summary').click(); await page.locator('#scenario-read').click();
    await expect.poll(() => page.evaluate(() => window.shapeReplies.length)).toBe(1);
    await button.click();
    await expect(page.locator('#scenario-read-stop')).toBeEnabled(); await expect(page.locator('#scenario-read')).toBeDisabled();
    await page.evaluate(() => window.shapeReplies[0]());
    await expect(page.locator('#scenario-build-status')).toContainText('Metadata Ready');
    await expect(page.locator('#scenario-function')).toBeEnabled();
  }
});
