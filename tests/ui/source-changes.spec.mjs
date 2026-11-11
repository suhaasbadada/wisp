import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const viewer = page => page.locator('#review-source-changes');
const side = (page, name) => viewer(page).locator(`[data-side="${name}"]`);
const suite = JSON.stringify({ version: 1, target: 'f', cases: [{ id: 'example', args: [], expect: { result: { type: 'Int', value: '2' }, output: '' } }] });
async function submit(page) {
  await page.locator('#review-run').click();
  await expect(page.locator('#review-status')).toContainText('Submitted inputs');
  await expect(viewer(page)).toHaveCount(1);
}
async function custom(page, baseline, candidate) {
  await page.goto('');
  const setSource = async value => {
    if (value.length < 10000) await page.locator('#source').fill(value);
    else await page.locator('#source').evaluate((node, text) => { node.value = text; node.dispatchEvent(new Event('input')); }, value);
  };
  await setSource(baseline); await page.locator('#review-capture').click();
  await setSource(candidate); await page.locator('#review-suite').fill(suite);
  await submit(page); await viewer(page).locator('summary').click();
}
async function download(page, selector) {
  const pending = page.waitForEvent('download'); await page.locator(selector).click();
  return readFile(await (await pending).path(), 'utf8');
}

test('real function change shows saved code, separate line numbers and three lines of context per edge', async ({ page }) => {
  const prefix = Array.from({ length: 5 }, (_, i) => `// before ${i}\n`).join('');
  const suffix = Array.from({ length: 5 }, (_, i) => `// after ${i}\n`).join('');
  await custom(page, prefix + 'fn f() -> Int { 1 }\n' + suffix, prefix + 'fn f() -> Int { 2 }\n' + suffix);
  await expect(page.locator('#review-status')).toContainText('Pass');
  await expect(page.locator('#review-decisions')).toContainText('Comparison: Changed');
  await expect(viewer(page)).toContainText('Text comparison, not semantic diff/preservation proof; one region, not minimal edit script');
  for (const name of ['baseline', 'candidate']) {
    await expect(side(page, name).locator('.source-line')).toHaveCount(7);
    await expect(side(page, name)).toContainText('Omitted 2 lines (1–2): outside context window');
    await expect(side(page, name)).toContainText('Omitted 2 lines (10–11): outside context window');
  }
  await expect(side(page, 'baseline').locator('.source-before .source-line-number')).toHaveText('− 6');
  await expect(side(page, 'candidate').locator('.source-after .source-line-number')).toHaveText('+ 6');
  await expect(side(page, 'baseline').locator('.source-before .source-line-text')).toHaveText('fn f() -> Int { 1 }');
  await expect(side(page, 'candidate').locator('.source-after .source-line-text')).toHaveText('fn f() -> Int { 2 }');
});

test('comments and untested helper changes remain visible with unchanged passing cases; filters are display-only', async ({ page }) => {
  await page.addInitScript(() => {
    const Native = window.Worker; window.workers = 0;
    window.Worker = class extends Native {
      postMessage(message, ...args) {
        if (message.requestJson && JSON.parse(message.requestJson).op === 'review') window.workers++;
        super.postMessage(message, ...args);
      }
    };
  });
  const baseline = '// old comment\nfn helper() -> Int { 8 }\nfn f() -> Int { 2 }';
  const candidate = '// new comment\nfn helper() -> Int { 9 }\nfn f() -> Int { 2 }';
  await custom(page, baseline, candidate);
  await expect(page.locator('#review-decisions')).toContainText('Comparison: Unchanged');
  await expect(page.locator('#review-status')).toContainText('Pass');
  const html = await viewer(page).innerHTML(); const report = await page.locator('#review-json').textContent();
  const workers = await page.evaluate(() => window.workers);
  await page.locator('#review-filter-attention').click();
  await expect(page.locator('#review-decisions tbody tr')).toHaveCount(0);
  expect(await viewer(page).innerHTML()).toBe(html);
  await expect(side(page, 'baseline')).toContainText('fn helper() -> Int { 8 }');
  await expect(side(page, 'candidate')).toContainText('// new comment');
  await expect(page.locator('#source')).toHaveValue(candidate); await expect(page.locator('#review-suite')).toHaveValue(suite);
  await expect(page.locator('#review-json')).toHaveText(report);
  expect(await page.evaluate(() => window.workers)).toBe(workers);
});

