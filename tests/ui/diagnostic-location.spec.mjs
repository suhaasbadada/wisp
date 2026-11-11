import { test, expect } from '@playwright/test';

const good = 'fn f() -> Int { 2 }';
const bad = '// 😀 café NUL:\0 <svg/onload=alert(1)>\nfn f() -> Int { missing }';
const suite = JSON.stringify({ version: 1, target: 'f', cases: [{ id: 'example', args: [], expect: { result: { type: 'Int', value: '2' }, output: '' } }] });
const buttons = page => page.locator('#review-diagnostics button');
async function submit(page) {
  await page.locator('#review-run').click();
  await expect(page.locator('#review-status')).toContainText('Submitted inputs');
}
async function setup(page, baseline = good, candidate = bad) {
  await page.goto('');
  await page.locator('#source').fill(baseline); await page.locator('#review-capture').click();
  await page.locator('#source').fill(candidate); await page.locator('#review-suite').fill(suite);
  await submit(page);
}
async function selection(page, selector = '#source') {
  return page.locator(selector).evaluate(node => ({ start: node.selectionStart, end: node.selectionEnd, text: node.value.slice(node.selectionStart, node.selectionEnd), focused: document.activeElement === node }));
}
async function holdCallback(page) {
  await buttons(page).evaluate(node => { window.oldSelect = node.onclick; });
}
async function proveOldCallbackInert(page) {
  await page.locator('#source').evaluate(node => { node.focus(); node.setSelectionRange(1, 1); });
  await page.evaluate(() => window.oldSelect());
  expect(await selection(page)).toEqual({ start: 1, end: 1, text: '', focused: true });
}

test('native candidate cause selects exact UTF-16 substring after Unicode, retaining native bytes and all inputs', async ({ page }) => {
  await page.addInitScript(() => {
    const Native = window.Worker; window.workers = 0; window.inputEvents = 0;
    window.Worker = class extends Native { constructor(...args) { super(...args); window.workers++; } };
    document.addEventListener('input', () => window.inputEvents++);
  });
  await setup(page);
  const raw = await page.locator('#review-json').textContent(); const report = JSON.parse(raw);
  const span = report.review.cause.diagnostic.span;
  expect(report.diagnostics[0].path).toBe('/candidate');
  expect(span.start).toBe(Buffer.byteLength(bad.slice(0, bad.indexOf('missing'))));
  await expect(buttons(page)).toHaveText(`Select candidate error (line 2, bytes ${span.start}–${span.end})`);
  const counters = await page.evaluate(() => [window.workers, window.inputEvents]);
  await buttons(page).click();
  expect(await selection(page)).toEqual({ start: bad.indexOf('missing'), end: bad.indexOf('missing') + 7, text: 'missing', focused: true });
  await expect(page.locator('#source')).toHaveValue(bad); await expect(page.locator('#review-baseline')).toHaveValue(good);
  await expect(page.locator('#review-suite')).toHaveValue(suite); await expect(page.locator('#review-json')).toHaveText(raw);
  await expect(page.locator('#review-status')).not.toContainText('Historical');
  await expect(page.locator('#review-download-evidence')).toBeEnabled();
  expect(await page.evaluate(() => [window.workers, window.inputEvents])).toEqual(counters);
  await expect(page.locator('#review-diagnostics svg')).toHaveCount(0);
});

test('baseline native source error opens readonly baseline and never selects or changes candidate', async ({ page }) => {
  await setup(page, bad, good);
  const before = await selection(page);
  await expect(page.locator('#review-baseline')).toBeHidden();
  await expect(buttons(page)).toContainText('Select baseline error (line 2, bytes');
  await buttons(page).click();
  await expect(page.locator('#review-baseline')).toBeVisible();
  await expect(page.locator('#review-baseline')).toHaveAttribute('readonly', '');
  expect(await selection(page, '#review-baseline')).toEqual({ start: bad.indexOf('missing'), end: bad.indexOf('missing') + 7, text: 'missing', focused: true });
  expect((await selection(page)).start).toBe(before.start);
  await expect(page.locator('#source')).toHaveValue(good);
});

test('native parse error also selects original candidate token, not remapped root zero', async ({ page }) => {
  const code = '// é 😀\nfn f() -> Int { @ }';
  await setup(page, good, code);
  const report = JSON.parse(await page.locator('#review-json').textContent());
  expect(report.review.cause.diagnostic.kind).toBe('Syntax');
  await expect(buttons(page)).toHaveCount(1); await buttons(page).click();
  expect((await selection(page)).text).toBe('@');
  expect((await selection(page)).start).toBe(code.indexOf('@'));
});

test('source and suite edit/revert and recapture invalidate retained callbacks; filters cannot revive them', async ({ page }) => {
  await setup(page);
  for (const selector of ['#source', '#review-suite']) {
    if (selector === '#review-suite') await submit(page);
    await holdCallback(page);
    const original = await page.locator(selector).inputValue();
    await page.locator(selector).fill(original + '\n'); await page.locator(selector).fill(original);
    await expect(buttons(page)).toBeDisabled(); await proveOldCallbackInert(page);
    await page.evaluate(() => { document.querySelector('#review-filter-attention').click(); document.querySelector('#review-filter-all').click(); });
    await expect(buttons(page)).toBeDisabled();
    await expect(page.locator('#review-download-evidence')).toBeDisabled();
  }
  await submit(page); await holdCallback(page); await page.locator('#review-capture').click();
  await expect(buttons(page)).toBeDisabled(); await proveOldCallbackInert(page);
});

