import { test, expect } from '@playwright/test';

async function openEdit(page) {
  await page.goto('');
  await page.locator('#edit-panel > summary').click();
  await expect(page.locator('#edit-load')).toBeEnabled();
}

test('preview leaves evidence/source untouched; explicit Apply is one-use and never runs', async ({ page }) => {
  await openEdit(page);
  const baseline = await page.locator('#source').inputValue();
  await page.locator('#run').click();
  await expect(page.locator('#run-status')).toHaveText('FAIL');
  await expect(page.locator('#edit-load')).toBeEnabled();
  await page.locator('#edit-load').click();
  await page.locator('#edit-replacement').fill('{ snacks * 100 }');
  await page.locator('#edit-preview').click();
  await expect(page.locator('#edit-apply')).toBeEnabled();
  await expect(page.locator('#source')).toHaveValue(baseline);
  await expect(page.locator('#run-status')).toHaveText('FAIL');
  await expect(page.locator('#output')).toHaveText('900\n');
  const report = JSON.parse(await page.locator('#edit-json').textContent());
  expect(report.new_execution).toBe(false); expect(report.probes).toEqual([]);
  expect(report.edit.preservation.probes).toHaveLength(1);
  await page.locator('#edit-apply').click();
  await expect(page.locator('#source')).toHaveValue(report.edit.source);
  await expect(page.locator('#edit-apply')).toBeDisabled();
  await expect(page.locator('#output')).toHaveText('900\n');
  await expect(page.locator('.ghost-card')).toContainText('input 9');
  await expect(page.locator('#edit-status')).toContainText('No execution ran');
  await page.locator('#run').click();
  await expect(page.locator('#run-status')).toHaveText('COMPLETE');
  await expect(page.locator('#evidence')).toContainText('Clear');
});

test('source/replacement edit-and-revert and target changes permanently invalidate preparation', async ({ page }) => {
  await openEdit(page);
  await page.locator('#source').fill('fn a(n:Int)->Int{n} fn b(n:Int)->Int{n+1} probe n in 1..=1 {a(n)==n}');
  await expect(page.locator('#edit-load')).toBeEnabled();
  await page.locator('#edit-target').selectOption('a');
  await page.locator('#edit-replacement').fill('{ n + 0 }');
  const preview = async () => { await page.locator('#edit-preview').click(); await expect(page.locator('#edit-apply')).toBeEnabled(); };
  await preview();
  await page.locator('#edit-replacement').fill('{ n }');
  await page.locator('#edit-replacement').fill('{ n + 0 }');
  await expect(page.locator('#edit-apply')).toBeDisabled();
  await preview();
  await page.locator('#edit-target').selectOption('b');
  await page.locator('#edit-target').selectOption('a');
  await expect(page.locator('#edit-apply')).toBeDisabled();
  await preview();
  const baseline = await page.locator('#source').inputValue();
  await page.locator('#source').fill(baseline + '\n');
  await page.locator('#source').fill(baseline);
  await expect(page.locator('#edit-load')).toBeEnabled();
  await expect(page.locator('#edit-apply')).toBeDisabled();
  await expect(page.locator('#edit-status')).toContainText('Stale preview');
});

test('Unicode boundaries, rejection provenance and outer-comment injection remain explicit', async ({ page }) => {
  await openEdit(page);
  const baseline = 'fn label()->String{"é😀"} fn a(n:Int)->Int{n} probe n in 1..=1 {a(n)==n}';
  await page.locator('#source').fill(baseline);
  await expect(page.locator('#edit-load')).toBeEnabled();
  await page.locator('#edit-target').selectOption('a');
  await page.locator('#edit-replacement').fill('{ "bad" }');
  await page.locator('#edit-preview').click();
  await expect(page.locator('#edit-status')).toContainText('preparation not accepted');
  const rejected = JSON.parse(await page.locator('#edit-json').textContent());
  expect(rejected.diagnostics[0].code).toBe('E_EDIT_CANDIDATE');
  expect(rejected.edit.rejected_candidate.document).toBe('candidate');
  expect(rejected.edit.source).toBeUndefined();
  await expect(page.locator('#source')).toHaveValue(baseline);
  await page.locator('#edit-replacement').fill('{ n } // swallow preserved suffix');
  await page.locator('#edit-preview').click();
  await expect(page.locator('#edit-json')).toContainText('E_EDIT_REPLACEMENT');
  await expect(page.locator('#edit-apply')).toBeDisabled();
  await page.locator('#edit-replacement').fill(' \n{ // é😀<img src=x onerror=alert(1)>\n n + 0 }\n ');
  await page.locator('#edit-preview').click();
  await expect(page.locator('#edit-apply')).toBeEnabled();
  await expect(page.locator('#edit-after img')).toHaveCount(0);
  await page.locator('#edit-apply').click();
  await expect(page.locator('#source')).toHaveValue('fn label()->String{"é😀"} fn a(n:Int)->Int \n{ // é😀<img src=x onerror=alert(1)>\n n + 0 }\n  probe n in 1..=1 {a(n)==n}');
});

test('Stop and input cancellation reject late preview replies', async ({ page }) => {
  await openEdit(page);
  await page.locator('#edit-load').click();
  await page.evaluate(() => { document.querySelector('#edit-preview').click(); document.querySelector('#edit-stop').click(); });
  await expect(page.locator('#edit-status')).toContainText('Unknown — stopped');
  await expect(page.locator('#edit-apply')).toBeDisabled();
  await page.evaluate(() => {
    document.querySelector('#edit-preview').click();
    document.querySelector('#edit-replacement').dispatchEvent(new Event('input'));
  });
  await expect(page.locator('#edit-status')).toContainText('preview cancelled');
  await expect(page.locator('#edit-apply')).toBeDisabled();
  await expect(page.locator('#edit-json')).toHaveText('');
});
