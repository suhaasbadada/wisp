import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const scenario = (id, value, type = 'Int', args = [], output = '') => ({ id, args, expect: { result: { type, value }, output } });
const panels = page => page.locator('#review-decisions .value-changes');
const observed = page => panels(page).locator('.observed-value-changes');
const required = page => panels(page).locator('.requirement-differences');
const cells = view => view.locator('[role="cell"]');
async function submit(page) {
  await page.locator('#review-run').click();
  await expect(page.locator('#review-status')).toContainText('Submitted inputs');
  return JSON.parse(await page.locator('#review-json').textContent());
}
async function custom(page, before, after, cases) {
  await page.goto(''); await page.locator('#source').fill(before); await page.locator('#review-capture').click();
  await page.locator('#source').fill(after);
  await page.locator('#review-suite').fill(JSON.stringify({ version: 1, target: 'f', cases }));
  return submit(page);
}
async function download(page) {
  const pending = page.waitForEvent('download'); await page.locator('#review-download-readable').click();
  return readFile(await (await pending).path(), 'utf8');
}

test('expense receipt and cap boundaries expose exact reason and Bool changes beside authoritative outcomes', async ({ page }) => {
  await page.goto('?workbench'); await page.locator('#workbench-expense').click();
  const report = await submit(page);
  expect(report.review.summary).toMatchObject({ total: 7, changed: 2, expectation_pass: 7 });
  for (const [index, reason] of [[3, 'receipt required'], [5, 'over cap']]) {
    const view = observed(page).nth(index); await view.locator('summary').click();
    await expect(cells(view)).toHaveText(['"/result/value/reason"', JSON.stringify(reason), '"allowed"', '"/result/value/reimbursable"', 'false', 'true']);
  }
  await expect(page.locator('#review-decisions')).toContainText('Comparison: Changed');
  await expect(required(page).first()).toContainText('No supported transport differences');
});

test('reservation packs and expiry show literal field paths without redefining native comparison', async ({ page }) => {
  await page.goto('?workbench'); const report = await submit(page);
  const changed = report.review.cases.map((row, index) => ({ row, index })).filter(({ row }) => row.comparison === 'Changed');
  expect(changed.length).toBeGreaterThan(0);
  for (const { row, index } of changed) {
    const view = observed(page).nth(index); await view.locator('summary').click();
    for (const key of Object.keys(row.before.result.value)) {
      if (row.before.result.value[key] !== row.after.result.value[key]) {
        await expect(view).toContainText(JSON.stringify(`/result/value/${key}`));
        await expect(view).toContainText(JSON.stringify(row.before.result.value[key]));
        await expect(view).toContainText(JSON.stringify(row.after.result.value[key]));
      }
    }
  }
  await expect(observed(page).filter({ hasText: '"/result/value/packs"' }).first()).toContainText('"3"');
});

test('full i64 decimal strings stay lexical; incompatible nominal types remain native preflight errors', async ({ page }) => {
  const report = await custom(page, 'fn f() -> Int { 9223372036854775806 }', 'fn f() -> Int { 9223372036854775807 }', [scenario('i64', '9223372036854775807')]);
  expect(report.status).toBe('Pass'); await observed(page).locator('summary').click();
  await expect(cells(observed(page))).toHaveText(['"/result/value"', '"9223372036854775806"', '"9223372036854775807"']);
  const rejected = await custom(page, 'fn f() -> Int { 2 }', 'fn f() -> String { "2" }', [scenario('nominal', '2', 'String')]);
  expect(rejected.status).toBe('Error'); expect(rejected.review.cases).toEqual([]);
  await expect(panels(page)).toHaveCount(0);
});

test('Unicode hostile text, NUL and output quotes are literal in live and script-free offline HTML', async ({ page, browser }) => {
  const hostile = '<img src="https://invalid.test/leak" onerror="alert(1)">😀\0\n雪';
  const code = 'fn f(x: String) -> String { "" }';
  const after = 'fn f(x: String) -> String { print(x); x }';
  const report = await custom(page, code, after, [scenario('literal', hostile, 'String', [hostile])]);
  expect(report.status).toBe('Fail'); await observed(page).locator('summary').click();
  await expect(cells(observed(page))).toHaveText(['"/result/value"', '""', JSON.stringify(hostile), '"/output"', '""', JSON.stringify(hostile + '\n')]);
  const live = await panels(page).innerHTML(); const html = await download(page);
  const context = await browser.newContext({ offline: true }); const saved = await context.newPage(); const requests = [];
  saved.on('request', request => requests.push(request.url()));
  try {
    await saved.setContent(html); const offline = saved.locator('.value-changes');
    // Open state is deliberately preserved by the shared static renderer only
    // as closed details; compare content rather than transient live open state.
    await expect(offline).toContainText(JSON.stringify(hostile + '\n'));
    expect(live).toContain('\\u0000');
    await expect(saved.locator('script, img, iframe, link')).toHaveCount(0);
    expect(JSON.parse(await saved.locator('#native-report').textContent())).toEqual(report);
    expect(requests).toEqual([]);
  } finally { await context.close(); }
});