test('new accepted review, start/stop and imported report history never reuse an old navigation binding', async ({ page }) => {
  await setup(page); await holdCallback(page);
  const report = JSON.parse(await page.locator('#review-json').textContent());
  await submit(page); await proveOldCallbackInert(page);
  await buttons(page).click(); expect((await selection(page)).text).toBe('missing');
  await holdCallback(page);
  await page.evaluate(() => { document.querySelector('#review-run').click(); document.querySelector('#review-stop').click(); });
  await expect(buttons(page)).toHaveCount(0); await proveOldCallbackInert(page);
  await page.locator('summary').filter({ hasText: 'Save or reopen your workspace' }).click();
  const file = { format: 'wisp-browser-review-v1', approval: 'not_granted', applied: false, baseline: good, candidate: bad, suite_json: suite, report };
  await page.locator('#workspace-file').setInputFiles({ name: 'review.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file, null, 2)) });
  await page.locator('#workspace-replace').click();
  await expect(page.locator('#workspace-history')).toBeVisible(); await expect(buttons(page)).toHaveCount(0);
  await proveOldCallbackInert(page);
  await submit(page); await expect(buttons(page)).toBeEnabled();
  await page.locator('#workspace-restore-previous').click();
  await expect(buttons(page)).toHaveCount(0);
});

test('runtime cells and native data-path/source-limit rejections do not navigate source placeholders', async ({ page }) => {
  await page.addInitScript(() => {
    const Native = window.Worker;
    window.Worker = class extends Native {
      postMessage(message, ...args) {
        if (window.limitSource && message.requestJson) {
          const request = JSON.parse(message.requestJson); request.limits = { source_bytes: 10 };
          message = { ...message, requestJson: JSON.stringify(request) };
        }
        super.postMessage(message, ...args);
      }
    };
  });
  await setup(page, 'fn f() -> Int { 1 / 0 }', good);
  const report = JSON.parse(await page.locator('#review-json').textContent());
  expect(report.review.cases[0].before.status).toBe('Error'); expect(report.diagnostics).toEqual([]);
  await expect(buttons(page)).toHaveCount(0);
  await page.locator('#review-suite').fill(suite.replace('"args":[]', '"args":["1"]')); await submit(page);
  await expect(page.locator('#review-diagnostics')).toContainText('/suite'); await expect(buttons(page)).toHaveCount(0);
  // Ask the real native worker for a smaller budget to exercise source limits;
  // do not fabricate a source error or use the root's placeholder as a span.
  await page.evaluate(() => { window.limitSource = true; });
  await submit(page);
  await expect(page.locator('#review-diagnostics')).toContainText('E_LIMIT_SOURCE');
  await expect(page.locator('#review-diagnostics')).toContainText('/source'); await expect(buttons(page)).toHaveCount(0);
});

test('real worker response robustness rejects uncertain ownership, malformed spans, missing acceptance and mismatched cause identity', async ({ page }) => {
  await page.addInitScript(() => {
    const Native = window.Worker;
    window.Worker = class extends Native {
      set onmessage(handler) {
        super.onmessage = event => {
          const r = event.data.report; const c = r?.review?.cause;
          if (c) switch (window.mutation) {
            case 'missing': delete r.review.cause; break;
            case 'owner': c.document = 'baseline'; break;
            case 'unknown': r.review.diagnostic_document = 'external'; break;
            case 'identity': c.diagnostic.message += ' unrelated'; break;
            case 'path': c.diagnostic.path = '/suite/args'; break;
            case 'range': c.diagnostic.span.end = 999999; break;
            case 'boundary': c.diagnostic.span = { start: 4, end: 5 }; break;
            case 'negative': c.diagnostic.span.start = -1; break;
            case 'fraction': c.diagnostic.span.start = 0.5; break;
            case 'reversed': c.diagnostic.span.end = 0; break;
            case 'review': delete r.review; break;
            case 'shape': r.review.contract_version = 999; break;
            case 'unrelated': r.diagnostics.push({ ...r.diagnostics[0], message: 'Other unrelated error' }); break;
            case 'caret': c.diagnostic.span.end = c.diagnostic.span.start; break;
          }
          handler?.(event);
        };
      }
    };
  });
  await setup(page);
  for (const mutation of ['missing', 'owner', 'unknown', 'identity', 'path', 'range', 'boundary', 'negative', 'fraction', 'reversed', 'review', 'shape']) {
    await page.evaluate(value => { window.mutation = value; }, mutation);
    await page.locator('#review-run').click();
    await expect(page.locator('#review-status')).not.toContainText('Reviewing');
    await expect(buttons(page), mutation).toHaveCount(0);
  }
  await page.evaluate(() => { window.mutation = 'unrelated'; }); await submit(page);
  await expect(page.locator('#review-diagnostics li')).toHaveCount(2); await expect(buttons(page)).toHaveCount(1);
  await page.evaluate(() => { window.mutation = 'caret'; }); await submit(page); await buttons(page).click();
  expect(await selection(page)).toEqual({ start: bad.indexOf('missing'), end: bad.indexOf('missing'), text: '', focused: true });
});

test('non-scalar source and textarea normalization mismatch cannot enable navigation', async ({ page }) => {
  await setup(page);
  await page.locator('#source').evaluate(node => { node.value = '// invalid ' + String.fromCharCode(0xd800) + '\nfn f() -> Int { 2 }'; node.dispatchEvent(new Event('input')); });
  await page.locator('#review-capture').click();
  await page.locator('#source').fill(bad); await page.locator('#review-run').click();
  await expect(page.locator('#review-status')).toContainText('no review accepted');
  await expect(buttons(page)).toHaveCount(0);
  await setup(page);
  await buttons(page).evaluate(node => { window.oldSelect = node.onclick; });
  // Unsupported host control changes without input events must still fail the live equality guard.
  await page.locator('#review-baseline').evaluate(node => { node.value += '\r\n'; });
  await proveOldCallbackInert(page);
});
