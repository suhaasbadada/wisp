import { test, expect } from '@playwright/test';

const docs = page => page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('link', { name: 'Documentation', exact: true });
async function warning(page, action, accept = false) {
  const next = page.waitForEvent('dialog'); const pending = action();
  const dialog = await next; expect(dialog.type()).toBe('beforeunload');
  if (accept) await dialog.accept(); else await dialog.dismiss();
  await pending;
}

test('unchanged example and reviews alone do not prevent navigation', async ({ page }) => {
  await page.goto('?workbench'); await page.locator('#review-run').click();
  await expect(page.locator('#review-status')).toContainText('Submitted inputs · Pass');
  const dialogs = []; page.on('dialog', dialog => { dialogs.push(dialog.type()); void dialog.dismiss(); });
  await docs(page).click(); await expect(page).toHaveURL(/documentation/); expect(dialogs).toEqual([]);
});

test('changed candidate warns; cancel keeps work and explicit leave navigates without saving', async ({ page }) => {
  await page.goto('?workbench'); const changed = (await page.locator('#source').inputValue()) + '\n// keep me';
  await page.locator('#source').fill(changed);
  await warning(page, () => docs(page).click({ noWaitAfter: true }));
  await expect(page.locator('#source')).toHaveValue(changed);
  expect(await page.evaluate(() => localStorage.getItem('wisp-browser-draft-v1'))).toBeNull();
  await warning(page, () => docs(page).click({ noWaitAfter: true }), true);
  await expect(page).toHaveURL(/documentation/);
});

test('baseline-only and scenario changes warn; exact input reversion removes warning without reviving review', async ({ page }) => {
  await page.goto('?workbench'); const initial = await page.locator('#source').inputValue();
  await page.locator('#review-run').click(); await expect(page.locator('#review-status')).toContainText('Submitted inputs · Pass');
  await page.locator('#source').fill(initial + ' '); await page.locator('#source').fill(initial);
  await expect(page.locator('#review-status')).toContainText('Historical review');
  await expect(page.locator('#review-download-package')).toBeDisabled();
  const dialogs = []; page.on('dialog', dialog => { dialogs.push(dialog.type()); void dialog.dismiss(); });
  await docs(page).click(); await expect(page).toHaveURL(/documentation/); expect(dialogs).toEqual([]);
  page.removeAllListeners('dialog'); await page.goto('?workbench');
  await page.locator('#review-capture').click();
  await warning(page, () => docs(page).click({ noWaitAfter: true }));
  await expect(page.locator('#source')).toHaveValue(initial);
  await page.locator('#review-example').click();
  await page.locator('#review-suite').evaluate(node => { node.value += ' '; node.dispatchEvent(new Event('input')); });
  await warning(page, () => docs(page).click({ noWaitAfter: true }));
});

test('opting in to browser recovery does not promise durable saving or bypass the warning', async ({ page }) => {
  await page.goto('?workbench'); const changed = (await page.locator('#source').inputValue()) + '\n// changed';
  await page.locator('#source').fill(changed);
  await page.locator('summary').filter({ hasText: 'Save or reopen your workspace' }).click();
  await page.locator('#draft-keep').check(); await expect(page.locator('#draft-status')).toContainText('Draft inputs saved');
  // A deliberately cancelled reload has no DOMContentLoaded to await.
  await warning(page, () => page.evaluate(() => window.location.reload()));
  await expect(page.locator('#source')).toHaveValue(changed);
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('wisp-browser-draft-v1'))).candidate).toBe(changed);
});
