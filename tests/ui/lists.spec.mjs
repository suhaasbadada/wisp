import { test, expect } from '@playwright/test';

async function observe(page) {
  await page.addInitScript(() => {
    const Native = window.Worker; window.listReports = []; window.executionOps = [];
    window.Worker = class extends Native {
      constructor(...args) { super(...args); this.addEventListener('message', e => { if (e.data.report) window.listReports.push(e.data.report); }); }
      postMessage(message, ...rest) {
        const request = message.requestJson ? JSON.parse(message.requestJson) : message.request;
        if (['run', 'call', 'review'].includes(request?.op)) window.executionOps.push(request.op);
        super.postMessage(message, ...rest);
      }
    };
  });
}
async function starter(page) {
  await page.goto('#playground'); await page.locator('#example').selectOption('invoice-batch');
  await expect(page.locator('#diagnostics')).toContainText('Checked by Rust');
  await expect(page.locator('#call-target')).toHaveValue('reconcile');
}

test('batch starter loads without execution and exposes a real discrepancy through Run and Invoke', async ({ page }) => {
  await observe(page); await starter(page);
  expect(await page.evaluate(() => window.executionOps)).toEqual([]);
  await expect(page.locator('#filename')).toHaveText('invoice-batch.wisp · editable');
  await page.locator('#invoke').click(); await expect(page.locator('#run-status')).toHaveText('CALL COMPLETE');
  expect(JSON.parse(await page.locator('#call-result').textContent()).value).toEqual({
    line_count: '3', computed_cents: '1500', declared_cents: '1490', mismatched_lines: '1',
    first_mismatched_index: '1', invalid_lines: '0', first_invalid_index: '-1', payment_cents: '1500', payment_difference_cents: '0', balanced: false,
  });
  await expect(page.locator('#output')).toContainText('top-level statements skipped');
  await page.locator('#run').click(); await expect(page.locator('#run-status')).toHaveText('COMPLETE');
  await expect(page.locator('#output')).toContainText('declared_cents: 1490, mismatched_lines: 1');
  await expect(page.locator('#output')).toContainText('first_mismatched_index: 1, invalid_lines: 0, first_invalid_index: -1');
  await expect(page.locator('#output')).toContainText('balanced: false');
  expect(await page.evaluate(() => window.executionOps)).toEqual(['call', 'run']);
});

test('200-row typed batch completes and malformed last element prevents execution', async ({ page }) => {
  await observe(page); await starter(page);
  const rows = Array.from({ length: 200 }, (_, i) => ({ quantity: String(i % 7 + 1), unit_cents: String(100 + i * 3), declared_cents: String(BigInt(i % 7 + 1) * BigInt(100 + i * 3)) }));
  // Independently worked sum of the 200 integer line products is 317012 cents.
  rows[99].declared_cents = String(BigInt(rows[99].declared_cents) + 1n);
  await page.locator('#call-args').fill(JSON.stringify([rows, '317012']));
  await page.locator('#invoke').click(); await expect(page.locator('#run-status')).toHaveText('CALL COMPLETE');
  const result = JSON.parse(await page.locator('#call-result').textContent()).value;
  expect(result).toEqual({ line_count: '200', computed_cents: '317012', declared_cents: '317013', mismatched_lines: '1', first_mismatched_index: '99', invalid_lines: '0', first_invalid_index: '-1', payment_cents: '317012', payment_difference_cents: '0', balanced: false });
  rows[199].quantity = 1;
  await page.locator('#call-args').fill(JSON.stringify([rows, '317012'])); await page.locator('#invoke').click();
  await expect(page.locator('#run-status')).toHaveText('CALL ERROR');
  const report = await page.evaluate(() => window.listReports.findLast(r => r.invocation?.target === 'reconcile'));
  expect(report.invocation.new_execution).toBe(false); expect(report.result).toBeUndefined();
  expect(report.diagnostics[0].path).toBe('/args/0/199/quantity');
});

test('signed and very large list indices fail with bounded native errors', async ({ page }) => {
  await observe(page); await page.goto('#playground');
  await page.locator('#source').fill('fn at(xs:[Int], index:Int)->Int {xs[index]}');
  await expect(page.locator('#call-target')).toHaveValue('at');
  for (const index of ['-1', '9223372036854775807']) {
    await page.locator('#call-args').fill(JSON.stringify([['8'], index])); await page.locator('#invoke').click();
    await expect(page.locator('#run-status')).toHaveText('CALL ERROR');
    const report = await page.evaluate(() => window.listReports.findLast(r => r.invocation?.target === 'at'));
    expect(report.diagnostics[0].code).toBe('E_INDEX_BOUNDS'); expect(report.result).toBeUndefined();
  }
});

test('list reviews retain native JSON while unsupported builder and projection fail closed', async ({ page }) => {
  await observe(page); await page.goto('?workbench');
  await page.locator('#source').fill('fn f(xs:[Int])->[Int] {xs}'); await page.locator('#review-capture').click();
  const suite = JSON.stringify({ version: 1, target: 'f', cases: [{ id: 'list', args: [['1']], expect: { result: { type: '[Int]', value: ['1'] }, output: '' } }] }, null, 2);
  await page.locator('#review-suite').evaluate((node, raw) => { node.value = raw; node.dispatchEvent(new Event('input')); }, suite);
  await page.locator('#review-run').click(); await expect(page.locator('#review-status')).toContainText('Submitted inputs · Pass');
  const report = JSON.parse(await page.locator('#review-json').textContent());
  expect(report.review.cases[0].after.result).toEqual({ type: '[Int]', value: ['1'] });
  await page.locator('.observed-value-changes').first().locator('summary').click();
  await expect(page.locator('.observed-value-changes').first()).toContainText('List-valued differences are not expanded');
  await page.locator('#new-scenario > summary').click(); await page.locator('#scenario-read').click();
  await expect(page.locator('#scenario-build-status')).toContainText('Metadata Ready');
  await page.locator('#scenario-function').selectOption({ label: 'f' });
  await expect(page.locator('#scenario-build-status')).toContainText('Use the raw scenario JSON editor');
  await expect(page.locator('#scenario-add')).toBeDisabled(); await expect(page.locator('#review-suite')).toHaveValue(suite);
  expect(JSON.parse(await page.locator('#review-json').textContent())).toEqual(report);
});