test('identical source states textual equality only and reports exact UTF-8 byte counts', async ({ page }) => {
  const source = '// 😀 café\nfn f() -> Int { 2 }\n';
  await custom(page, source, source);
  await expect(viewer(page)).toContainText('No textual changes. This is not a semantic identity proof.');
  for (const name of ['baseline', 'candidate']) {
    await expect(side(page, name)).toContainText(`${Buffer.byteLength(source)} UTF-8 bytes · 2 line tokens · Final LF: present`);
    await expect(side(page, name).locator('.source-line')).toHaveCount(0);
  }
});

test('terminal LF, genuine blank lines and empty source are distinct, including native preflight rejection', async ({ page }) => {
  const code = 'fn f() -> Int { 2 }';
  await custom(page, code, code + '\n');
  await expect(side(page, 'baseline').locator('.source-line-ending')).toHaveText('no LF');
  await expect(side(page, 'candidate').locator('.source-line-ending')).toHaveText('LF');
  await expect(side(page, 'candidate').locator('.source-line')).toHaveCount(1);
  await custom(page, '\n\n' + code + '\n', '\n' + code + '\n\n');
  await expect(side(page, 'baseline').locator('.source-line-ending').first()).toHaveText('[blank line] · LF');
  await expect(side(page, 'candidate').locator('.source-line-ending').last()).toHaveText('[blank line] · LF');
  await custom(page, '', '\n');
  const report = JSON.parse(await page.locator('#review-json').textContent());
  expect(report.review.phase).toBe('preflight'); expect(report.review.new_execution).toBe(false);
  expect(report.review.cases).toEqual([]);
  await expect(side(page, 'baseline')).toContainText('0 UTF-8 bytes · 0 line tokens · Final LF: absent (empty source)');
  await expect(side(page, 'baseline')).toContainText('Empty source (0 lines)');
  await expect(side(page, 'candidate').locator('.source-line-number')).toHaveText('+ 1');
  await expect(side(page, 'candidate').locator('.source-line-ending')).toHaveText('[blank line] · LF');
  await expect(page.locator('#review-diagnostics')).toContainText('path: /suite/target');
  await custom(page, 'fn f() -> Int { true }', code);
  await expect(page.locator('#review-diagnostics')).toContainText('document: baseline');
  await expect(side(page, 'baseline')).toContainText('fn f() -> Int { true }');
  await expect(side(page, 'candidate')).toContainText(code);
});

test('Unicode, hostile HTML and NUL are literal; offline viewer is the same saved presentation and exact JSON survives', async ({ page, browser }) => {
  const hostile = '</pre><script>alert(1)</script><img src="https://invalid.test/leak" onerror="alert(2)">';
  const baseline = `\n// old 😀 café NUL:\0 TAB:\t CTRL:\u0001 BIDI:\u061c\u200e\u200f\u202e ${hostile}\nfn f() -> Int { 2 }\n`;
  const candidate = baseline.replace('old', 'new');
  await custom(page, baseline, candidate);
  await expect(page.locator('#review-status')).toContainText('Pass');
  await expect(side(page, 'candidate')).toContainText(`// new 😀 café NUL:\\u0000 TAB:\\u0009 CTRL:\\u0001 BIDI:\\u061c\\u200e\\u200f\\u202e ${hostile}`);
  await expect(viewer(page).locator('script, img')).toHaveCount(0);
  const html = await viewer(page).innerHTML(); const report = await page.locator('#review-json').textContent();
  const raw = await download(page, '#review-download-readable');
  const context = await browser.newContext({ offline: true }); const saved = await context.newPage(); const requests = [];
  saved.on('request', request => requests.push(request.url()));
  try {
    await saved.setContent(raw); await viewer(saved).locator('summary').click();
    expect(await viewer(saved).innerHTML()).toBe(html);
    await expect(saved.locator('script, img, iframe, link')).toHaveCount(0);
    expect(JSON.parse(await saved.locator('#exact-inputs').textContent())).toEqual({ baseline, candidate, suite_json: suite });
    expect(await saved.locator('#baseline-source').textContent()).toBe(baseline.replaceAll('\0', '\\u0000'));
    expect(await saved.locator('#native-report').textContent()).toBe(report);
    expect(requests).toEqual([]);
  } finally { await context.close(); }
});

