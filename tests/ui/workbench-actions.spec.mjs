import { test, expect } from '@playwright/test';

test('first-screen actions use one real review worker and keep Stop reachable at the results', async ({ page }) => {
  await page.addInitScript(() => {
    const Native = window.Worker; window.reviewCount = 0;
    window.Worker = class extends Native { constructor(...args) { super(...args); window.reviewCount++; } };
  });
  await page.goto('?workbench');
  await expect(page.locator('#workbench-review-actions #review-run')).toHaveCount(1);
  await expect(page.locator('#workbench-review-actions #review-stop')).toHaveCount(1);
  expect(await page.evaluate(() => window.reviewCount)).toBe(0);
  expect(await page.locator('#review-run').evaluate(node => node.getBoundingClientRect().bottom < innerHeight)).toBe(true);
  await page.locator('#review-run').click();
  await expect(page.locator('#review-status')).toContainText('Submitted inputs · Pass');
  expect(await page.evaluate(() => window.reviewCount)).toBe(1);
  await expect(page.locator('#review-stop')).toBeDisabled();
  await expect.poll(() => page.locator('.workbench-actions').evaluate(node => Math.round(node.getBoundingClientRect().top))).toBe(0);
  await expect(page.locator('#review-decisions tbody tr')).toHaveCount(7);
});

test('phone actions and navigation stay within viewport and do not execute or alter policy', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('?workbench');
  const source = await page.locator('#source').inputValue(); const suite = await page.locator('#review-suite').inputValue();
  expect(await page.locator('#review-run').evaluate(node => node.getBoundingClientRect().bottom < innerHeight)).toBe(true);
  for (const name of ['Policy', 'Scenarios', 'Results']) {
    await page.getByRole('navigation', { name: 'Policy workbench actions' }).getByRole('link', { name, exact: true }).click();
    await expect(page.locator('#source')).toHaveValue(source); await expect(page.locator('#review-suite')).toHaveValue(suite);
    await expect(page.locator('#review-json')).toHaveText('');
  }
  await page.locator('#review-run').click(); await expect(page.locator('#review-status')).toContainText('Submitted inputs · Pass');
  await expect(page.locator('#review-run')).toBeInViewport();
  expect(await page.locator('.workbench-actions').evaluate(node => node.getBoundingClientRect().right <= innerWidth)).toBe(true);
});

test('sticky Stop cancels the original pending review and ignores its late reply', async ({ page }) => {
  await page.addInitScript(() => {
    window.Worker = class {
      postMessage(message) { window.late = () => this.onmessage?.({ data: { id: message.id, report: { status: 'Pass' } } }); }
      terminate() {}
    };
  });
  await page.goto('?workbench'); await page.locator('#review-run').click();
  await expect(page.locator('#review-run')).toBeDisabled(); await expect(page.locator('#review-stop')).toBeEnabled();
  await page.locator('#review-stop').click(); await page.evaluate(() => window.late());
  await expect(page.locator('#review-status')).toContainText('Host interruption — stopped');
  await expect(page.locator('#review-json')).toHaveText('');
  await expect(page.locator('#review-run')).toBeEnabled();
  await expect(page.locator('#review-download-readable')).toBeDisabled();
});

test('keyboard navigation reaches the editor and scenario target below the bar, then submits once', async ({ page }) => {
  await page.addInitScript(() => {
    const Native = window.Worker; window.reviewCount = 0;
    window.Worker = class extends Native { constructor(...args) { super(...args); window.reviewCount++; } };
  });
  await page.goto('?workbench');
  const navigation = page.getByRole('navigation', { name: 'Policy workbench actions' });
  await navigation.getByRole('link', { name: 'Policy', exact: true }).focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#source')).toBeFocused();
  await expect.poll(() => page.evaluate(() => document.getElementById('source').getBoundingClientRect().top >= document.querySelector('.workbench-actions').getBoundingClientRect().bottom)).toBe(true);
  await navigation.getByRole('link', { name: 'Scenarios', exact: true }).focus(); await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => document.getElementById('scenario-editor').getBoundingClientRect().top >= document.querySelector('.workbench-actions').getBoundingClientRect().bottom)).toBe(true);
  await page.locator('#review-run').focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#review-status')).toContainText('Submitted inputs · Pass');
  expect(await page.evaluate(() => window.reviewCount)).toBe(1);
});
