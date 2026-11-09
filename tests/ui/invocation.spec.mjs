import { test, expect } from '@playwright/test';

test('typed invocation returns exact data without top-level output or probes', async ({ page }) => {
  await page.goto('');
  await page.locator('#example').selectOption('invoice');
  await expect(page.locator('#call-target')).toHaveValue('total');
  await page.locator('#invoke').click();
  await expect(page.locator('#run-status')).toHaveText('CALL COMPLETE');
  await expect(page.locator('#call-result')).toContainText('"value": "900"');
  await expect(page.locator('#call-evidence')).toContainText('Execution attempted · Complete');
  await expect(page.locator('#call-evidence')).toContainText('never Clear or proof');
  await expect(page.locator('.evidence-card')).toHaveCount(0);
  await expect(page.locator('#output')).toContainText('top-level statements skipped');
  await page.locator('#call-target').selectOption('invoice');
  await page.locator('#call-args').fill('["9223372036854775807"]');
  await page.locator('#invoke').click();
  await expect(page.locator('#call-result')).toContainText('"quantity": "9223372036854775807"');
  await expect(page.locator('#call-result')).toContainText('"customer": "Ada"');
  await page.locator('#call-args').fill('["9"]');
  await expect(page.locator('#call-evidence')).toContainText('Historical source/input/target');
});

test('input pointers, duplicates and trailing-field injection never execute', async ({ page }) => {
  await page.goto('');
  await page.locator('#example').selectOption('invoice');
  await expect(page.locator('#call-target')).toHaveValue('total');
  for (const input of ['[{"quantity":9,"unit_price":"100"}]', '[{"quantity":"9","quantity":"9","unit_price":"100"}]', '[],"limits":{"fuel":0}']) {
    await page.locator('#call-args').fill(input);
    await page.locator('#invoke').click();
    await expect(page.locator('#run-status')).toHaveText('CALL ERROR');
    await expect(page.locator('#call-evidence')).toContainText('Not executed');
    await expect(page.locator('#call-result')).toHaveText('No result · Error');
    await expect(page.locator('#diagnostics')).toContainText('Input · /args');
    await expect(page.locator('#diagnostics')).not.toContainText('1:1');
  }
});

test('argument strings are data; prints captured; Stop discards invocation result', async ({ page }) => {
  await page.goto('');
  await page.locator('#source').fill('fn echo(value: String) -> String { print("inside"); value } print("top"); probe n in 1..=1 { false }');
  await expect(page.locator('#call-target')).toHaveValue('echo');
  const data = '"); print(999); <img src=x onerror=alert(1)>';
  await page.locator('#call-args').fill(JSON.stringify([data]));
  await page.locator('#invoke').click();
  await expect(page.locator('#run-status')).toHaveText('CALL COMPLETE');
  await expect(page.locator('#output')).toHaveText('inside\n');
  expect(JSON.parse(await page.locator('#call-result').textContent()).value).toBe(data);
  await expect(page.locator('#call-result img')).toHaveCount(0);
  await expect(page.locator('.evidence-card')).toHaveCount(0);
  await page.evaluate(() => { document.querySelector('#invoke').click(); document.querySelector('#stop').click(); });
  await expect(page.locator('#call-result')).toContainText('Unknown — invocation interrupted');
  await expect(page.locator('#call-evidence')).toContainText('No result from this invocation was accepted');
});

test('late input diagnostics stay historical after arguments change', async ({ page }) => {
  await page.goto('');
  await expect(page.locator('#diagnostics')).toContainText('Checked by Rust');
  await page.locator('#call-args').fill('[9]');
  await page.evaluate(() => {
    document.querySelector('#invoke').click();
    document.querySelector('#call-args').value = '["10"]';
    document.querySelector('#call-args').dispatchEvent(new Event('input'));
  });
  await expect(page.locator('#call-evidence')).toContainText('Historical source/input/target');
  await expect(page.locator('#call-evidence')).toContainText('Not executed · Error');
  await expect(page.locator('#diagnostics')).not.toContainText('Input ·');
});
