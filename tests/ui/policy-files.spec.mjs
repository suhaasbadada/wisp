import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const baseline = 'fn f(n: Int) -> Int { n + 1 }\n// café 😀\n';
const candidate = 'fn f(n: Int) -> Int { n + 2 }\n// own candidate\n';
const suite = '{"version":1,"target":"f","cases":[{"id":"own","args":["1"],"expect":{"result":{"type":"Int","value":"3"},"output":""}}]}\n';
const file = (name, text) => ({ name, mimeType: 'application/octet-stream', buffer: Buffer.from(text) });
async function select(page, { before = baseline, after = candidate, cases = suite } = {}) {
  await page.locator('#policy-files-baseline').setInputFiles(file('baseline.wisp', before));
  await page.locator('#policy-files-candidate').setInputFiles(after === null ? [] : file('candidate.wisp', after));
  await page.locator('#policy-files-suite').setInputFiles(file('scenarios.json', cases));
}
const open = page => page.locator('#policy-files-open').click();
async function values(page) {
  return page.evaluate(() => ['review-baseline', 'source', 'review-suite'].map(id => document.getElementById(id).value));
}
async function expectInputs(page, expected) { await expect.poll(() => values(page)).toEqual(expected); }
async function watchReads(page, delayed = false) {
  await page.addInitScript(delay => {
    const original = File.prototype.arrayBuffer;
    window.fileReads = 0; window.settledReads = 0; window.releaseFiles = [];
    File.prototype.arrayBuffer = async function () {
      window.fileReads++;
      if (delay) await new Promise(resolve => window.releaseFiles.push(resolve));
      try { return await original.call(this); }
      finally { window.settledReads++; }
    };
  }, delayed);
}
const finishReads = page => page.evaluate(() => window.releaseFiles.splice(0).forEach(resolve => resolve()));

test('selection does no file IO; explicit open reviews own policy and saves/reopens all exact inputs', async ({ page }) => {
  await watchReads(page); await page.goto('?workbench');
  const original = await values(page);
  await expect(page.locator('#policy-files-open')).toBeDisabled();
  await page.locator('#policy-files-baseline').setInputFiles(file('baseline.wisp', baseline));
  await expect(page.locator('#policy-files-open')).toBeDisabled();
  await select(page); await expect(page.locator('#policy-files-open')).toBeEnabled();
  expect(await page.evaluate(() => window.fileReads)).toBe(0);
  await expectInputs(page, original);
  await open(page); await expect(page.locator('#policy-files-status')).toContainText('Files opened');
  expect(await page.evaluate(() => window.fileReads)).toBe(3);
  await expectInputs(page, [baseline, candidate, suite]);
  await expect(page.locator('#review-status')).toContainText('no current review');
  await expect(page.locator('#review-download-evidence')).toBeDisabled();
  await expect(page.locator('#scenario-editor')).toContainText('Custom or incomplete suite');
  await expect(page.locator('#review-json')).toHaveText('');
  await page.locator('#review-run').click();
  await expect(page.locator('#review-status')).toContainText('Submitted inputs · Pass');
  const report = JSON.parse(await page.locator('#review-json').textContent());
  expect(report.review.summary).toMatchObject({ changed: 1, expectation_pass: 1, attempted_invocations: 2 });
  expect(report.review.approval).toBe('not_granted');
  await page.locator('summary').filter({ hasText: 'Save or reopen your workspace' }).click();
  const pending = page.waitForEvent('download'); await page.locator('#workspace-save').click();
  const raw = await readFile(await (await pending).path(), 'utf8');
  expect(JSON.parse(raw)).toEqual({ format: 'wisp-browser-workspace-v1', approval: 'not_granted', applied: false, baseline, candidate, suite_json: suite });
  await page.reload();
  await page.locator('summary').filter({ hasText: 'Save or reopen your workspace' }).click();
  await page.locator('#workspace-file').setInputFiles(file('draft.json', raw));
  await page.locator('#workspace-replace').click();
  await expectInputs(page, [baseline, candidate, suite]);
  await expect(page.locator('#review-download-source')).toBeDisabled();
});

