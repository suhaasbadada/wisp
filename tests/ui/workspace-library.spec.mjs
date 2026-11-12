import { test, expect } from '@playwright/test';

const key = 'wisp-browser-library-v1';
const workspace = (candidate = 'fn f()->Int{9223372036854775807}\n// café 😀\0') => ({ baseline: 'fn f()->Int{-9223372036854775808}', candidate, suite_json: '{"version":1,"version":2,"raw":"9223372036854775807"}\n ' });
const encode = entries => JSON.stringify({ format: key, approval: 'not_granted', applied: false, entries });
const record = (name, value = workspace()) => ({ name, workspace: value });
const stored = page => page.evaluate(key => localStorage.getItem(key), key);
async function open(page) {
  await page.goto('?workbench');
  await page.locator('#workspace-library > summary').click();
}
async function refresh(page, raw) {
  await page.evaluate(({ key, raw }) => raw === null ? localStorage.removeItem(key) : localStorage.setItem(key, raw), { key, raw });
  await page.locator('#library-refresh').click();
}
async function inputs(page) {
  return { baseline: await page.locator('#review-baseline').inputValue(), candidate: await page.locator('#source').inputValue(), suite_json: await page.locator('#review-suite').inputValue() };
}
async function loadFiles(page, value) {
  for (const [id, text] of [['baseline', value.baseline], ['candidate', value.candidate], ['suite', value.suite_json]]) {
    await page.locator(`#policy-files-${id}`).setInputFiles({ name: `${id}.json`, mimeType: 'text/plain', buffer: Buffer.from(text) });
  }
  await page.locator('#policy-files-open').click();
}
async function save(page, name) { await page.locator('#library-name').fill(name); await page.locator('#library-save').click(); }
async function select(page, index = 0) { await page.locator('#library-select').selectOption(String(index)); }
async function review(page) { await page.locator('#review-run').click(); await expect(page.locator('#review-status')).toContainText('Submitted inputs · Pass'); }

