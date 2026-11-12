import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const observed = page => page.locator('#review-decisions .observed-value-changes');
const required = page => page.locator('#review-decisions .requirement-differences');
const cells = view => view.locator('[role="cell"]');
const identity = 'fn f(xs:[Int])->[Int] {xs}';
const scenario = (id, args, value, type = '[Int]') => ({ id, args, expect: { result: { type, value }, output: '' } });
async function submit(page) {
  await page.locator('#review-run').click();
  await expect(page.locator('#review-status')).toContainText('Submitted inputs');
  return JSON.parse(await page.locator('#review-json').textContent());
}
async function review(page, before, after, cases) {
  await page.goto(''); await page.locator('#source').fill(before); await page.locator('#review-capture').click();
  await page.locator('#source').fill(after);
  await page.locator('#review-suite').fill(JSON.stringify({ version: 1, target: 'f', cases }));
  return submit(page);
}
async function offline(page, browser, report) {
  const live = await page.locator('#review-decisions .value-changes').allTextContents();
  const tables = await page.locator('#review-decisions .value-changes [role="table"]').evaluateAll(nodes => nodes.map(node => node.outerHTML));
  const pending = page.waitForEvent('download'); await page.locator('#review-download-readable').click();
  const html = await readFile(await (await pending).path(), 'utf8');
  const context = await browser.newContext({ offline: true }); const saved = await context.newPage(); const requests = [];
  saved.on('request', request => requests.push(request.url()));
  try {
    await saved.setContent(html);
    expect(await saved.locator('.value-changes').allTextContents()).toEqual(live);
    expect(await saved.locator('.value-changes [role="table"]').evaluateAll(nodes => nodes.map(node => node.outerHTML))).toEqual(tables);
    expect(JSON.parse(await saved.locator('#native-report').textContent())).toEqual(report);
    await expect(saved.locator('script, img, iframe, link, object, embed')).toHaveCount(0);
    expect(requests).toEqual([]);
  } finally { await context.close(); }
}

test('real WASM List returns expose changed positions and lexical i64s without changing owner requirements', async ({ page, browser }) => {
  const after = 'fn f(xs:[Int])->[Int] {[Int;xs[0]+1,xs[1]]}';
  let report = await review(page, identity, after, [
    scenario('pass', [['9223372036854775806', '-9223372036854775807']], ['9223372036854775807', '-9223372036854775807']),
  ]);
  expect(report.status).toBe('Pass');
  expect(report.review.cases[0].expectation).toBe('Pass');
  expect(report.review.cases[0].comparison).toBe('Changed');
  expect(report.review.cases[0].after.result.value).toEqual(['9223372036854775807', '-9223372036854775807']);
  await observed(page).nth(0).locator('summary').click();
  await expect(cells(observed(page).nth(0))).toHaveText(['"/result/value/0"', '"9223372036854775806"', '"9223372036854775807"']);
  await expect(page.locator('.value-changes').first()).toContainText('JSON position only, not row identity or moves');
  await offline(page, browser, report);
  report = await review(page, identity, after, [scenario('wrong-list', [['1', '2']], ['999', '2'])]);
  expect(report.status).toBe('Fail'); expect(report.review.cases[0].expectation).toBe('Fail');
  await required(page).locator('summary').click();
  await expect(cells(required(page))).toHaveText(['"/result/value/0"', '"999"', '"2"']);
  expect(report.review.cases[0].expected.result.value).toEqual(['999', '2']);
  await offline(page, browser, report);
});