test('optional candidate is exactly baseline; invalid Wisp is imported without execution or repair', async ({ page }) => {
  await page.goto('?workbench');
  const cases = suite.replace('"value":"3"', '"value":"2"');
  await select(page, { after: null, cases }); await open(page);
  await expect(page.locator('#policy-files-status')).toContainText('Files opened');
  await expectInputs(page, [baseline, baseline, cases]);
  await page.locator('#review-run').click();
  await expect(page.locator('#review-summary')).toContainText('0 Changed · 1 Unchanged');
  await expect(page.locator('#review-status')).toContainText('Submitted inputs · Pass');
  await select(page, { before: 'this is not Wisp\n', after: null }); await open(page);
  await expectInputs(page, ['this is not Wisp\n', 'this is not Wisp\n', suite]);
  await expect(page.locator('#review-json')).toHaveText('');
  await expect(page.locator('#review-status')).toContainText('no current review');
  await page.locator('#review-run').click();
  await expect(page.locator('#review-json')).toContainText('"diagnostic_document": "baseline"');
  const fullSource = baseline + '//' + 'a'.repeat(65536 - Buffer.byteLength(baseline) - 2);
  const fullSuite = suite + ' '.repeat(65536 - Buffer.byteLength(suite));
  await select(page, { before: fullSource, after: null, cases: fullSuite });
  expect(await page.locator('#policy-files-baseline').evaluate(node => node.files[0].size)).toBe(65536);
  expect(await page.locator('#policy-files-suite').evaluate(node => node.files[0].size)).toBe(65536);
  await open(page);
  await expect(page.locator('#policy-files-status')).toContainText('Files opened');
  await expectInputs(page, [fullSource, fullSource, fullSuite]);
});

test('invalid scenario bytes stay raw; framing rejects injection and Rust rejects duplicate members', async ({ page }) => {
  await page.goto('?workbench');
  for (const cases of [suite.replace('"version":1', '"version":1,"ver\\u0073ion":1'), '{"version":1,"target":"f","cases":[\n', suite.trim() + ',"limits":{"fuel":0}']) {
    await select(page, { cases }); await open(page);
    await expect(page.locator('#policy-files-status')).toContainText('Files opened');
    await expectInputs(page, [baseline, candidate, cases]);
    await expect(page.locator('#scenario-editor')).toContainText('Custom or incomplete suite');
    await expect(page.locator('#review-json')).toHaveText('');
    await page.locator('#review-run').click();
    if (cases.includes('ver\\u0073ion')) await expect(page.locator('#review-json')).toContainText('"status": "Error"');
    else {
      await expect(page.locator('#review-status')).toContainText('suite must be standalone JSON. No review submitted');
      await expect(page.locator('#review-json')).toHaveText('');
    }
    await expectInputs(page, [baseline, candidate, cases]);
    await expect(page.locator('#review-decisions tbody tr')).toHaveCount(0);
  }
});

test('caps before any read, invalid UTF-8, CR, BOM and read failures leave evidence and workspace unchanged', async ({ page }) => {
  await watchReads(page); await page.goto('?workbench');
  await page.locator('#review-run').click();
  await expect(page.locator('#review-status')).toContainText('Submitted inputs · Pass');
  const original = await values(page);
  const evidence = await page.locator('#review-json').textContent();
  const reviewStatus = await page.locator('#review-status').textContent();
  for (const [field, bad] of [
    ['before', Buffer.alloc(65537, 97)], ['after', Buffer.alloc(65537, 97)], ['cases', Buffer.alloc(65537, 97)],
    ['after', Buffer.from([0xc3, 0x28])], ['after', Buffer.from([0xed, 0xa0, 0x80])],
    ['before', Buffer.from('\uFEFF' + baseline)], ['after', Buffer.from(baseline + '\r\n')], ['cases', Buffer.from(suite + '\r')],
  ]) {
    await select(page, { [field]: bad });
    const reads = await page.evaluate(() => window.fileReads);
    await open(page); await expect(page.locator('#policy-files-status')).toContainText('Cannot open files');
    if (bad.length > 65536) expect(await page.evaluate(() => window.fileReads)).toBe(reads);
    await expectInputs(page, original);
    await expect(page.locator('#review-json')).toHaveText(evidence);
    await expect(page.locator('#review-status')).toHaveText(reviewStatus);
    await expect(page.locator('#review-download-evidence')).toBeEnabled();
  }
  await page.evaluate(() => { File.prototype.arrayBuffer = async () => { throw new Error('unreadable'); }; });
  await select(page); await open(page);
  await expect(page.locator('#policy-files-status')).toContainText('Cannot open files');
  await expectInputs(page, original);
  await expect(page.locator('#review-json')).toHaveText(evidence);
  await expect(page.locator('#review-download-evidence')).toBeEnabled();
  await expect(page.locator('#policy-files-status')).not.toContainText('candidate.wisp');
});