test('explicit named saves preserve opaque bytes and literal hostile names; reload lists only and full playground omits library', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.libraryWorkers = 0; const Native = window.Worker;
    window.Worker = class extends Native { constructor(...args) { super(...args); window.libraryWorkers++; } };
    window.libraryWrites = 0; const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (...args) { window.libraryWrites++; return set.apply(this, args); };
  });
  await open(page);
  const initial = await inputs(page);
  expect(await stored(page)).toBeNull(); expect(await page.evaluate(() => window.libraryWrites)).toBe(0);
  const first = workspace(); const second = workspace('fn second()->Int{7}\n// 雪');
  await loadFiles(page, first); await save(page, '雪 😀');
  await loadFiles(page, second); await save(page, '__proto__');
  const hostile = '<img src=x onerror=alert(1)>';
  await save(page, hostile);
  const raw = await stored(page);
  expect(JSON.parse(raw).entries).toEqual([record('雪 😀', first), record('__proto__', second), record(hostile, second)]);
  expect(await page.locator('#library-select option').allTextContents()).toContain(hostile);
  await expect(page.locator('#workspace-library img')).toHaveCount(0);
  await expect(page.locator('#draft-keep')).not.toBeChecked();
  await page.locator('#source').fill('unsaved'); expect(await stored(page)).toBe(raw);
  await open(page); expect(await inputs(page)).toEqual(initial); expect(await stored(page)).toBe(raw);
  await expect(page.locator('#review-json')).toHaveText('');
  expect(await page.evaluate(() => window.libraryWorkers)).toBe(0);
  await select(page); expect(await inputs(page)).toEqual(initial);
  await expect(page.locator('#library-preview')).toContainText('Saved input bytes');
  await page.locator('#library-open').click(); expect(await inputs(page)).toEqual(first);
  expect(await page.evaluate(() => window.libraryWorkers)).toBe(0);
  await page.goto('?playground'); await expect(page.locator('#workspace-library')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('open replaces all inputs, clears native/history evidence, keeps post-edit previous inputs and permits fresh native review', async ({ page }) => {
  await open(page); const initial = await inputs(page); await review(page);
  const value = { ...initial, candidate: initial.candidate + '\n// another named policy' };
  await refresh(page, encode([record('other', value)])); await select(page);
  await page.locator('#source').fill(initial.candidate + '\n// edited before open'); const previous = await inputs(page);
  await page.locator('#workspace-recorded').evaluate(node => { node.textContent = 'old history'; document.getElementById('workspace-history').hidden = false; });
  await page.locator('#library-open').click(); expect(await inputs(page)).toEqual(value);
  await expect(page.locator('#review-json')).toHaveText(''); await expect(page.locator('#workspace-recorded')).toHaveText('');
  await expect(page.locator('#review-download-evidence')).toBeDisabled();
  await page.locator('summary').filter({ hasText: 'Save or reopen your workspace' }).click();
  await page.locator('#workspace-restore-previous').click(); expect(await inputs(page)).toEqual(previous);
  await page.locator('#workspace-restore-previous').click(); expect(await inputs(page)).toEqual(value);
  await review(page);
  await page.evaluate(() => {
    window.libraryTerminated = 0;
    window.Worker = class {
      postMessage(message) { window.libraryLate = () => this.onmessage?.({ data: { id: message.id, report: { status: 'Pass' } } }); }
      terminate() { window.libraryTerminated++; }
    };
  });
  await page.locator('#review-run').click();
  await refresh(page, encode([record('different', initial)])); await select(page);
  await page.locator('#library-open').click();
  await page.evaluate(() => window.libraryLate());
  expect(await page.evaluate(() => window.libraryTerminated)).toBe(1);
  await expect(page.locator('#review-json')).toHaveText('');
  await expect(page.locator('#review-download-evidence')).toBeDisabled();
  expect(await inputs(page)).toEqual(initial);
});

test('identical save/open preserve evidence and previous buffer; overwrite is one-shot and preserves other names', async ({ page }) => {
  await open(page); const previous = await inputs(page);
  const current = { ...previous, candidate: previous.candidate + '\n// custom' };
  await loadFiles(page, current); await review(page);
  await save(page, 'one'); await save(page, 'two'); const raw = await stored(page);
  const evidence = await page.locator('#review-json').textContent();
  await save(page, 'one'); expect(await stored(page)).toBe(raw);
  await select(page); await page.locator('#library-open').click();
  expect(await page.locator('#review-json').textContent()).toBe(evidence);
  await expect(page.locator('#review-download-evidence')).toBeEnabled();
  await page.locator('summary').filter({ hasText: 'Save or reopen your workspace' }).click();
  await page.locator('#workspace-restore-previous').click(); expect(await inputs(page)).toEqual(previous);
  await save(page, 'one'); expect(await stored(page)).toBe(raw);
  await expect(page.locator('#library-status')).toContainText('Check Replace');
  await page.locator('#library-overwrite').check(); await page.locator('#library-save').click();
  expect(JSON.parse(await stored(page)).entries).toEqual([record('one', previous), record('two', current)]);
  await expect(page.locator('#library-overwrite')).not.toBeChecked();
  const replaced = await stored(page);
  await page.locator('#library-overwrite').check(); await page.locator('#library-name').fill('two');
  await expect(page.locator('#library-overwrite')).not.toBeChecked();
  await page.locator('#library-save').click(); expect(await stored(page)).toBe(replaced);
  await page.locator('#library-name').fill('one'); await page.locator('#library-overwrite').check();
  // Even an unsupported host change without an input event cannot transfer consent.
  await page.locator('#library-name').evaluate(node => { node.value = 'two'; });
  await page.locator('#library-save').click(); expect(await stored(page)).toBe(replaced);
});

test('capacity, exact name and encoded size limits fail without eviction', async ({ page }) => {
  await open(page); const eight = encode(Array.from({ length: 8 }, (_, i) => record(`name${i}`)));
  await refresh(page, eight); await save(page, 'ninth'); expect(await stored(page)).toBe(eight);
  await expect(page.locator('#library-status')).toContainText('8 names');
  for (const name of ['', ' leading', 'trailing ', 'é'.repeat(41), '\u007f']) {
    await save(page, name); expect(await stored(page)).toBe(eight);
  }
  const huge = { baseline: '\0'.repeat(65536), candidate: '\0'.repeat(65536), suite_json: '\0'.repeat(65536) };
  await refresh(page, encode([record('large', huge)])); await loadFiles(page, huge);
  const before = await stored(page); await save(page, 'another');
  await expect(page.locator('#library-status')).toContainText('2 MiB'); expect(await stored(page)).toBe(before);
});

test('confirmed delete/forget preserve current evidence and unrelated draft key; no sticky permissions', async ({ page }) => {
  await open(page); await review(page); const current = await inputs(page); const evidence = await page.locator('#review-json').textContent();
  await page.evaluate(() => localStorage.setItem('wisp-browser-draft-v1', 'unrelated'));
  await refresh(page, encode([record('one'), record('two')])); await select(page);
  const raw = await stored(page); await page.locator('#library-delete').click(); expect(await stored(page)).toBe(raw);
  await page.locator('#library-delete-confirm').check(); await page.locator('#library-delete').click();
  expect(JSON.parse(await stored(page)).entries).toEqual([record('two')]);
  await expect(page.locator('#library-delete-confirm')).not.toBeChecked();
  await page.locator('#library-forget').click(); expect(await stored(page)).not.toBeNull();
  await page.locator('#library-forget-confirm').check(); await page.locator('#library-forget').click(); expect(await stored(page)).toBeNull();
  expect(await inputs(page)).toEqual(current); expect(await page.locator('#review-json').textContent()).toBe(evidence);
  expect(await page.evaluate(() => localStorage.getItem('wisp-browser-draft-v1'))).toBe('unrelated');
  await expect(page.locator('#draft-keep')).not.toBeChecked();
});

test('noncanonical, foreign, duplicate, future, nonscalar, CR and oversized libraries are fail-closed until confirmed forget', async ({ page }) => {
  await open(page); const current = await inputs(page);
  const good = encode([record('one')]);
  for (const raw of [
    '{broken', good + ' ', good.replace('"applied":false', '"applied":true,"applied":false'),
    encode([record('one'), record('one')]), good.replace(key, 'future'),
    JSON.stringify({ ...JSON.parse(good), report: {} }), encode([{ ...record('one'), report: {} }]),
    encode([record('one', { ...workspace(), report: {} })]), encode([record('\ud800')]),
    encode([record('one', workspace('\ud800'))]), encode([record('one', workspace('a\r\nb'))]),
    encode([record('one', workspace('é'.repeat(32769)))]), ' '.repeat(2 * 1024 * 1024 + 1),
  ]) {
    await refresh(page, raw); await expect(page.locator('#library-status')).toContainText('invalid or too large');
    await expect(page.locator('#library-save')).toBeDisabled(); await expect(page.locator('#library-open')).toBeDisabled();
    expect(await stored(page)).toBe(raw); expect(await inputs(page)).toEqual(current);
    await page.locator('#library-forget').click(); expect(await stored(page)).toBe(raw);
    await page.locator('#library-forget-confirm').check(); await page.locator('#library-forget').click(); expect(await stored(page)).toBeNull();
  }
});

test('quota, blocked reads, and readback mismatch pause without leaking exceptions, retrying or erasing unknown data', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await open(page); const current = await inputs(page);
  await page.evaluate(() => {
    window.realSet = Storage.prototype.setItem; window.realGet = Storage.prototype.getItem; window.attempts = 0;
    Storage.prototype.setItem = function () { window.attempts++; throw new Error('SECRET'); };
  });
  await save(page, 'one'); await expect(page.locator('#library-status')).toContainText('No saved-copy guarantee');
  await expect(page.locator('#library-save')).toBeDisabled(); expect(await page.evaluate(() => window.attempts)).toBe(1);
  await page.evaluate(() => {
    Storage.prototype.setItem = function (key) { window.realSet.call(this, key, 'opaque replacement'); };
  });
  await page.locator('#library-refresh').click(); await save(page, 'one');
  await expect(page.locator('#library-status')).toContainText('No saved-copy guarantee'); expect(await stored(page)).toBe('opaque replacement');
  await page.evaluate(() => { Storage.prototype.getItem = () => { throw new Error('SECRET'); }; });
  await page.locator('#library-refresh').click();
  await page.evaluate(() => window.dispatchEvent(new StorageEvent('storage', { key: null })));
  await page.locator('#library-refresh').click();
  await expect(page.locator('#library-status')).not.toContainText('SECRET'); await expect(page.locator('#library-save')).toBeDisabled();
  expect(await inputs(page)).toEqual(current); expect(errors).toEqual([]);
});

