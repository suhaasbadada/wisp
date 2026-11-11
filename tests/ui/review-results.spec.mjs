import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const scenario = (id, args, type, value, output = '') => ({ id, args, expect: { result: { type, value }, output } });
async function custom(page, before, after, cases) {
  await page.goto('');
  await page.locator('#source').fill(before);
  await page.locator('#review-capture').click();
  await page.locator('#source').fill(after);
  await page.locator('#review-suite').fill(JSON.stringify({ version: 1, target: 'f', cases }));
  await submit(page);
}
async function submit(page) {
  await page.locator('#review-run').click();
  await expect(page.locator('#review-status')).toContainText('Submitted inputs');
}
const rows = page => page.locator('#review-decisions tbody tr');
const attention = page => page.getByRole('button', { name: 'Needs attention', exact: true });

test('failed owner requirement shows saved inputs, required 999 and observed 2 without opening JSON', async ({ page }) => {
  await page.goto('?workbench');
  const card = page.locator('.scenario-card').filter({ has: page.locator('summary', { hasText: /^exact-pack$/ }) });
  await card.locator('summary').click();
  await card.getByLabel('Required: packs', { exact: true }).fill('999');
  await submit(page);
  await expect(page.locator('#review-status')).toContainText('Fail');
  const first = rows(page).first();
  await expect(first.locator('td').nth(0)).toContainText('"quantity":"10"');
  await expect(first.locator('td').nth(1)).toContainText('packs: "2"');
  await expect(first.locator('td').nth(2)).toContainText('packs: "2"');
  await expect(first.locator('td').nth(3)).toContainText('packs: "999"');
  await expect(first.locator('td').nth(4)).toContainText('Expectation: Fail');
  await expect(first.locator('td').nth(4)).toContainText('Comparison: Unchanged');
  await expect(page.locator('#review-cases .review-case')).toHaveCount(7);
});

test('output-only mismatch displays quoted empty output and escaped newlines', async ({ page }) => {
  await custom(page, 'fn f() -> Int { 2 }', 'fn f() -> Int { print("line"); 2 }', [scenario('print-mismatch', [], 'Int', '2')]);
  await expect(page.locator('#review-status')).toContainText('Fail');
  await expect(rows(page).locator('td').nth(1)).toContainText('Output: ""');
  await expect(rows(page).locator('td').nth(2)).toContainText('Output: "line\\n"');
  await expect(rows(page).locator('td').nth(3)).toContainText('Output: ""');
  expect(JSON.parse(await page.locator('#review-json').textContent()).review.cases[0].expectation).toBe('Fail');
});

test('String Bool and record inputs and requirements stay literal text, not HTML or decimal coercion', async ({ page }) => {
  const code = 'record Data { text: String, flag: Bool, number: Int }\nfn f(text: String, flag: Bool, data: Data) -> Data { data }';
  const text = '<svg/onload=alert(1)>😀';
  const data = { text, flag: true, number: '9223372036854775807' };
  await custom(page, code, code, [scenario('literal', [text, false, data], 'Data', data)]);
  await expect(page.locator('#review-status')).toContainText('Pass');
  await expect(rows(page)).toContainText(text);
  await expect(rows(page).locator('td').nth(0)).toContainText('false');
  await expect(rows(page).locator('td').nth(3)).toContainText('flag: true');
  await expect(rows(page).locator('td').nth(3)).toContainText('number: "9223372036854775807"');
  await expect(page.locator('#review-decisions svg, #review-cases svg')).toHaveCount(0);
  await attention(page).click();
  await expect(rows(page)).toHaveCount(0);
  await expect(page.locator('#review-decisions caption')).toContainText('0 displayed / 1 total');
  await expect(page.locator('#review-decisions')).toContainText('No scenarios need attention.');
  await expect(page.locator('#review-summary')).toContainText('1 Pass');
});

