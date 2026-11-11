import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function files(page) {
  await page.goto('?workbench');
  await page.locator('summary').filter({ hasText: 'Save or reopen your workspace' }).click();
}
const upload = (page, raw) => page.locator('#workspace-file').setInputFiles({ name: 'workspace.json', mimeType: 'application/json', buffer: Buffer.from(raw) });

test('draft survives reload exactly, without requiring a review or altering current inputs before replacement', async ({ page }) => {
  await files(page);
  const candidate = (await page.locator('#source').inputValue()) + '\n// unsaved café 😀';
  await page.locator('#source').fill(candidate);
  const suite = (await page.locator('#review-suite').inputValue()) + '\n ';
  await page.locator('#review-suite').evaluate((node, value) => { node.value = value; node.dispatchEvent(new Event('input')); }, suite);
  const baseline = await page.locator('#review-baseline').inputValue();
  const download = page.waitForEvent('download'); await page.locator('#workspace-save').click();
  const raw = await readFile(await (await download).path(), 'utf8');
  expect(JSON.parse(raw)).toEqual({ format: 'wisp-browser-workspace-v1', approval: 'not_granted', applied: false, baseline, candidate, suite_json: suite });
  await files(page); const original = await page.locator('#source').inputValue();
  await upload(page, raw); await expect(page.locator('#workspace-replace')).toBeEnabled();
  await expect(page.locator('#source')).toHaveValue(original);
  await page.locator('#workspace-replace').click();
  await expect(page.locator('#source')).toHaveValue(candidate);
  await expect(page.locator('#review-suite')).toHaveValue(suite);
  await expect(page.locator('#review-baseline')).toHaveValue(baseline);
  await expect(page.locator('#review-status')).toContainText('no current review');
  await expect(page.locator('#review-download-source')).toBeDisabled();
  await expect(page.locator('#review-json')).toHaveText('');
  await page.locator('#review-run').click(); await expect(page.locator('#review-status')).toContainText('Submitted inputs · Pass');
});

test('review bundles reopen as unverified history and require fresh execution', async ({ page }) => {
  await files(page); await page.locator('#review-run').click();
  await expect(page.locator('#review-status')).toContainText('Submitted inputs · Pass');
  const pending = page.waitForEvent('download'); await page.locator('#review-download-evidence').click();
  const raw = await readFile(await (await pending).path(), 'utf8');
  await files(page); await upload(page, raw); await page.locator('#workspace-replace').click();
  await expect(page.locator('#workspace-history')).toBeVisible();
  await expect(page.locator('#workspace-history summary')).toContainText('historical, unverified');
  await expect(page.locator('#workspace-recorded')).toHaveText(JSON.stringify(JSON.parse(raw).report, null, 2));
  await expect(page.locator('#review-decisions tbody tr')).toHaveCount(0);
  await expect(page.locator('#review-download-evidence')).toBeDisabled();
  await page.locator('#review-run').click(); await expect(page.locator('#review-status')).toContainText('Submitted inputs · Pass');
  await expect(page.locator('#review-decisions tbody tr')).toHaveCount(7);
});

test('invalid envelopes, duplicate fields, UTF-8 and byte limits never replace current work', async ({ page }) => {
  await files(page);
  const before = await page.locator('#source').inputValue();
  const draft = { format: 'wisp-browser-workspace-v1', approval: 'not_granted', applied: false, baseline: before, candidate: before, suite_json: '{}' };
  for (const raw of [
    JSON.stringify({ ...draft, applied: true }, null, 2),
    JSON.stringify({ ...draft, candidate: 'é'.repeat(32769) }, null, 2),
    JSON.stringify({ ...draft, candidate: '\ud800' }, null, 2),
    JSON.stringify({ ...draft, candidate: before + '\r\n' }, null, 2),
    JSON.stringify({ ...draft, baseline: before + '\r' }, null, 2),
    JSON.stringify({ ...draft, suite_json: '{\r\n"version": 1\r}' }, null, 2),
    JSON.stringify({ ...draft, executable: '/do/not/run' }, null, 2),
    JSON.stringify(draft, null, 2).replace('"applied": false', '"applied": true, "applied": false'),
    ' '.repeat(8 * 1024 * 1024 + 1),
    Buffer.from([0xc3, 0x28]),
  ]) {
    await upload(page, raw);
    await expect(page.locator('#workspace-status')).toContainText('Cannot open file');
    await expect(page.locator('#workspace-replace')).toBeDisabled();
    await expect(page.locator('#source')).toHaveValue(before);
  }
});

test('imported report claims and strings remain inert history; raw duplicate suite is not repaired', async ({ page }) => {
  await files(page);
  const source = 'fn f()->Int{1}';
  const suite = '{"version":1,"version":2,"target":"f","cases":[]}';
  const report = { status: 'Pass', approval: 'GRANTED', new_execution: true, note: '<img src=x onerror=alert(1)>' };
  await upload(page, JSON.stringify({ format: 'wisp-browser-review-v1', approval: 'not_granted', applied: false, baseline: source, candidate: source, suite_json: suite, report }, null, 2));
  await page.locator('#workspace-replace').click();
  await expect(page.locator('#workspace-recorded img')).toHaveCount(0);
  await expect(page.locator('#review-suite')).toHaveValue(suite);
  await expect(page.locator('#review-status')).toContainText('no current review');
  await page.locator('#review-run').click(); await expect(page.locator('#review-json')).toContainText('E_REVIEW_REQUEST');
  await expect(page.locator('#review-suite')).toHaveValue(suite);
});

test('a draft import cancels active review and cannot accept late responses', async ({ page }) => {
  await page.addInitScript(() => {
    window.Worker = class {
      postMessage(message) { window.lateReview = () => this.onmessage?.({ data: { id: message.id, report: { status: 'Pass' } } }); }
      terminate() {}
    };
  });
  await files(page); await page.locator('#review-run').click();
  await upload(page, JSON.stringify({ format: 'wisp-browser-workspace-v1', approval: 'not_granted', applied: false, baseline: 'fn f()->Int{1}', candidate: 'fn f()->Int{2}', suite_json: '{}' }, null, 2));
  await page.locator('#workspace-replace').click(); await page.evaluate(() => window.lateReview());
  await expect(page.locator('#source')).toHaveValue('fn f()->Int{2}');
  await expect(page.locator('#review-json')).toHaveText('');
  await expect(page.locator('#review-status')).toContainText('no current review');
  await expect(page.locator('#review-download-source')).toBeDisabled();
});
