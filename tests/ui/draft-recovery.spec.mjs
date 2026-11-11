import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const key = 'wisp-browser-draft-v1';
const envelope = (candidate = 'fn f()->Int{2}', suite_json = '{"version":1,"version":2}') => JSON.stringify({
  format: 'wisp-browser-workspace-v1', approval: 'not_granted', applied: false,
  baseline: 'fn f()->Int{1}', candidate, suite_json,
}, null, 2);
async function open(page) {
  await page.goto('?workbench');
  await page.locator('summary').filter({ hasText: 'Save or reopen your workspace' }).click();
}
const stored = page => page.evaluate(key => localStorage.getItem(key), key);
async function seed(page, raw) {
  await page.addInitScript(({ key, raw }) => localStorage.setItem(key, raw), { key, raw });
}

test('default stays off through editing and review without storage writes', async ({ page }) => {
  await page.addInitScript(() => {
    window.draftWrites = 0;
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (...args) { window.draftWrites++; return set.apply(this, args); };
  });
  await open(page);
  await page.locator('#source').fill((await page.locator('#source').inputValue()) + '\n// edit');
  await page.locator('#review-run').click();
  await expect(page.locator('#review-status')).toContainText('Submitted inputs · Pass');
  expect(await stored(page)).toBeNull();
  expect(await page.evaluate(() => window.draftWrites)).toBe(0);
  await expect(page.locator('#draft-keep')).not.toBeChecked();
});

test('opt in captures exact raw inputs and baseline; reload offers only explicit restore and resumes saving', async ({ page }) => {
  await open(page);
  await page.locator('#draft-keep').check();
  const candidate = 'fn f()->Int{2}\n// café 😀';
  const suite = '{"version":1,"version":2}\n ';
  await page.locator('#source').fill(candidate);
  await page.locator('#review-capture').click();
  await page.locator('#review-suite').evaluate((node, value) => { node.value = value; node.dispatchEvent(new Event('input')); }, suite);
  const raw = await stored(page);
  expect(JSON.parse(raw)).toEqual({ format: 'wisp-browser-workspace-v1', approval: 'not_granted', applied: false, baseline: candidate, candidate, suite_json: suite });
  await open(page);
  await expect(page.locator('#source')).not.toHaveValue(candidate);
  expect(await stored(page)).toBe(raw);
  await expect(page.locator('#draft-keep')).toBeDisabled();
  await page.locator('#source').fill('fn untouched()->Int{7}');
  expect(await stored(page)).toBe(raw);
  await page.locator('#draft-restore').click();
  await expect(page.locator('#source')).toHaveValue(candidate);
  await expect(page.locator('#review-baseline')).toHaveValue(candidate);
  await expect(page.locator('#review-suite')).toHaveValue(suite);
  await expect(page.locator('#review-status')).toContainText('no current review');
  await expect(page.locator('#review-json')).toHaveText('');
  await expect(page.locator('#review-download-source')).toBeDisabled();
  await expect(page.locator('#draft-keep')).toBeChecked();
  await page.locator('#source').fill(candidate + '\n// next');
  expect(JSON.parse(await stored(page)).candidate).toBe(candidate + '\n// next');
});

test('forget removes only its key and stops autosave', async ({ page }) => {
  await open(page);
  await page.evaluate(() => localStorage.setItem('wisp-doc-mode', 'human'));
  await page.locator('#draft-keep').check();
  await page.locator('#draft-forget').click();
  expect(await stored(page)).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('wisp-doc-mode'))).toBe('human');
  await expect(page.locator('#draft-keep')).not.toBeChecked();
  await page.locator('#source').fill('fn f()->Int{5}');
  expect(await stored(page)).toBeNull();
});

test('quota and blocked storage fail visibly without leaking inputs or breaking downloads or looping retries', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    window.saveAttempts = 0;
    Storage.prototype.setItem = () => { window.saveAttempts++; throw new Error('SECRET /private/policy'); };
  });
  await page.locator('#draft-keep').check();
  await expect(page.locator('#draft-status')).toContainText('not saved');
  await expect(page.locator('#draft-status')).not.toContainText('SECRET');
  await page.locator('#review-run').click();
  await expect(page.locator('#review-status')).toContainText('Submitted inputs · Pass');
  expect(await page.evaluate(() => window.saveAttempts)).toBe(1);
  const pending = page.waitForEvent('download'); await page.locator('#workspace-save').click();
  expect(JSON.parse(await readFile(await (await pending).path(), 'utf8')).format).toBe('wisp-browser-workspace-v1');
  await page.locator('#source').fill('fn f()->Int{3}');
  expect(await page.evaluate(() => window.saveAttempts)).toBe(2);
  await page.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new Error('SECRET'); } }));
  await open(page);
  await expect(page.locator('#draft-status')).toContainText('unavailable');
  await page.locator('#draft-keep').check();
  await expect(page.locator('#draft-status')).toContainText('not saved');
  await expect(page.locator('#workspace-save')).toBeEnabled();
});