test('nested Bool and __proto__ own field changes are safe literal leaves', async ({ page }) => {
  const prefix = 'record Inner { __proto__: Bool } record Outer { nested: Inner } fn f() -> Outer { new Outer { nested: new Inner { __proto__: ';
  const expected = JSON.parse('{"nested":{"__proto__":true}}');
  const report = await custom(page, prefix + 'false } } }', prefix + 'true } } }', [scenario('nested', expected, 'Outer')]);
  expect(report.status).toBe('Pass'); await observed(page).locator('summary').click();
  await expect(cells(observed(page))).toHaveText(['"/result/value/nested/__proto__"', 'false', 'true']);
  expect(await page.evaluate(() => Object.prototype.polluted)).toBeUndefined();
});

test('accepted requirement 999 remains historical after editing and filters/export never execute', async ({ page, browser }) => {
  await page.addInitScript(() => {
    const Native = window.Worker; window.reviewCalls = 0;
    window.Worker = class extends Native { postMessage(message, ...args) { if (message.requestJson && JSON.parse(message.requestJson).op === 'review') window.reviewCalls++; super.postMessage(message, ...args); } };
  });
  await page.goto('?workbench');
  const card = page.locator('.scenario-card').filter({ has: page.locator('summary', { hasText: /^exact-pack$/ }) });
  await card.locator('summary').click(); await card.getByLabel('Required: packs', { exact: true }).fill('999');
  const report = await submit(page); expect(report.status).toBe('Fail');
  await required(page).first().locator('summary').click();
  await expect(cells(required(page).first())).toHaveText(['"/result/value/packs"', '"999"', '"2"']);
  const count = await page.evaluate(() => window.reviewCalls);
  await page.locator('#review-filter-attention').click();
  const html = await download(page); const saved = await browser.newPage();
  try { await saved.setContent(html); await expect(saved.locator('.value-changes')).toHaveCount(7); } finally { await saved.close(); }
  expect(await page.evaluate(() => window.reviewCalls)).toBe(count);
  await card.getByLabel('Required: packs', { exact: true }).fill('123');
  await expect(page.locator('#review-status')).toContainText('Historical');
  await expect(required(page).first()).toContainText('"999"');
  await expect(required(page).first()).not.toContainText('"123"');
  expect(JSON.parse(await page.locator('#review-json').textContent())).toEqual(report);
});

test('native Error/Unknown are unavailable, repaired baseline only permits requirement comparison, preflight invents nothing', async ({ page }) => {
  const before = 'fn f(x: Int) -> Int { if x == 0 { 1 / x } else { x } }';
  const after = 'fn f(x: Int) -> Int { if x == 1 { 1 / (x - 1) } else { if x == 2 { f(x) } else { x } } }';
  const report = await custom(page, before, after, [scenario('repaired', '0', 'Int', ['0']), scenario('error', '1', 'Int', ['1']), scenario('unknown', '2', 'Int', ['2'])]);
  expect(report.review.cases.map(row => row.expectation)).toEqual(['Pass', 'Error', 'Unknown']);
  await expect(observed(page).nth(0)).toContainText('before native status "Error"; proposed native status "Complete"');
  await expect(required(page).nth(0)).toContainText('No supported transport differences');
  for (const index of [1, 2]) { await expect(observed(page).nth(index)).toContainText('Unavailable'); await expect(required(page).nth(index)).toContainText('Unavailable'); await expect(cells(panels(page).nth(index))).toHaveCount(0); }
  const preflight = await custom(page, 'fn f() -> Int { true }', 'fn f() -> Int { 2 }', [scenario('bad', '2')]);
  expect(preflight.review.cases).toEqual([]); await expect(panels(page)).toHaveCount(0);
});

