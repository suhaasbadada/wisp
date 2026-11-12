import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

test('typed invoice executes real WASM and exposes record context', async ({ page }) => {
  await page.goto('');
  await page.locator('#example').selectOption('invoice');
  await expect(page.locator('#agent-text')).toContainText('record Invoice');
  await expect(page.locator('#filename')).toHaveText('invoice.wisp · editable');
  await page.locator('#run').click();
  await expect(page.locator('#run-status')).toHaveText('COMPLETE');
  await expect(page.locator('#output')).toHaveText('Invoice { item: Item { quantity: 9, unit_price: 100 }, customer: "Ada" }\n900\n');
  await expect(page.locator('#evidence')).toContainText('Clear · 21 completed cases');
  const metadata = JSON.parse(await page.locator('#graph').textContent());
  expect(metadata.compiler).toBe('wisp-0.1.0-semantics-6');
  expect(metadata.graph.records.map(record => record.name)).toEqual(['Invoice', 'Item']);
  await page.locator('#budget').fill('20');
  await expect(page.locator('#agent-budget')).toContainText('OVERFLOW');
  await expect(page.locator('#omissions')).toContainText('record');
});

test('record projection and recursive-type errors are live diagnostics', async ({ page }) => {
  await page.goto('');
  await page.locator('#source').fill('record A { n: Int } print(new A { n: 1 }.missing);');
  await expect(page.locator('#diagnostics')).toContainText('unknown field');
  await page.locator('#source').fill('record A { b: B } record B { a: A } print(1);');
  await expect(page.locator('#diagnostics')).toContainText('recursive');
  await page.locator('#run').click();
  await expect(page.locator('#run-status')).toHaveText('ERROR');
  await expect(page.locator('#output')).not.toContainText('1\n');
});

test('old compiler artifacts reject before execution with visible compatibility notice', async ({ page }, info) => {
  const output = info.outputPath('new-records-compiler.json');
  const archive = spawnSync('./target/debug/wisp', ['archive', 'examples/snacks.wisp', '--out', output], { encoding: 'utf8' });
  expect(archive.status).toBe(0);
  const artifact = { ...JSON.parse(readFileSync(output, 'utf8')), compiler: 'wisp-0.1.0-semantics-4' };
  await page.goto('');
  await expect(page.locator('#artifact-privacy')).toContainText('older-compiler artifacts are unsupported');
  await page.locator('#artifact-file').setInputFiles({ name: 'older-compiler.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(artifact)) });
  await expect(page.locator('#artifact-status')).toContainText('unsupported artifact');
  await expect(page.locator('.ghost-card')).toHaveCount(0);
});