test('cross-tab events pause until explicit refresh; missed events and captured old callbacks cannot load or overwrite', async ({ page, context }) => {
  await open(page); const initial = await inputs(page); const raw = encode([record('one')]);
  await refresh(page, raw); await select(page);
  await page.evaluate(() => { window.oldOpen = document.getElementById('library-open').onclick; window.oldSave = document.getElementById('library-save').onclick; });
  const other = await context.newPage(); await open(other);
  const newer = encode([record('new', workspace('fn new()->Int{3}'))]); await refresh(other, newer);
  await expect(page.locator('#library-status')).toContainText('another tab'); await expect(page.locator('#library-open')).toBeDisabled();
  expect(await inputs(page)).toEqual(initial);
  await page.locator('#library-refresh').click(); await select(page);
  await page.evaluate(() => { window.oldOpen(); window.oldSave(); }); expect(await inputs(page)).toEqual(initial); expect(await stored(page)).toBe(newer);
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key, raw });
  await page.locator('#library-open').click(); await expect(page.locator('#library-status')).toContainText('Refresh saved names required'); expect(await inputs(page)).toEqual(initial);
  await page.locator('#library-refresh').click(); await select(page); await page.locator('#library-delete-confirm').check();
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key, raw: newer });
  await page.locator('#library-delete').click(); expect(await stored(page)).toBe(newer);
  await page.locator('#library-refresh').click(); await page.locator('#library-forget-confirm').check();
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key, raw });
  await page.locator('#library-forget').click(); expect(await stored(page)).toBe(raw);
  await page.locator('#library-refresh').click(); await page.locator('#library-name').fill('save');
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key, raw: newer });
  await page.locator('#library-save').click(); expect(await stored(page)).toBe(newer);
  await other.close();
});
