import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const key = 'wisp-browser-draft-v1';
const baseline = 'fn f(n: Int) -> Int { n + 1 }\n// café 😀\n';
const candidate = 'fn f(n: Int) -> Int { n + 2 }\n';
const suite = '{"version":1,"target":"f","cases":[{"id":"own","args":["1"],"expect":{"result":{"type":"Int","value":"3"},"output":""}}]}\n';
const inputs = [baseline, candidate, suite];
const file = (name, text) => ({ name, mimeType: 'application/octet-stream', buffer: Buffer.from(text) });
const values = page => page.evaluate(() => ['review-baseline', 'source', 'review-suite'].map(id => document.getElementById(id).value));
const restore = page => page.locator('#workspace-restore-previous').click();
const envelope = (values, report) => JSON.stringify({
  format: report ? 'wisp-browser-review-v1' : 'wisp-browser-workspace-v1', approval: 'not_granted', applied: false,
  baseline: values[0], candidate: values[1], suite_json: values[2], ...(report ? { report } : {}),
}, null, 2);
async function open(page, query = '?workbench') {
  await page.goto(query);
  await page.locator('summary').filter({ hasText: 'Save or reopen your workspace' }).click();
}
async function select(page) {
  for (const [id, name, text] of [
    ['baseline', 'baseline.wisp', baseline], ['candidate', 'candidate.wisp', candidate], ['suite', 'cases.json', suite],
  ]) await page.locator('#policy-files-' + id).setInputFiles(file(name, text));
}
async function importFiles(page) {
  await select(page); await page.locator('#policy-files-open').click();
  await expect(page.locator('#policy-files-status')).toContainText('Files opened');
}
async function expectCleared(page) {
  for (const id of ['review-json', 'review-identity', 'review-summary', 'review-source-host', 'review-diagnostics', 'review-decisions', 'review-cases', 'workspace-recorded']) {
    await expect(page.locator('#' + id)).toHaveText('');
  }
  for (const id of ['review-download-source', 'review-download-evidence', 'review-download-readable', 'review-download-package', 'review-format-suite']) {
    await expect(page.locator('#' + id)).toBeDisabled();
  }
  await expect(page.locator('#workspace-history')).toBeHidden();
  await expect(page.locator('#review-status')).toContainText('no current review');
}

test('focused example replacement keeps complete edited inputs; an incomplete playground has no backup', async ({ page }) => {
  await open(page);
  await expect(page.locator('#workspace-restore-previous')).toBeDisabled();
  await page.locator('#source').fill('invalid edited input');
  await page.locator('#review-suite').evaluate(node => { node.value = '{invalid'; node.dispatchEvent(new Event('input')); });
  await page.locator('#review-capture').click();
  const edited = await values(page);
  await page.locator('#review-example').click();
  await expect(page.locator('#workspace-restore-previous')).toBeEnabled();
  await restore(page); expect(await values(page)).toEqual(edited);
  await open(page, '');
  await expect(page.locator('#review-baseline')).toHaveValue('');
  await page.locator('#workspace-file').setInputFiles(file('draft.json', envelope(inputs)));
  await page.locator('#workspace-replace').click();
  await expect(page.locator('#workspace-restore-previous')).toBeDisabled();
  // The first import could not keep an incomplete editor; the second can keep all three inputs.
  await page.locator('#workspace-file').setInputFiles(file('draft.json', envelope(inputs)));
  await page.locator('#workspace-replace').click();
  await expect(page.locator('#workspace-restore-previous')).toBeEnabled();
});

test('native Pass does not erase prior inputs; restore clears acceptance and toggles exact post-import edits', async ({ page }) => {
  await open(page); const original = await values(page);
  await importFiles(page);
  await page.locator('#review-run').click();
  await expect(page.locator('#review-status')).toContainText('Submitted inputs · Pass');
  const report = JSON.parse(await page.locator('#review-json').textContent());
  expect(report.review.summary).toMatchObject({ expectation_pass: 1, attempted_invocations: 2 });
  await expect(page.locator('#review-source-host')).not.toHaveText('');
  await expect(page.locator('#review-format-suite')).toBeEnabled();
  for (const id of ['source', 'evidence', 'readable', 'package']) await expect(page.locator('#review-download-' + id)).toBeEnabled();
  const edited = candidate + '// keep this later edit exactly\n';
  await page.locator('#source').fill(edited);
  await restore(page); expect(await values(page)).toEqual(original); await expectCleared(page);
  await restore(page); expect(await values(page)).toEqual([baseline, edited, suite]); await expectCleared(page);
  await restore(page); expect(await values(page)).toEqual(original); await expectCleared(page);
  // Reverting all initial inputs removes the leave warning, but never revives acceptance.
  const dialogs = []; page.on('dialog', dialog => { dialogs.push(dialog.type()); void dialog.dismiss(); });
  await page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('link', { name: 'Documentation', exact: true }).click();
  await expect(page).toHaveURL(/documentation/); expect(dialogs).toEqual([]);
});