test('attention includes repaired baseline faults, native candidate Errors and bounded Unknown', async ({ page }) => {
  const before = 'fn f(x: Int) -> Int { if x == 0 { 1 / x } else { x } }';
  const after = 'fn f(x: Int) -> Int { if x == 1 { 1 / (x - 1) } else { if x == 2 { f(x) } else { x } } }';
  await custom(page, before, after, [scenario('baseline-repaired', ['0'], 'Int', '0'), scenario('candidate-error', ['1'], 'Int', '1'), scenario('bounded-unknown', ['2'], 'Int', '2'), scenario('complete-pass', ['3'], 'Int', '3')]);
  const native = JSON.parse(await page.locator('#review-json').textContent());
  expect(native.review.cases.map(c => c.expectation)).toEqual(['Pass', 'Error', 'Unknown', 'Pass']);
  await attention(page).click();
  await expect(rows(page)).toHaveCount(3);
  await expect(page.locator('#review-cases .review-case')).toHaveCount(3);
  await expect(rows(page).nth(0)).toContainText('baseline-repaired');
  await expect(rows(page).nth(0).locator('td').nth(1)).toContainText('Error');
  await expect(rows(page).nth(0).locator('td').nth(4)).toContainText('Expectation: Pass');
  await expect(rows(page).nth(1).locator('td').nth(4)).toContainText('Expectation: Error');
  await expect(rows(page).nth(2).locator('td').nth(4)).toContainText('Expectation: Unknown');
  await expect(page.locator('#review-decisions caption')).toContainText('3 displayed / 4 total');
  await submit(page);
  await expect(rows(page)).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'All scenarios', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('filters do not execute or mutate inputs/report; historical snapshots never revive downloads', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.reviewWorkers = 0;
    window.Worker = class extends NativeWorker { constructor(...args) { super(...args); window.reviewWorkers++; } };
  });
  await page.goto('?workbench'); await submit(page);
  const report = await page.locator('#review-json').textContent();
  const suite = await page.locator('#review-suite').inputValue();
  const source = await page.locator('#source').inputValue();
  const workers = await page.evaluate(() => window.reviewWorkers);
  const pending = page.waitForEvent('download'); await page.locator('#review-download-evidence').click();
  const bundle = JSON.parse(await readFile(await (await pending).path(), 'utf8'));
  expect(JSON.stringify(bundle.report, null, 2)).toBe(report);
  await attention(page).click();
  await expect(rows(page)).toHaveCount(0);
  await expect(page.locator('#source')).toHaveValue(source);
  await expect(page.locator('#review-suite')).toHaveValue(suite);
  await page.locator('summary').filter({ hasText: 'Advanced: edit' }).click();
  await page.locator('#review-suite').fill(suite.replaceAll('quantity', 'edited-live-field'));
  await page.locator('#source').fill(source + '\n// edited');
  await page.getByRole('button', { name: 'All scenarios', exact: true }).click();
  await expect(rows(page)).toHaveCount(7);
  await expect(rows(page).first()).toContainText('"quantity":"10"');
  await expect(rows(page).first()).not.toContainText('edited-live-field');
  await expect(page.locator('#review-decisions caption')).toContainText('Historical review');
  await expect(page.locator('#review-status')).toContainText('Historical review');
  await expect(page.locator('#review-download-evidence')).toBeDisabled();
  await expect(page.locator('#review-download-source')).toBeDisabled();
  await expect(page.locator('#review-json')).toHaveText(report);
  expect(await page.evaluate(() => window.reviewWorkers)).toBe(workers);
});