test('invalid, duplicate, extra, oversize and non-scalar/LF records are forget-only and never overwritten', async ({ page }) => {
  await open(page);
  for (const raw of [
    '{broken', envelope().replace('"applied": false', '"applied": true, "applied": false'),
    JSON.stringify({ ...JSON.parse(envelope()), report: { status: 'Pass' } }, null, 2),
    ' '.repeat(1024 * 1024 + 1), envelope('é'.repeat(32769)), envelope('\ud800'), envelope('a\r\nb'),
  ]) {
    await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key, raw });
    await open(page);
    await expect(page.locator('#draft-restore')).toBeDisabled();
    await expect(page.locator('#draft-keep')).toBeDisabled();
    await expect(page.locator('#draft-status')).toContainText('invalid or too large');
    await page.locator('#source').fill('fn f()->Int{9}');
    expect(await stored(page)).toBe(raw);
    await page.locator('#draft-forget').click();
    expect(await stored(page)).toBeNull();
  }
});

test('another tab pauses saving without editing inputs; restore explicitly uses latest draft', async ({ page, context }) => {
  await open(page); await page.locator('#draft-keep').check();
  const before = await page.locator('#source').inputValue();
  const second = await context.newPage(); await open(second);
  await second.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key, raw: envelope() });
  await expect(page.locator('#draft-keep')).not.toBeChecked();
  await expect(page.locator('#draft-status')).toContainText('another tab');
  await expect(page.locator('#source')).toHaveValue(before);
  await page.locator('#source').fill('fn local()->Int{7}');
  expect(await stored(page)).toBe(envelope());
  await page.locator('#draft-restore').click();
  await expect(page.locator('#source')).toHaveValue('fn f()->Int{2}');
  await second.evaluate(key => localStorage.removeItem(key), key);
  await expect(page.locator('#draft-keep')).not.toBeChecked();
  await expect(page.locator('#draft-restore')).toBeDisabled();
  await second.close();
});

test('missed storage events cannot silently overwrite or forget a newly observed record', async ({ page }) => {
  await page.addInitScript(() => window.addEventListener('storage', event => event.stopImmediatePropagation()));
  await open(page); await page.locator('#draft-keep').check();
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key, raw: envelope('fn latest()->Int{8}') });
  await page.locator('#source').fill('fn local()->Int{9}');
  await expect(page.locator('#draft-keep')).not.toBeChecked();
  expect(await stored(page)).toBe(envelope('fn latest()->Int{8}'));
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key, raw: envelope('fn newer()->Int{10}') });
  await page.locator('#draft-forget').click();
  expect(await stored(page)).toBe(envelope('fn newer()->Int{10}'));
  await page.locator('#draft-forget').click(); expect(await stored(page)).toBeNull();
});

test('restore cancels active review, ignores late responses, and edit-revert cannot revive acceptance', async ({ page }) => {
  await open(page); await page.locator('#draft-keep').check();
  await page.locator('#review-run').click();
  await expect(page.locator('#review-status')).toContainText('Submitted inputs · Pass');
  const source = await page.locator('#source').inputValue();
  await page.locator('#source').fill(source + '\n'); await page.locator('#source').fill(source);
  await expect(page.locator('#review-status')).toContainText('Historical review');
  await expect(page.locator('#review-download-evidence')).toBeDisabled();
  await seed(page, envelope());
  await page.addInitScript(() => {
    window.Worker = class {
      postMessage(message) { window.lateReview = () => this.onmessage?.({ data: { id: message.id, report: { status: 'Pass' } } }); }
      terminate() {}
    };
  });
  await open(page); await page.locator('#review-run').click();
  await page.locator('#draft-restore').click(); await page.evaluate(() => window.lateReview());
  await expect(page.locator('#review-status')).toContainText('no current review');
  await expect(page.locator('#review-json')).toHaveText('');
  await expect(page.locator('#review-download-evidence')).toBeDisabled();
});