test('64 KiB sources cap DOM at 200 lines per side with exact omitted ranges, also offline; full sources retained', async ({ page, browser }) => {
  const make = value => {
    const body = `// ${value}\n` + '// x\n'.repeat(6000) + `fn f() -> Int { ${value} }\n`;
    return body + '//' + 'x'.repeat(65536 - Buffer.byteLength(body) - 3) + '\n';
  };
  const baseline = make('1'); const candidate = make('2');
  expect(Buffer.byteLength(baseline)).toBe(65536); expect(Buffer.byteLength(candidate)).toBe(65536);
  await custom(page, baseline, candidate);
  const report = JSON.parse(await page.locator('#review-json').textContent()); expect(report.review).toBeTruthy();
  for (const name of ['baseline', 'candidate']) {
    await expect(side(page, name).locator('.source-line')).toHaveCount(200);
    await expect(side(page, name)).toContainText('65536 UTF-8 bytes · 6003 line tokens');
    await expect(side(page, name)).toContainText('Omitted 5803 lines (101–5903): 200-line display cap');
    await expect(side(page, name).locator('.source-line-number').last()).toHaveText('= 6003');
  }
  const live = await viewer(page).innerHTML(); const raw = await download(page, '#review-download-readable');
  const context = await browser.newContext({ offline: true }); const saved = await context.newPage();
  try {
    await saved.setContent(raw);
    expect(await viewer(saved).innerHTML()).toBe(live);
    expect(JSON.parse(await saved.locator('#exact-inputs').textContent())).toEqual({ baseline, candidate, suite_json: suite });
    expect(await saved.locator('#candidate-source').textContent()).toBe(candidate);
  } finally { await context.close(); }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await viewer(page).evaluate(node => node.getBoundingClientRect().right <= innerWidth)).toBe(true);
});

test('edits and reverts retain a clearly historical snapshot; import and pending start/stop clear it', async ({ page }) => {
  await page.addInitScript(() => {
    const Native = window.Worker;
    window.Worker = class extends Native { set onmessage(handler) { super.onmessage = event => { if (!window.holdReply) handler?.(event); }; } };
  });
  const baseline = 'fn f() -> Int { 1 }'; const candidate = 'fn f() -> Int { 2 }';
  await custom(page, baseline, candidate);
  const grid = await viewer(page).locator('.source-change-grid').innerHTML();
  await page.locator('#source').fill('fn f() -> Int { 999 }');
  await expect(viewer(page).locator('summary')).toContainText('Historical review; saved inputs, not live editor');
  expect(await viewer(page).locator('.source-change-grid').innerHTML()).toBe(grid);
  await page.locator('#source').fill(candidate);
  await expect(viewer(page).locator('summary')).toContainText('Historical review');
  await expect(page.locator('#review-download-readable')).toBeDisabled();
  await page.locator('summary').filter({ hasText: 'Save or reopen your workspace' }).click();
  const draft = { format: 'wisp-browser-workspace-v1', approval: 'not_granted', applied: false, baseline, candidate, suite_json: suite };
  await page.locator('#workspace-file').setInputFiles({ name: 'draft.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(draft, null, 2)) });
  await page.locator('#workspace-replace').click();
  await expect(viewer(page)).toHaveCount(0); await submit(page);
  await page.evaluate(() => { window.holdReply = true; });
  await page.locator('#review-run').click();
  await expect(viewer(page)).toHaveCount(0); await expect(page.locator('#review-status')).toContainText('Reviewing');
  await page.locator('#review-stop').click(); await expect(viewer(page)).toHaveCount(0);
});

test('missing native review and worker failure never expose a source comparison', async ({ page }) => {
  await page.addInitScript(() => {
    const Native = window.Worker;
    window.Worker = class extends Native {
      set onmessage(handler) { super.onmessage = event => { if (window.omitReview && event.data.report) delete event.data.report.review; handler?.(event); }; }
      postMessage(...args) { if (window.failWorker) this.dispatchEvent(new ErrorEvent('error')); else super.postMessage(...args); }
    };
  });
  await custom(page, 'fn f() -> Int { 1 }', 'fn f() -> Int { 2 }');
  await page.evaluate(() => { window.omitReview = true; });
  await page.locator('#review-run').click(); await expect(page.locator('#review-status')).toContainText('no review accepted');
  await expect(viewer(page)).toHaveCount(0);
  await page.evaluate(() => { window.failWorker = true; });
  await page.locator('#review-run').click(); await expect(page.locator('#review-status')).toContainText('worker failed');
  await expect(viewer(page)).toHaveCount(0); await expect(page.locator('#review-download-readable')).toBeDisabled();
});