test('preflight diagnostics are readable with native code/document/path and clear on import and restart', async ({ page }) => {
  // Still execute real WASM; additionally exercise the host's missing-review
  // response path using the same native rejection diagnostics.
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      set onmessage(handler) {
        super.onmessage = event => {
          if (window.omitReview && event.data.report) delete event.data.report.review;
          handler?.(event);
        };
      }
    };
  });
  const code = 'fn f(x: Int) -> Int { x }';
  await custom(page, code, code, [scenario('bad-int', ['01'], 'Int', '1')]);
  await expect(page.locator('#review-status')).toContainText('Error');
  await expect(page.locator('#review-diagnostics')).toContainText('code: E_INPUT_INT_CANONICAL');
  await expect(page.locator('#review-diagnostics')).toContainText('kind: Input');
  await expect(page.locator('#review-diagnostics')).toContainText('document: suite');
  // Native input diagnostics own a JSON path, not a source-document span.
  await expect(page.locator('#review-diagnostics')).not.toContainText('source offsets');
  await expect(page.locator('#review-diagnostics')).toContainText('/suite/cases/0/args/0');
  await expect(rows(page)).toHaveCount(0);
  await page.locator('#source').fill('fn f(x: Int) -> Int { true }');
  await submit(page);
  await expect(page.locator('#review-diagnostics')).toContainText('document: candidate');
  await expect(page.locator('#review-diagnostics')).toContainText('path: /candidate');
  await expect(page.locator('#review-diagnostics')).not.toContainText('baseline source offsets');
  await page.locator('#review-suite').fill('{"version":1,"version":1}');
  await page.locator('#review-run').click();
  await expect(page.locator('#review-status')).toContainText('Submitted inputs · Error');
  await expect(page.locator('#review-diagnostics')).toContainText('E_REVIEW_REQUEST');
  await expect(rows(page)).toHaveCount(0);
  await expect(page.locator('#review-download-evidence')).toBeEnabled();
  await page.evaluate(() => { window.omitReview = true; });
  await page.locator('#review-run').click();
  await expect(page.locator('#review-status')).toContainText('no review accepted');
  await expect(page.locator('#review-diagnostics')).toContainText('E_REVIEW_REQUEST');
  await expect(page.locator('#review-download-evidence')).toBeDisabled();
  await page.evaluate(() => { window.omitReview = false; });
  await page.locator('summary').filter({ hasText: 'Save or reopen your workspace' }).click();
  const draft = { format: 'wisp-browser-workspace-v1', approval: 'not_granted', applied: false, baseline: code, candidate: code, suite_json: JSON.stringify({ version: 1, target: 'f', cases: [scenario('fresh', ['1'], 'Int', '1')] }) };
  await page.locator('#workspace-file').setInputFiles({ name: 'draft.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(draft, null, 2)) });
  await page.locator('#workspace-replace').click();
  await expect(page.locator('#review-status')).toContainText('no current review');
  await expect(page.locator('#review-diagnostics')).toHaveText('');
  await expect(page.locator('#review-filters')).toBeHidden();
  await expect(page.locator('#review-json')).toHaveText('');
  await submit(page);
  await expect(page.locator('#review-status')).toContainText('Pass');
  await expect(page.locator('#review-diagnostics')).toHaveText('');
  await expect(rows(page)).toHaveCount(1);
});

test('source-file replacement clears historical filtered results; stopping replacement execution leaves no visible data', async ({ page }) => {
  await page.goto('?workbench'); await submit(page);
  const source = await page.locator('#source').inputValue();
  await attention(page).click();
  await page.locator('#source').fill(source + '\n');
  await expect(page.locator('#review-decisions caption')).toContainText('Historical review');
  const code = 'fn f() -> Int { 1 }';
  const suite = JSON.stringify({ version: 1, target: 'f', cases: [scenario('imported', [], 'Int', '1')] });
  const file = (name, value) => ({ name, mimeType: 'application/octet-stream', buffer: Buffer.from(value) });
  await page.locator('#policy-files-baseline').setInputFiles(file('baseline.wisp', code));
  await page.locator('#policy-files-candidate').setInputFiles(file('candidate.wisp', code));
  await page.locator('#policy-files-suite').setInputFiles(file('cases.json', suite));
  await page.locator('#policy-files-open').click();
  await expect(page.locator('#review-status')).toContainText('no current review');
  await expect(page.locator('#review-filters')).toBeHidden();
  await expect(page.locator('#review-decisions')).toHaveText('');
  await expect(page.locator('#review-cases')).toHaveText('');
  await expect(page.locator('#review-diagnostics')).toHaveText('');
  await submit(page);
  await expect(rows(page)).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'All scenarios', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => { document.querySelector('#review-run').click(); document.querySelector('#review-stop').click(); });
  await expect(page.locator('#review-status')).toContainText('Host interruption');
  await expect(page.locator('#review-filters')).toBeHidden();
  await expect(page.locator('#review-decisions')).toHaveText('');
  await expect(page.locator('#review-json')).toHaveText('');
});
