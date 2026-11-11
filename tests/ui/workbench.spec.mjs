import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('workbench starts ready and downloads the exact reviewed code and evidence', async ({ page }) => {
  await page.goto('?workbench');
  await expect(page.getByRole('heading', { name: 'Change a rule. See the consequences.' })).toBeVisible();
  await expect(page.locator('#scenario-editor .scenario-card')).toHaveCount(7);
  await expect(page.locator('#review-download-source')).toBeDisabled();
  await page.locator('#review-run').click();
  await expect(page.locator('#review-status')).toContainText('Submitted inputs · Pass');
  await expect(page.locator('#review-decisions tbody tr')).toHaveCount(7);
  await expect(page.locator('#review-decisions')).toContainText('packs: "3"');
  const source = await page.locator('#source').inputValue();
  let pending = page.waitForEvent('download'); await page.locator('#review-download-source').click();
  const code = await pending; expect(code.suggestedFilename()).toBe('candidate.wisp');
  expect(await readFile(await code.path(), 'utf8')).toBe(source);
  pending = page.waitForEvent('download'); await page.locator('#review-download-evidence').click();
  const evidence = JSON.parse(await readFile(await (await pending).path(), 'utf8'));
  expect(evidence.candidate).toBe(source); expect(evidence.approval).toBe('not_granted'); expect(evidence.applied).toBe(false);
  expect(evidence.report.status).toBe('Pass'); expect(evidence.report.review.summary.attempted_invocations).toBe(14);
  expect(evidence.suite_json).toBe(await page.locator('#review-suite').inputValue());
  expect(evidence.baseline).toBe(await page.locator('#review-baseline').inputValue());
  await page.locator('#source').fill(source + '\n');
  await expect(page.locator('#review-download-source')).toBeDisabled();
  await expect(page.locator('#review-download-evidence')).toBeDisabled();
});

test('scenario forms preserve input strings and failed owner requirements', async ({ page }) => {
  await page.goto('?workbench');
  const card = page.locator('.scenario-card').filter({ has: page.locator('summary', { hasText: /^exact-pack$/ }) });
  await card.locator('summary').click();
  await card.getByLabel('Required: packs', { exact: true }).fill('999');
  await page.locator('#review-run').click();
  await expect(page.locator('#review-status')).toContainText('Submitted inputs · Fail');
  expect(JSON.parse(await page.locator('#review-suite').inputValue()).cases[0].expect.result.value.packs).toBe('999');
  await expect(page.locator('#review-decisions tbody tr').first()).toContainText('Fail');
  await card.getByLabel('quantity', { exact: true }).fill('9223372036854775807');
  await expect(page.locator('#review-download-source')).toBeDisabled();
  expect(JSON.parse(await page.locator('#review-suite').inputValue()).cases[0].args[0].quantity).toBe('9223372036854775807');
  await expect(page.locator('#review-status')).toContainText('Historical review');
});

test('custom suites stay available without reservation form coercion', async ({ page }) => {
  await page.goto('?workbench');
  await page.locator('summary').filter({ hasText: 'Advanced: edit' }).click();
  await page.locator('#source').fill('fn f(x: String)->String{x}');
  await page.locator('#review-capture').click();
  const value = '<img src=x onerror=alert(1)>😀';
  const suite = JSON.stringify({ version: 1, target: 'f', cases: [{ id: 'literal', args: [value], expect: { result: { type: 'String', value }, output: '' } }] });
  await page.locator('#review-suite').fill(suite); await page.locator('#review-suite').dispatchEvent('change');
  await expect(page.locator('#scenario-editor')).toContainText('Custom or incomplete suite');
  await page.locator('#review-run').click(); await expect(page.locator('#review-status')).toContainText('Submitted inputs · Pass');
  await expect(page.locator('#review-decisions img')).toHaveCount(0);
  await expect(page.locator('#review-decisions')).toContainText(value);
  await expect(page.locator('#review-suite')).toHaveValue(suite);
});

test('duplicate requirements remain raw and cannot be repaired by scenario forms', async ({ page }) => {
  await page.goto('?workbench');
  await page.locator('summary').filter({ hasText: 'Advanced: edit' }).click();
  const raw = (await page.locator('#review-suite').inputValue()).replace('"packs": "2"', '"packs": "999", "packs": "2"');
  await page.locator('#review-suite').fill(raw); await page.locator('#review-suite').dispatchEvent('change');
  await expect(page.locator('#scenario-editor .scenario-card')).toHaveCount(0);
  await page.locator('#review-run').click(); await expect(page.locator('#review-status')).toContainText('Error');
  await expect(page.locator('#review-suite')).toHaveValue(raw);
});
