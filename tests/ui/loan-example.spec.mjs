import { test, expect } from '@playwright/test';

const loan = { principal: '30000000', annual_bps: '600', payment: '179865', extra: '0', months: '360' };
const output = 'Summary { months_elapsed: 360, balance: 144, total_paid: 64751400, total_interest: 34751544, valid: true }\n';

async function selectLoan(page) {
  await page.goto('#playground');
  await page.locator('#example').selectOption('loan');
  await expect(page.locator('#diagnostics')).toContainText('Checked by Rust');
  await expect(page.locator('#call-target option[value="simulate"]')).toHaveCount(1);
}

test('loan selection checks without executing; explicit Run completes in WASM', async ({ page }) => {
  await page.addInitScript(() => {
    const Native = window.Worker; window.executionOps = [];
    window.Worker = class extends Native {
      postMessage(message, ...rest) {
        const request = message.requestJson ? JSON.parse(message.requestJson) : message.request;
        if (['run', 'call'].includes(request?.op)) window.executionOps.push(request.op);
        super.postMessage(message, ...rest);
      }
    };
  });
  await page.goto('#playground');
  const priorStatus = await page.locator('#run-status').textContent();
  const priorOutput = await page.locator('#output').textContent();
  await page.locator('#example').selectOption('loan');
  await expect(page.locator('#diagnostics')).toContainText('Checked by Rust');
  await expect(page.locator('#filename')).toHaveText('loan.wisp · editable');
  await expect(page.locator('#example option')).toHaveText([
    'Goblin Snack Bureau', 'Snack Bureau — proposed repair', 'Inventory reorder',
    'Typed invoice records', 'Loan repayment (360 months)', 'Invoice batch reconciliation',
  ]);
  await expect(page.locator('#run-status')).toHaveText(priorStatus);
  await expect(page.locator('#output')).toHaveText(priorOutput);
  await expect(page.locator('#call-result')).toHaveText('No invocation yet.');
  expect(await page.evaluate(() => window.executionOps)).toEqual([]);
  await page.locator('#run').click();
  await expect(page.locator('#run-status')).toHaveText('COMPLETE');
  await expect(page.locator('#output')).toHaveText(output);
  await expect(page.locator('#evidence')).toContainText('No probe evidence produced by this execution');
  await expect(page.locator('.ghost-card')).toHaveCount(0);
  expect(await page.evaluate(() => window.executionOps)).toEqual(['run']);
});

test('manual simulate invocation returns the extra-payment summary without top-level output', async ({ page }) => {
  await selectLoan(page);
  await page.locator('#call-target').selectOption('simulate');
  await expect(page.locator('#call-args')).toHaveValue(JSON.stringify([loan]));
  await page.locator('#call-args').fill(JSON.stringify([{ ...loan, extra: '20000' }]));
  await expect(page.locator('#call-result')).toHaveText('No invocation yet.');
  await page.locator('#invoke').click();
  await expect(page.locator('#run-status')).toHaveText('CALL COMPLETE');
  // Independently checked using evaluation/loan-dogfood/reference.py (Decimal).
  expect(JSON.parse(await page.locator('#call-result').textContent())).toEqual({
    type: 'Summary', value: { months_elapsed: '279', balance: '0', total_paid: '55634157', total_interest: '25634157', valid: true },
  });
  await expect(page.locator('#output')).toContainText('No captured function output; top-level statements skipped');
  await expect(page.locator('#call-evidence')).toContainText('Execution attempted · Complete');
});

test('source metadata refresh preserves manual loan inputs; selecting another example resets as before', async ({ page }) => {
  await selectLoan(page);
  await page.locator('#call-target').selectOption('simulate');
  const args = JSON.stringify([{ ...loan, extra: '20000' }]);
  await page.locator('#call-args').fill(args);
  const source = await page.locator('#source').inputValue();
  for (const edit of [`${source}\n// Manual edit\n`, source]) {
    await page.locator('#source').fill(edit);
    await expect(page.locator('#diagnostics')).toContainText('Checked by Rust');
    await expect(page.locator('#call-target')).toHaveValue('simulate');
    await expect(page.locator('#call-args')).toHaveValue(args);
  }
  await page.locator('#example').selectOption('invoice');
  await expect(page.locator('#call-target')).toHaveValue('total');
  await expect(page.locator('#call-args')).toHaveValue('[{"quantity":"9","unit_price":"100"}]');
});