test('workspace and review bundles share replacement; restore clears imported history and native diagnostics', async ({ page }) => {
  await open(page); const original = await values(page);
  const invalid = ['not valid Wisp\n', candidate, suite];
  await page.locator('#workspace-file').setInputFiles(file('draft.json', envelope(invalid)));
  await page.locator('#workspace-replace').click(); expect(await values(page)).toEqual(invalid);
  await page.locator('#review-run').click();
  await expect(page.locator('#review-diagnostics')).not.toHaveText('');
  await restore(page); expect(await values(page)).toEqual(original); await expectCleared(page);
  await page.locator('#workspace-file').setInputFiles(file('review.json', envelope(inputs, { status: 'Pass', secret: 'unverified imported history' })));
  await page.locator('#workspace-replace').click();
  await expect(page.locator('#workspace-recorded')).toContainText('unverified imported history');
  await restore(page); expect(await values(page)).toEqual(original); await expectCleared(page);
  await restore(page); expect(await values(page)).toEqual(inputs); await expectCleared(page);
});

test('browser recovery uses the same previous buffer; opted-in storage contains only the current restored workspace', async ({ page }) => {
  await page.addInitScript(({ key, raw }) => localStorage.setItem(key, raw), { key, raw: envelope(inputs) });
  await open(page); const original = await values(page);
  await page.locator('#draft-restore').click(); expect(await values(page)).toEqual(inputs);
  await expect(page.locator('#draft-keep')).toBeChecked();
  await page.locator('#source').fill(candidate + '// prior-buffer-only-secret\n');
  const edited = await values(page);
  await restore(page); expect(await values(page)).toEqual(original); await expectCleared(page);
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe(envelope(original));
  await restore(page); expect(await values(page)).toEqual(edited);
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe(envelope(edited));
});

test('restore terminates pending real native worker and rejects its delayed callback', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker; window.workerTerminations = 0;
    window.Worker = class {
      constructor(...args) { this.native = new NativeWorker(...args); }
      postMessage(message) {
        this.native.onmessage = event => { window.lateReview = () => this.onmessage?.(event); };
        this.native.postMessage(message);
      }
      terminate() { window.workerTerminations++; this.native.terminate(); }
    };
  });
  await open(page); const original = await values(page); await importFiles(page);
  await page.locator('#review-run').click(); await page.waitForFunction(() => Boolean(window.lateReview));
  await expect(page.locator('#review-stop')).toBeEnabled();
  await restore(page); expect(await page.evaluate(() => window.workerTerminations)).toBe(1);
  await page.evaluate(() => window.lateReview());
  expect(await values(page)).toEqual(original); await expectCleared(page);
  await expect(page.locator('#review-stop')).toBeDisabled();
  await expect(page.locator('#review-status')).not.toContainText('No cases executed');
});

test('previous secret inputs are never exported or implicitly saved and reload loses the buffer', async ({ page }) => {
  await open(page); const original = await values(page);
  await page.locator('#source').fill(original[1] + '\n// prior-buffer-only-secret');
  await importFiles(page);
  const pending = page.waitForEvent('download'); await page.locator('#workspace-save').click();
  const raw = await readFile(await (await pending).path(), 'utf8');
  expect(raw).toBe(envelope(inputs)); expect(raw).not.toContain('prior-buffer-only-secret');
  await page.locator('#review-run').click(); await expect(page.locator('#review-status')).toContainText('Submitted inputs · Pass');
  const evidencePending = page.waitForEvent('download'); await page.locator('#review-download-evidence').click();
  const evidence = await readFile(await (await evidencePending).path(), 'utf8');
  expect(evidence).not.toContain('prior-buffer-only-secret');
  expect(JSON.parse(evidence)).toMatchObject({ baseline, candidate, suite_json: suite });
  expect(await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }))).toEqual({ local: {}, session: {} });
  page.on('dialog', dialog => void dialog.accept()); await page.reload();
  await page.locator('summary').filter({ hasText: 'Save or reopen your workspace' }).click();
  await expect(page.locator('#workspace-restore-previous')).toBeDisabled();
  expect(await values(page)).toEqual(original);
});

test('restore invalidates in-flight policy file reads; invalid oversized edited inputs are kept exactly for switching back', async ({ page }) => {
  await open(page); const original = await values(page); await importFiles(page);
  const edited = ['invalid baseline\n', 'x'.repeat(65537), '{invalid suite\n'];
  await page.locator('#source').fill(edited[0]); await page.locator('#review-capture').click();
  await page.locator('#source').fill(edited[1]); await page.locator('#review-suite').fill(edited[2]);
  await page.evaluate(() => {
    const original = File.prototype.arrayBuffer; window.releaseFiles = [];
    File.prototype.arrayBuffer = async function () {
      await new Promise(resolve => window.releaseFiles.push(resolve)); return original.call(this);
    };
  });
  await select(page); await page.locator('#policy-files-open').click();
  await page.waitForFunction(() => window.releaseFiles.length === 3);
  await restore(page); expect(await values(page)).toEqual(original);
  await page.evaluate(() => window.releaseFiles.splice(0).forEach(resolve => resolve()));
  await expect(page.locator('#policy-files-status')).toContainText('Workspace changed while reading');
  expect(await values(page)).toEqual(original);
  await restore(page); expect(await values(page)).toEqual(edited); await expectCleared(page);
  await page.locator('#review-run').click(); await expect(page.locator('#review-status')).toContainText('Host limit');
});