// Mutation is only for unsupported shapes and UI bounds, never fabricated
// native success. Every response first comes from a real Rust/WASM execution.
test('unsupported and bounded projections fail closed with unchanged native verdict and retained full JSON', async ({ page, browser }) => {
  await page.addInitScript(() => {
    const Native = window.Worker;
    window.Worker = class extends Native { set onmessage(handler) { super.onmessage = event => {
      const row = event.data.report?.review?.cases?.[0];
      if (row && window.projectionMode) {
        const mode = window.projectionMode;
        const many = changed => Object.fromEntries(Array.from({ length: 3 }, (_, group) => [`g${group}`, Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`k${i}`, mode === 'text' ? (changed ? '\0' : '\u0001').repeat(600) : changed ? 'new' : 'old']))]));
        const nested = count => count ? { child: nested(count - 1) } : 'leaf';
        const value = side => mode === 'rows' || mode === 'text' ? many(side) : mode === 'depth' ? nested(17) : mode === 'fields' ? Object.fromEntries(Array.from({ length: 33 }, (_, i) => [`k${i}`, 'x'])) : mode === 'nodes' ? Object.fromEntries(Array.from({ length: 32 }, (_, i) => [`g${i}`, Object.fromEntries(Array.from({ length: 32 }, (_, j) => [`k${j}`, 'x']))])) : mode === 'path' ? { ['x'.repeat(9000)]: 'x' } : mode === 'array' ? [] : mode === 'number' ? 42 : mode === 'missing' ? undefined : mode === 'surrogate' ? '\ud800' : mode === 'surrogate-key' ? { ['\ud800']: 'value' } : side ? '😀'.repeat(600) : 'old';
        row.before.result.value = value(false); row.after.result.value = value(true);
      }
      handler?.(event);
    }; } };
  });
  await custom(page, 'fn f() -> Int { 1 }', 'fn f() -> Int { 2 }', [scenario('projection', '2')]);
  for (const mode of ['array', 'number', 'missing', 'surrogate', 'surrogate-key', 'depth', 'fields', 'nodes', 'path', 'rows', 'text', 'long']) {
    await page.evaluate(mode => { window.projectionMode = mode; }, mode);
    const report = await submit(page); expect(report.status).toBe('Pass');
    await observed(page).first().locator('summary').click();
    if (mode === 'array') {
      await expect(observed(page).first()).toContainText('No supported transport differences');
      await expect(observed(page).first()).not.toContainText('not guaranteed complete');
      await expect(cells(observed(page).first())).toHaveCount(0);
      continue;
    }
    await expect(observed(page).first()).toContainText('not guaranteed complete');
    expect(await cells(observed(page).first()).count()).toBeLessThanOrEqual(64 * 3);
    expect(await panels(page).first().evaluate(node => new TextEncoder().encode(node.textContent).length)).toBeLessThanOrEqual(256 * 1024);
    if (['number', 'missing', 'surrogate', 'surrogate-key', 'depth', 'fields', 'nodes', 'path'].includes(mode)) {
      await expect(observed(page).first()).not.toContainText('No supported transport differences');
      await expect(cells(observed(page).first())).toHaveCount(0);
    }
    if (mode === 'long') {
      await expect(observed(page).first()).toContainText('truncated: 512 Unicode scalars');
      const html = await download(page); const saved = await browser.newPage();
      try { await saved.setContent(html); expect(JSON.parse(await saved.locator('#native-report').textContent())).toEqual(report); await expect(saved.locator('.observed-value-changes').first()).toContainText('truncated: 512 Unicode scalars'); } finally { await saved.close(); }
    }
  }
});

test('transport presence, null and JSON-pointer escaping are distinct without reinterpreting native verdicts', async ({ page }) => {
  await page.addInitScript(() => {
    const Native = window.Worker;
    window.Worker = class extends Native { set onmessage(handler) { super.onmessage = event => {
      const row = event.data.report?.review?.cases?.[0];
      if (row) {
        // Exercise transport display only, starting with a real native report.
        row.before.result.value = { 'a/b~c': null, empty: {}, branch: 'old' };
        row.after.result.value = { 'a/b~c': false, branch: { leaf: 'new' } };
      }
      handler?.(event);
    }; } };
  });
  const report = await custom(page, 'fn f() -> Int { 1 }', 'fn f() -> Int { 2 }', [scenario('transport-only', '2')]);
  expect(report.status).toBe('Pass'); await observed(page).locator('summary').click();
  await expect(cells(observed(page))).toHaveText([
    '"/result/value/a~1b~0c"', 'null', 'false',
    '"/result/value/empty"', 'present empty record {}', 'absent',
    '"/result/value/branch"', '"old"', 'present record (bounded leaf paths below)',
    '"/result/value/branch/leaf"', 'absent', '"new"',
  ]);
  await expect(page.locator('.native-case-status').first()).toContainText('Expectation: Pass');
  expect(JSON.parse(await page.locator('#review-json').textContent())).toEqual(report);
});
