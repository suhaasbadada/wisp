import { test, expect } from '@playwright/test';

test('Agent and Human docs expose actual pilot failure and reproducible limitations', async ({ page, request }) => {
  await page.goto('documentation/');
  await expect(page.locator('#agent-mode')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#agent-docs')).toContainText('Wisp 2/3 tasks accepted');
  await expect(page.locator('#agent-docs')).toContainText('behavior was not graded');
  await page.locator('#human-mode').click();
  await expect(page.locator('#human-docs')).toContainText('We preserved that failure');
  await expect(page.locator('#human-docs')).toContainText('were not measured');
  const link = page.locator('.doc-links a').filter({ hasText: 'Product-validation pilot' });
  await expect(link).toHaveCount(1);
  const response = await request.get(await link.getAttribute('href'));
  expect(response.status()).toBe(200);
  const text = await response.text();
  expect(text).toContain('behavior not graded');
  expect(text).toContain('not technical holdout isolation');
  expect(text).toContain('not a security sandbox');
});
