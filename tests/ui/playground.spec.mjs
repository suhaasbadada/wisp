import { test, expect } from '@playwright/test';

test('real WASM failure, historical ghost, repair, full finite probe and replay', async ({ page }) => {
  await page.goto('');
  await expect(page.locator('#diagnostics')).toContainText('Checked by Rust');
  await page.locator('#run').click();
  await expect(page.locator('#run-status')).toHaveText('FAIL');
  await expect(page.locator('#output')).toHaveText('900\n');
  await expect(page.locator('#evidence')).toContainText('failing input 9');
  await page.locator('#example').selectOption('repaired');
  await expect(page.locator('#revision')).toContainText('Historical');
  await expect(page.locator('#diagnostics')).toContainText('Checked by Rust');
  await page.getByRole('button', { name: 'Replay input 9' }).click();
  await expect(page.locator('#output')).toContainText('Replay input 9: Pass');
  await expect(page.locator('#evidence')).toContainText('A passing replay is not a Clear probe');
  await page.locator('#run').click();
  await expect(page.locator('#run-status')).toHaveText('COMPLETE');
  await expect(page.locator('#evidence')).toContainText('Clear · 11 completed cases');
  await expect(page.locator('#evidence')).toContainText('Ghost · input 9');
  await page.locator('#budget').fill('10');
  await expect(page.locator('#agent-budget')).toContainText('OVERFLOW');
});

test('live syntax diagnostics, runtime errors, untrusted output and stop', async ({ page }) => {
  await page.goto('');
  await page.locator('#source').fill('print(@);');
  await expect(page.locator('#diagnostics')).toContainText('Syntax');
  await page.locator('#source').fill('print(1 / 0);');
  await expect(page.locator('#diagnostics')).toContainText('Checked by Rust');
  await page.locator('#run').click();
  await expect(page.locator('#run-status')).toHaveText('ERROR');
  await expect(page.locator('#diagnostics')).toContainText('Runtime');
  await page.locator('#source').fill('print("<img src=x onerror=alert(1)>");');
  await page.locator('#run').click();
  await expect(page.locator('#output')).toContainText('<img src=x onerror=alert(1)>');
  await expect(page.locator('#output img')).toHaveCount(0);
  // Hold worker delivery, not the compiler: verify hard host cancellation and no late result.
  await page.route('**/*worker*.js', route => route.abort());
  await page.evaluate(() => { document.querySelector('#run').click(); document.querySelector('#stop').click(); });
  await expect(page.locator('#run-status')).toHaveText('UNKNOWN');
  await expect(page.locator('#activity')).toContainText('worker terminated');
  await expect(page.locator('#output')).toContainText('No result from this execution is counted as passing');
});

test('docs default Agent and preserve only explicit Human choice', async ({ page }) => {
  await page.goto('documentation/');
  await expect(page.getByRole('button', { name: 'Agent', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#agent-docs')).toBeVisible();
  await expect(page.locator('#human-docs')).toBeHidden();
  await page.getByRole('button', { name: 'Human', exact: true }).click();
  await page.reload();
  await expect(page.locator('#human-docs')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Human', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Agent', exact: true }).click();
  await expect(page.locator('#language-contract')).toContainText('checked');
  const raw = await page.request.get('/wisp/Docs/Protocol.md');
  expect(raw.ok()).toBeTruthy();
});

test('mobile workspace fits and has usable controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.locator('#run').click();
  await expect(page.locator('#evidence')).toContainText('failing input 9');
  await page.getByRole('link', { name: 'Documentation', exact: true }).click();
  await expect(page.locator('#agent-docs')).toBeVisible();
});

test('dependency badges preserve unrelated metadata but stale changed pricing', async ({ page }) => {
  await page.goto('');
  await expect(page.locator('#diagnostics')).toContainText('Checked by Rust');
  await page.locator('#run').click();
  await expect(page.locator('#run-status')).toHaveText('FAIL');
  const original = await page.locator('#source').inputValue();
  await page.locator('#source').fill('fn label() -> String { "bureau" }\n' + original);
  await expect(page.locator('#evidence')).toContainText('dependency key unchanged; no re-execution');
  await page.locator('#source').fill(original.replace('snacks * 80', 'snacks * 81'));
  await expect(page.locator('#evidence')).toContainText('STALE — dependencies changed');
  await expect(page.locator('#evidence')).toContainText('Ghost · input 9');
});

test('duplicate probe occurrences and example focus remain accurate', async ({ page }) => {
  await page.goto('');
  await page.locator('#source').fill('probe n in 1..=1 { true } probe n in 1..=1 { true }');
  await expect(page.locator('#diagnostics')).toContainText('Checked by Rust');
  await page.locator('#run').click();
  await expect(page.locator('#run-status')).toHaveText('COMPLETE');
  await expect(page.locator('.evidence-card')).toHaveCount(2);
  await expect(page.locator('#evidence')).not.toContainText('STALE');
  await page.locator('#example').selectOption('inventory');
  await expect(page.locator('#agent-text')).toContainText('fn remaining');
  await expect(page.locator('#agent-text')).not.toContainText('No matching');
  await expect(page.locator('#focus')).toHaveValue('remaining');
});
