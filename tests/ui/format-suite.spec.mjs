import { test, expect } from '@playwright/test';

const suite = { version: 1, target: 'f', cases: [{ id: 'own', args: ['1'], expect: { result: { type: 'Int', value: '3' }, output: '' } }] };
async function load(page, raw, source = 'fn f(n:Int)->Int{n+2}') {
  await page.goto('?workbench');
  const file = (name, text) => ({ name, mimeType: 'text/plain', buffer: Buffer.from(text) });
  await page.locator('#policy-files-baseline').setInputFiles(file('before.wisp', source));
  await page.locator('#policy-files-suite').setInputFiles(file('cases.json', raw));
  await page.locator('#policy-files-open').click();
  await expect(page.locator('#policy-files-status')).toContainText('Files opened');
}

test('compact validated suite becomes editable forms only after explicit format; history retains original bytes', async ({ page }) => {
  const raw = JSON.stringify(suite); await load(page, raw);
  await expect(page.locator('#scenario-editor .scenario-card')).toHaveCount(0);
  await expect(page.locator('#review-format-suite')).toBeDisabled();
  await page.locator('#review-run').click(); await expect(page.locator('#review-status')).toContainText('Submitted inputs · Pass');
  const native = await page.locator('#review-json').textContent();
  await expect(page.locator('#review-suite')).toHaveValue(raw);
  await expect(page.locator('#review-format-suite')).toBeEnabled();
  await page.locator('#review-format-suite').click();
  await expect(page.locator('#review-suite')).toHaveValue(JSON.stringify(suite, null, 2));
  await expect(page.locator('.scenario-card')).toHaveCount(1);
  await expect(page.locator('#review-status')).toContainText('Historical review');
  await expect(page.locator('#review-json')).toHaveText(native);
  await expect(page.locator('#review-download-source')).toBeDisabled();
  await expect(page.locator('#review-format-suite')).toBeDisabled();
  await page.locator('#review-run').click(); await expect(page.locator('#review-status')).toContainText('Submitted inputs · Pass');
  await expect(page.locator('#review-download-source')).toBeEnabled();
});

test('duplicate, malformed or typed-invalid suites cannot be formatted or repaired', async ({ page }) => {
  for (const raw of [JSON.stringify(suite).replace('"version":1', '"version":1,"ver\\u0073ion":1'), '{"version":', JSON.stringify({ ...suite, cases: [{ ...suite.cases[0], args: [1] }] })]) {
    await load(page, raw); await page.locator('#review-run').click();
    await expect(page.locator('#review-status')).toContainText(/Error|error/);
    await expect(page.locator('#review-format-suite')).toBeDisabled();
    await expect(page.locator('#review-suite')).toHaveValue(raw);
  }
});

test('format permission expires on input edit-and-revert, replacement and imported history', async ({ page }) => {
  const raw = JSON.stringify(suite); await load(page, raw);
  await page.locator('#review-run').click(); await expect(page.locator('#review-format-suite')).toBeEnabled();
  const source = await page.locator('#source').inputValue();
  await page.locator('#source').fill(source + ' '); await page.locator('#source').fill(source);
  await expect(page.locator('#review-format-suite')).toBeDisabled();
  await page.locator('#review-run').click(); await expect(page.locator('#review-format-suite')).toBeEnabled();
  const report = JSON.parse(await page.locator('#review-json').textContent());
  await page.locator('#review-example').click(); await expect(page.locator('#review-format-suite')).toBeDisabled();
  await expect(page.locator('#review-status')).toContainText('Historical review');
  await page.locator('summary').filter({ hasText: 'Save or reopen your workspace' }).click();
  const bundle = JSON.stringify({ format: 'wisp-browser-review-v1', approval: 'not_granted', applied: false, baseline: source, candidate: source, suite_json: raw, report }, null, 2);
  await page.locator('#workspace-file').setInputFiles({ name: 'review.json', mimeType: 'application/json', buffer: Buffer.from(bundle) });
  await expect(page.locator('#workspace-replace')).toBeEnabled(); await page.locator('#workspace-replace').click();
  await expect(page.locator('#workspace-history')).toBeVisible();
  await expect(page.locator('#review-format-suite')).toBeDisabled();
});

test('format preserves failed owner requirements and never derives them from observations', async ({ page }) => {
  const failed = structuredClone(suite); failed.cases[0].expect.result.value = '999';
  await load(page, JSON.stringify(failed)); await page.locator('#review-run').click();
  await expect(page.locator('#review-status')).toContainText('Submitted inputs · Fail');
  await page.locator('#review-format-suite').click();
  expect(JSON.parse(await page.locator('#review-suite').inputValue())).toEqual(failed);
  await page.locator('#review-run').click(); await expect(page.locator('#review-status')).toContainText('Submitted inputs · Fail');
  expect(JSON.parse(await page.locator('#review-suite').inputValue()).cases[0].expect.result.value).toBe('999');
});