test('empty, added, removed and shifted positions have explicit presence, never synthetic length or moves', async ({ page, browser }) => {
  const after = 'fn f(xs:[Int])->[Int] {if xs.length == 0 {[Int;7]} else {[Int;]}}';
  let report = await review(page, identity, after, [scenario('added', [[]], ['7']), scenario('removed', [['1', '2']], [])]);
  expect(report.status).toBe('Pass');
  for (const view of [observed(page).nth(0), observed(page).nth(1)]) await view.locator('summary').click();
  await expect(cells(observed(page).nth(0))).toHaveText([
    '"/result/value"', 'present empty list []', 'present list (bounded positional paths below)',
    '"/result/value/0"', 'absent', '"7"',
  ]);
  await expect(cells(observed(page).nth(1))).toHaveText([
    '"/result/value"', 'present list (bounded positional paths below)', 'present empty list []',
    '"/result/value/0"', '"1"', 'absent', '"/result/value/1"', '"2"', 'absent',
  ]);
  await expect(observed(page).first()).not.toContainText('/length');
  await offline(page, browser, report);
  report = await review(page, identity, identity, [scenario('empty', [[]], [])]);
  expect(report.status).toBe('Pass'); await expect(observed(page)).toContainText('No supported transport differences. Not a claim of universal native equivalence.');
  report = await review(page, identity, 'fn f(xs:[Int])->[Int] {[Int;xs[1]]}', [scenario('positional', [['4', '9']], ['9'])]);
  expect(report.status).toBe('Pass'); await observed(page).locator('summary').click();
  await expect(cells(observed(page))).toHaveText(['"/result/value/0"', '"4"', '"9"', '"/result/value/1"', '"9"', 'absent']);
});

test('real nested Lists and Records preserve __proto__, Unicode, NUL and hostile HTML as offline text', async ({ page, browser }) => {
  const hostile = '<img src="https://invalid.test/leak" onerror="alert(1)">😀\0雪';
  const prefix = 'record R {__proto__:String, flags:[Bool]} fn f(xs:[[R]])->[[R]] {';
  const before = prefix + '[[R];[R;new R {__proto__:"",flags:[Bool;false]}]]}';
  const after = prefix + '[[R];[R;new R {__proto__:xs[0][0].__proto__,flags:[Bool;true]}]]}';
  const report = await review(page, before, after, [scenario('nested', [[[{ ['__proto__']: hostile, flags: [false] }]]], [[{ ['__proto__']: hostile, flags: [true] }]], '[[R]]')]);
  expect(report.status).toBe('Pass'); await observed(page).locator('summary').click();
  await expect(cells(observed(page))).toHaveText(['"/result/value/0/0/__proto__"', '""', JSON.stringify(hostile), '"/result/value/0/0/flags/0"', 'false', 'true']);
  await offline(page, browser, report);
  expect(await page.evaluate(() => Object.prototype.polluted)).toBeUndefined();
});

// Mutate only the presentation input of real Rust/WASM reports. Native verdicts
// are not fabricated; these fixtures probe shapes/limits the core will not emit.
async function projection(page) {
  await page.addInitScript(() => {
    const Native = window.Worker;
    window.Worker = class extends Native { set onmessage(handler) { super.onmessage = event => {
      const row = event.data.report?.review?.cases?.[0];
      if (row && window.listProjection) {
        const mode = window.listProjection;
        const deep = count => count ? (count % 2 ? [deep(count - 1)] : { child: deep(count - 1) }) : [];
        const value = side => {
          if (mode === 'kinds') return side ? [{}, ['new'], false, [], [null]] : [[], 'old', {}, [null], []];
          if (mode === 'keys') return [{ ['a/b~c']: side ? '<svg onload="alert(1)">😀\0' : '', ['__proto__']: side }];
          if (mode === 'depth16' || mode === 'depth17') return deep(mode === 'depth16' ? 15 : 16);
          if (mode === '1025') return Array(1025).fill('x');
          if (mode === '2048' || mode === '2050') return Array(mode === '2048' ? 1021 : 1022).fill('x');
          if (mode === 'sparse') return Array(2);
          if (mode === 'extra') return Object.assign(['x'], { extra: 'x' });
          if (mode === 'symbol') { const xs = ['x']; xs[Symbol('x')] = 'x'; return xs; }
          if (mode === 'prototype') return Object.setPrototypeOf(['x'], null);
          if (mode === 'fake') return Object.create(Array.prototype);
          if (mode === 'accessor') { const xs = ['x']; Object.defineProperty(xs, '0', { get() { return 'x'; } }); return xs; }
          if (mode === 'tail') return [...Array(80).fill(side ? 'new' : 'old'), 42];
          if (mode === 'unchanged-tail') return [...Array(80).fill('same'), undefined];
          if (mode === 'rows') return Array(80).fill(side ? 'new' : 'old');
          if (mode === 'text') return Array(64).fill((side ? '\0' : '\u0001').repeat(600));
          if (mode === 'long') return [side ? '😀'.repeat(600) : 'old'];
          return [null];
        };
        row.before.result.value = value(false); row.after.result.value = value(true);
      }
      handler?.(event);
    }; } };
  });
  await review(page, identity, identity, [scenario('projection', [['1']], ['1'])]);
}

