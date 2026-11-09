import { test, expect } from '@playwright/test';

test('atomic context budget and scope ledger never overwrite execution evidence', async ({ page }) => {
  await page.goto('');
  await expect(page.locator('#context-query')).toBeEnabled();
  await page.locator('#run').click();
  await expect(page.locator('#run-status')).toHaveText('FAIL');
  await page.locator('#context-budget').fill('0');
  await page.locator('#context-query').click();
  await expect(page.locator('#context-status')).toContainText('Ready — submitted inputs');
  await expect(page.locator('#context-accounting')).toContainText('0 included');
  await expect(page.locator('#context-accounting')).toContainText('OVERFLOW');
  await expect(page.locator('#context-text')).toHaveText('');
  await expect(page.locator('#context-ledger')).toContainText('budget_exceeded');
  await expect(page.locator('#context-ledger')).toContainText('after_budget_stop');
  await expect(page.locator('#run-status')).toHaveText('FAIL');
  await expect(page.locator('#output')).toHaveText('900\n');
  await expect(page.locator('.ghost-card')).toContainText('input 9');
  await page.locator('#context-budget').fill('4096');
  await expect(page.locator('#context-status')).toContainText('Historical query');
  await page.locator('#context-query').click();
  await expect(page.locator('#context-accounting')).toContainText('All eligible chunks fit; scope omissions still apply');
  await expect(page.locator('#context-text')).toContainText('probe n in 1..=11');
  await expect(page.locator('#context-text')).toContainText('fn bill');
  const report = JSON.parse(await page.locator('#context-json').textContent());
  expect(report.new_execution).toBe(false); expect(report.probes).toEqual([]); expect(report.usage).toBeUndefined();
  expect(Buffer.byteLength(report.context.text)).toBe(report.context.used_bytes);
  expect(report.context.observations).toEqual([]); expect(report.context.proofs).toEqual([]);
  expect(report.context.scope_omissions.some(entry => entry.kind === 'top_level_statement')).toBeTruthy();
});

test('selector changes preserve historical identity and disclose prelude/outside closure', async ({ page }) => {
  await page.goto('');
  await page.locator('#source').fill('fn label() -> Int { 1 } fn helper(n: Int) -> Int { n + 1 } fn bill(n: Int) -> Int { helper(n) } print(label()); probe n in 1..=2 { bill(n) > n } probe n in 1..=2 { true }');
  await expect(page.locator('#context-query')).toBeEnabled();
  await page.locator('#context-query').click();
  await expect(page.locator('#context-ledger')).toContainText('function:label');
  await expect(page.locator('#context-ledger')).toContainText('outside_scope');
  await expect(page.locator('#context-text')).not.toContainText('print(label())');
  const first = JSON.parse(await page.locator('#context-json').textContent());
  expect(first.context.selected_probe.index).toBe(0);
  expect(first.context.scope_omissions.some(entry => entry.relation === 'following' && entry.affects_selected_run_key === false)).toBeTruthy();
  await page.locator('#context-selector').selectOption('probe:1');
  await expect(page.locator('#context-status')).toContainText('Historical query');
  await page.locator('#context-query').click();
  await expect(page.locator('#context-status')).toContainText('Ready — submitted inputs');
  const second = JSON.parse(await page.locator('#context-json').textContent());
  expect(second.context.query_key).not.toBe(first.context.query_key);
  expect(second.context.selected_probe.index).toBe(1);
  expect(second.context.scope_omissions.some(entry => entry.relation === 'preceding' && entry.affects_selected_run_key === true)).toBeTruthy();
  await page.locator('#source').fill('probe n in 1..=1 { true }');
  await expect(page.locator('#context-status')).toContainText('Historical query');
});

test('query cancellation excludes late replies and hostile source remains text', async ({ page }) => {
  await page.goto('');
  await expect(page.locator('#context-query')).toBeEnabled();
  await page.evaluate(() => { document.querySelector('#context-query').click(); document.querySelector('#context-stop').click(); });
  await expect(page.locator('#context-status')).toContainText('Unknown — stopped');
  await expect(page.locator('#context-json')).toHaveText('');
  await page.evaluate(() => {
    document.querySelector('#context-query').click();
    document.querySelector('#context-budget').value = '20';
    document.querySelector('#context-budget').dispatchEvent(new Event('input'));
  });
  await expect(page.locator('#context-status')).toContainText('query inputs changed');
  await expect(page.locator('#context-json')).toHaveText('');
  await page.locator('#source').fill('fn label() -> String { "é😀<img src=x onerror=alert(1)>" } probe n in 1..=1 { label() == label() }');
  await page.locator('#context-budget').fill('4096');
  await expect(page.locator('#context-query')).toBeEnabled();
  await page.locator('#context-query').click();
  await expect(page.locator('#context-text')).toContainText('<img src=x onerror=alert(1)>');
  await expect(page.locator('#context-text img')).toHaveCount(0);
  await expect(page.locator('#output')).toHaveText('The bureau is open. Run the program.');
  const report = JSON.parse(await page.locator('#context-json').textContent());
  expect(Buffer.byteLength(report.context.text)).toBe(report.context.used_bytes);
});