test('opening files cancels pending native review and rejects late callbacks', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.workerTerminations = 0;
    window.Worker = class {
      constructor(...args) { this.native = new NativeWorker(...args); }
      postMessage(message) {
        this.native.onmessage = event => { window.lateReview = () => this.onmessage?.(event); };
        this.native.postMessage(message);
      }
      terminate() { window.workerTerminations++; this.native.terminate(); }
    };
  });
  await page.goto('?workbench'); await page.locator('#review-run').click();
  await page.waitForFunction(() => Boolean(window.lateReview));
  await expect(page.locator('#review-stop')).toBeEnabled();
  await select(page); await open(page);
  await expect(page.locator('#policy-files-status')).toContainText('Files opened');
  expect(await page.evaluate(() => window.workerTerminations)).toBe(1);
  await page.evaluate(() => window.lateReview());
  await expectInputs(page, [baseline, candidate, suite]);
  await expect(page.locator('#review-json')).toHaveText('');
  await expect(page.locator('#review-status')).toContainText('no current review');
  await expect(page.locator('#review-download-source')).toBeDisabled();
  await expect(page.locator('#review-stop')).toBeDisabled();
});

test('edits including edit-and-revert while files read prevent replacement until another explicit open', async ({ page }) => {
  await watchReads(page, true); await page.goto('?workbench');
  const original = await values(page);
  for (const id of ['source', 'review-suite']) {
    await select(page); await open(page);
    await page.waitForFunction(() => window.releaseFiles.length === 3);
    await expect(page.locator('#policy-files-open')).toBeDisabled();
    await page.locator('#' + id).evaluate(node => {
      const value = node.value;
      node.value += '\n'; node.dispatchEvent(new Event('input'));
      node.value = value; node.dispatchEvent(new Event('input'));
    });
    await finishReads(page);
    await expect(page.locator('#policy-files-status')).toContainText('Workspace changed while reading');
    await expectInputs(page, original);
    await expect(page.locator('#policy-files-open')).toBeEnabled();
  }
  await open(page); await page.waitForFunction(() => window.releaseFiles.length === 3); await finishReads(page);
  await expect(page.locator('#policy-files-status')).toContainText('Files opened');
  await expectInputs(page, [baseline, candidate, suite]);
});

test('new selection invalidates in-flight read without auto-retry, even if old read finishes after newer import', async ({ page }) => {
  await watchReads(page, true); await page.goto('?workbench');
  const original = await values(page);
  await select(page); await open(page); await page.waitForFunction(() => window.releaseFiles.length === 3);
  const newer = candidate + '// newer\n';
  await page.locator('#policy-files-candidate').setInputFiles(file('new.wisp', newer));
  expect(await page.evaluate(() => window.fileReads)).toBe(3);
  await expectInputs(page, original);
  await expect(page.locator('#policy-files-open')).toBeEnabled();
  await open(page); await page.waitForFunction(() => window.releaseFiles.length === 6);
  await page.evaluate(() => window.releaseFiles.splice(3).forEach(resolve => resolve()));
  await expect(page.locator('#policy-files-status')).toContainText('Files opened');
  await expectInputs(page, [baseline, newer, suite]);
  await finishReads(page);
  await page.waitForFunction(() => window.settledReads === 6);
  await expectInputs(page, [baseline, newer, suite]);
  await expect(page.locator('#policy-files-status')).toContainText('Files opened');
  expect(await page.evaluate(() => window.fileReads)).toBe(6);
});