test('mixed List/Record/scalar transitions and escaped keys retain explicit parent presence', async ({ page, browser }) => {
  await projection(page); await page.evaluate(() => { window.listProjection = 'kinds'; });
  let report = await submit(page); expect(report.status).toBe('Pass');
  await observed(page).locator('summary').click();
  await expect(cells(observed(page))).toHaveText([
    '"/result/value/0"', 'present empty list []', 'present empty record {}',
    '"/result/value/1"', '"old"', 'present list (bounded positional paths below)',
    '"/result/value/2"', 'present empty record {}', 'false',
    '"/result/value/3"', 'present list (bounded positional paths below)', 'present empty list []',
    '"/result/value/3/0"', 'null', 'absent',
    '"/result/value/4"', 'present empty list []', 'present list (bounded positional paths below)',
    '"/result/value/1/0"', 'absent', '"new"', '"/result/value/4/0"', 'absent', 'null',
  ]);
  await offline(page, browser, report);
  await page.evaluate(() => { window.listProjection = 'keys'; }); report = await submit(page);
  await observed(page).locator('summary').click();
  await expect(cells(observed(page))).toHaveText(['"/result/value/0/a~1b~0c"', '""', JSON.stringify('<svg onload="alert(1)">😀\0'), '"/result/value/0/__proto__"', 'false', 'true']);
  await offline(page, browser, report);
});

test('List shape, combined depth/node budgets and malformed tails fail closed before row omission', async ({ page, browser }) => {
  await projection(page);
  for (const mode of ['depth16', 'depth17', '1025', '2048', '2050', 'sparse', 'extra', 'symbol', 'prototype', 'fake', 'accessor', 'tail', 'unchanged-tail', 'rows', 'text', 'long']) {
    await page.evaluate(mode => { window.listProjection = mode; }, mode);
    const report = await submit(page); expect(report.status).toBe('Pass');
    const view = observed(page); await view.locator('summary').click();
    if (['depth16', '2048'].includes(mode)) {
      await expect(view).toContainText('No supported transport differences');
      await expect(view).not.toContainText('not guaranteed complete');
    } else if (['rows', 'text', 'long'].includes(mode)) {
      await expect(view).toContainText('not guaranteed complete');
      expect(await cells(view).count()).toBeLessThanOrEqual(64 * 3);
      if (mode === 'rows') await expect(cells(view)).toHaveCount(64 * 3);
      if (mode === 'text') expect(await cells(view).count()).toBeLessThan(64 * 3);
      if (mode === 'long') await expect(view).toContainText('truncated: 512 Unicode scalars');
    } else {
      await expect(view).toContainText('not guaranteed complete');
      await expect(view).not.toContainText('No supported transport differences');
      await expect(cells(view)).toHaveCount(0);
    }
    expect(await page.locator('.value-changes').first().evaluate(node => new TextEncoder().encode(node.textContent).length)).toBeLessThanOrEqual(256 * 1024);
    // Non-JSON objects cannot survive the full-JSON round trip, but their
    // projection still must fail closed live. JSON-shaped limits retain it all.
    if (!['sparse', 'extra', 'symbol', 'prototype', 'fake', 'accessor', 'unchanged-tail'].includes(mode)) await offline(page, browser, report);
  }
});

test('real native List Error/Unknown observations have unavailable comparisons and no invented entries', async ({ page, browser }) => {
  const after = 'fn f(xs:[Int])->[Int] {if xs[0] == 1 {[Int;xs[9]]} else {f(xs)}}';
  const report = await review(page, identity, after, [scenario('error', [['1']], ['1']), scenario('unknown', [['2']], ['2'])]);
  expect(report.review.cases.map(row => row.expectation)).toEqual(['Error', 'Unknown']);
  for (let index = 0; index < 2; index++) {
    await expect(observed(page).nth(index)).toContainText('Unavailable');
    await expect(required(page).nth(index)).toContainText('Unavailable');
    await expect(cells(observed(page).nth(index))).toHaveCount(0);
    await expect(cells(required(page).nth(index))).toHaveCount(0);
  }
  await offline(page, browser, report);
});
