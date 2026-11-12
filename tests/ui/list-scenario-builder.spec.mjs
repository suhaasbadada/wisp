import { test, expect } from '@playwright/test';

const json = value => JSON.stringify(value, null, 2);
const input = page => page.getByLabel('Input xs (List JSON [Int])', { exact: true });
const required = page => page.getByLabel('Required result (List JSON [Int])', { exact: true });
async function raw(page, text) {
  await page.locator('#review-suite').evaluate((node, value) => { node.value = value; node.dispatchEvent(new Event('input')); node.dispatchEvent(new Event('change')); }, text);
}
async function observe(page, mode = '') {
  await page.addInitScript(mode => {
    window.requests = []; window.descriptions = []; window.delayedDigests = [];
    const Native = window.Worker;
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    crypto.subtle.digest = (...args) => window.delayDigest ? new Promise(resolve => window.delayedDigests.push(async () => resolve(await digest(...args)))) : digest(...args);
    window.Worker = class extends Native {
      set onmessage(callback) {
        super.onmessage = event => {
          if (event.data.report?.interface?.phase === 'described') {
            const api = event.data.report.interface;
            window.descriptions.push(structuredClone(event.data.report));
            if (mode === 'unknown') api.functions.find(f => f.name === 'f').parameters[0].type = { kind: 'List', element: { kind: 'Record', name: 'Missing' } };
            if (mode === 'cycle' || mode === 'depth') {
              const count = mode === 'cycle' ? 1 : 16;
              api.records = Array.from({ length: count }, (_, i) => ({ name: `R${i}`, fields: [{ name: 'x', type: i + 1 < count ? { kind: 'Record', name: `R${i + 1}` } : mode === 'cycle' ? { kind: 'List', element: { kind: 'Record', name: 'R0' } } : { kind: 'Int' } }] }));
              api.functions.find(f => f.name === 'f').parameters[0].type = { kind: 'List', element: { kind: 'Record', name: 'R0' } };
            }
          }
          callback(event);
        };
      }
      postMessage(message, ...rest) { window.requests.push(JSON.parse(message.requestJson ?? JSON.stringify(message.request))); super.postMessage(message, ...rest); }
    };
  }, mode);
}
async function setup(page, source = 'fn f(xs:[Int])->[Int]{xs}') {
  await page.goto('?workbench'); await page.locator('#source').fill(source); await page.locator('#review-capture').click();
  await raw(page, '{owner raw suite}'); await page.locator('#new-scenario > summary').click();
}
async function read(page) {
  await page.locator('#scenario-read').click(); await expect(page.locator('#scenario-build-status')).toContainText('Metadata Ready');
  await page.locator('#scenario-function').selectOption({ label: 'f' });
}
async function add(page, replace = true) {
  if (replace) await page.locator('#scenario-replace').check(); await page.locator('#scenario-add').click();
  await expect(page.locator('#scenario-build-status')).toContainText('Scenario added');
}
async function review(page, outcome) {
  await page.locator('#review-run').click(); await expect(page.locator('#review-status')).toContainText(`Submitted inputs · ${outcome}`);
}
test('manual argument and required List return use native type, no execution until Review, wrong requirement retained', async ({ page }) => {
  await observe(page); await setup(page); await read(page);
  await expect(input(page)).toHaveValue(''); await expect(required(page)).toHaveValue('');
  await expect(page.getByLabel('Required result type (from Rust)')).toHaveValue('[Int]');
  await input(page).fill('[ "9223372036854775807", "-9223372036854775808" ]');
  await required(page).fill('["9223372036854775807","-9223372036854775808"]');
  await add(page);
  expect(await page.evaluate(() => window.requests.map(r => r.op))).toEqual(['describe']);
  expect(await page.evaluate(() => window.descriptions[0])).toMatchObject({ status: 'Ready', interface: { contract_version: 2, new_execution: false } });
  await review(page, 'Pass');
  const original = JSON.parse(await page.locator('#review-suite').inputValue()).cases[0];
  await read(page); await input(page).fill('["1"]'); await required(page).fill('["999"]'); await add(page, false);
  const data = JSON.parse(await page.locator('#review-suite').inputValue());
  expect(data.cases[0]).toEqual(original); expect(data.cases.map(r => r.id)).toEqual(['case-1', 'case-2']);
  await review(page, 'Fail'); expect(JSON.parse(await page.locator('#review-suite').inputValue())).toEqual(data);
});

test('nested List/record members, Bool, full i64 and literal Unicode/NUL/__proto__ round trip unchanged', async ({ page }) => {
  await observe(page);
  await setup(page, 'record R { __proto__: String, n: Int, flags: [Bool] } record Box { rows: [[R]] } fn f(xs:Box)->[[R]]{xs.rows}');
  await read(page);
  const value = [[Object.fromEntries([['__proto__', '<img src=x>😀\n\u0000'], ['n', '-9223372036854775808'], ['flags', [true, false]]])]];
  await page.getByLabel('Input xs.rows (List JSON [[R]])', { exact: true }).fill(json(value));
  await page.getByLabel('Required result (List JSON [[R]])', { exact: true }).fill(json(value));
  await expect(page.getByLabel('Required result type (from Rust)')).toHaveValue('[[R]]');
  await add(page); const data = JSON.parse(await page.locator('#review-suite').inputValue());
  expect(data.cases[0].args).toEqual([{ rows: value }]); expect(data.cases[0].expect.result).toEqual({ type: '[[R]]', value });
  expect(await page.evaluate(() => ({}).polluted)).toBeUndefined(); await review(page, 'Pass');
});

test('invalid Int strings remain strings for native preflight Error, never converted', async ({ page }) => {
  await setup(page); await read(page); await input(page).fill('["01"]'); await required(page).fill('["01"]'); await add(page);
  await review(page, 'Error'); await expect(page.locator('#review-summary')).toContainText('no case invocations');
  expect(JSON.parse(await page.locator('#review-suite').inputValue()).cases[0].args).toEqual([['01']]);
});

test('all manual JSON admission failures preserve workspace, old evidence and visible unadded text without execution', async ({ page }) => {
  await observe(page); await setup(page); await read(page); await input(page).fill('["1"]'); await required(page).fill('["1"]'); await add(page); await review(page, 'Pass');
  const before = await page.locator('#review-suite').inputValue(), evidence = await page.locator('#review-json').textContent();
  const policies = await page.locator('#source, #review-baseline').evaluateAll(nodes => nodes.map(n => n.value));
  await read(page); await required(page).fill('["1"]'); await page.locator('#scenario-replace').check();
  const invalid = ['[{"x":"1","x":"2"}]', '[{"x":"1","\\u0078":"2"}]', '[1e400]', '[9007199254740993]', '[null]', '\uFEFF[]', '[\r]', '["\\ud800"]', '["\\r"]', '[{"\\r":true}]', '["\ud800"]', '[', '{}', '["' + 'x'.repeat(65536) + '"]', json(Array(1025).fill('1')), '['.repeat(17) + '"1"' + ']'.repeat(17), json([Object.fromEntries(Array.from({ length: 33 }, (_, i) => [`k${i}`, true]))]), json([Array(1023).fill(true), Array(1023).fill(true)])];
  for (const text of invalid) {
    await input(page).evaluate((node, value) => {
      delete node.value; node.value = value;
      // Native textarea setters normalize raw CR. Exercise the admission boundary
      // with retained raw transport text as well as ordinary textarea values.
      if (value.includes('\r')) Object.defineProperty(node, 'value', { configurable: true, get: () => value });
    }, text);
    await page.locator('#scenario-add').click(); await expect(page.locator('#scenario-build-status'), `Rejected payload ${json(text).slice(0, 100)}`).toContainText('Cannot add');
    await expect(page.locator('#review-suite')).toHaveValue(before); await expect(page.locator('#review-json')).toHaveText(evidence);
    expect(await input(page).evaluate(node => node.value)).toBe(text);
    expect(await input(page).inputValue()).toBe(text.replace(/\r/g, '\n'));
    expect(await page.locator('#source, #review-baseline').evaluateAll(nodes => nodes.map(n => n.value))).toEqual(policies);
  }
  expect(await page.evaluate(() => window.requests.filter(r => r.op !== 'describe').map(r => r.op))).toEqual(['review']);
});

test('old raw/minified/duplicate/unsupported suites require explicit replacement and remain byte-identical on rejection', async ({ page }) => {
  await observe(page); await setup(page);
  const row = { id: 'old', args: [['1']], expect: { result: { type: '[Int]', value: ['999'] }, output: '' } };
  const suite = { version: 1, target: 'f', cases: [row] };
  const variants = [JSON.stringify(suite), json(suite).replace('"version": 1', '"version": 1, "version": 1'), json({ ...suite, cases: [{ ...row, args: [[1]] }] }), json({ ...suite, cases: [row, row] }), json({ ...suite, cases: [{ ...row, args: [[null]] }] })];
  for (const text of variants) {
    await raw(page, text); await read(page); await input(page).fill('["2"]'); await required(page).fill('["2"]');
    await page.locator('#scenario-add').click(); await expect(page.locator('#scenario-build-status')).toContainText('Cannot add'); await expect(page.locator('#review-suite')).toHaveValue(text);
    await add(page); expect(JSON.parse(await page.locator('#review-suite').inputValue()).cases).toHaveLength(1);
  }
  expect(await page.evaluate(() => window.requests.every(r => r.op === 'describe'))).toBe(true);
});

for (const mode of ['unknown', 'cycle', 'depth']) test(`actual native description with synthetic ${mode} List record reference fails closed`, async ({ page }) => {
  await observe(page, mode); await setup(page); const before = await page.locator('#review-suite').inputValue(); await read(page);
  await expect(page.locator('#scenario-build-status')).toContainText('No usable form'); await expect(page.locator('#scenario-add')).toBeDisabled();
  await expect(page.locator('#scenario-new-fields textarea')).toHaveCount(0); await expect(page.locator('#review-suite')).toHaveValue(before);
});

test('delayed digest keeps Stop active, deadline cancels and old digest cannot invalidate a newer read', async ({ page }) => {
  await observe(page); await setup(page); await page.clock.install(); await page.evaluate(() => { window.delayDigest = true; });
  await page.locator('#scenario-read').click(); await expect.poll(() => page.evaluate(() => window.delayedDigests.length)).toBe(1);
  await expect(page.locator('#scenario-read-stop')).toBeEnabled(); await page.clock.fastForward(5001);
  await expect(page.locator('#scenario-build-status')).toContainText('deadline');
  await page.evaluate(() => { window.delayDigest = false; }); await read(page);
  await page.evaluate(async () => { await window.delayedDigests[0](); });
  await expect(page.locator('#scenario-build-status')).toContainText('Metadata Ready'); await expect(page.locator('#scenario-add')).toBeEnabled();
  await input(page).fill('["2"]'); await page.evaluate(() => { window.delayDigest = true; });
  await page.locator('#scenario-read').click(); await expect.poll(() => page.evaluate(() => window.delayedDigests.length)).toBe(2);
  await page.locator('#scenario-read-stop').click(); await page.evaluate(async () => { await window.delayedDigests[1](); });
  await expect(page.locator('#scenario-build-status')).toContainText('Reading stopped'); await expect(page.locator('#scenario-add')).toBeDisabled();
});

test('monotonic deadline rejects late digest even before its timeout callback gets a turn', async ({ page }) => {
  await observe(page); await setup(page);
  await page.evaluate(() => {
    window.delayDigest = true;
    window.shapeNow = performance.now();
    performance.now = () => window.shapeNow;
  });
  await page.locator('#scenario-read').click(); await expect.poll(() => page.evaluate(() => window.delayedDigests.length)).toBe(1);
  await page.evaluate(async () => { window.shapeNow += 5001; await window.delayedDigests[0](); });
  await expect(page.locator('#scenario-build-status')).toContainText('deadline');
  await expect(page.locator('#scenario-function')).toBeDisabled(); await expect(page.locator('#scenario-add')).toBeDisabled();
});

test('explicit empty arrays and nested Bool lists use native recursive result names', async ({ page }) => {
  await setup(page, 'fn f(xs:[[Bool]])->[[Bool]]{xs}'); await read(page);
  const arg = page.getByLabel('Input xs (List JSON [[Bool]])', { exact: true });
  const result = page.getByLabel('Required result (List JSON [[Bool]])', { exact: true });
  await page.locator('#scenario-replace').check(); await page.locator('#scenario-add').click();
  await expect(page.locator('#scenario-build-status')).toContainText('Cannot add'); await expect(arg).toHaveValue('');
  await arg.fill('[[], [true, false]]'); await result.fill('[[], [true, false]]'); await add(page); await review(page, 'Pass');
  await read(page); await arg.fill('[]'); await result.fill('[]'); await add(page, false); await review(page, 'Pass');
  expect(JSON.parse(await page.locator('#review-suite').inputValue()).cases[1].expect.result).toEqual({ type: '[[Bool]]', value: [] });
});

test('payload depth includes surrounding record forms; required List rejection also preserves unadded argument', async ({ page }) => {
  await setup(page, 'record Box { rows: [Int] } fn f(xs:Box)->[Int]{xs.rows}'); await read(page);
  const arg = page.getByLabel('Input xs.rows (List JSON [Int])', { exact: true });
  const before = await page.locator('#review-suite').inputValue();
  await arg.fill('['.repeat(16) + '"1"' + ']'.repeat(16)); await required(page).fill('["1"]');
  await page.locator('#scenario-replace').check(); await page.locator('#scenario-add').click();
  await expect(page.locator('#scenario-build-status')).toContainText('16 container levels'); await expect(page.locator('#review-suite')).toHaveValue(before);
  await arg.fill('["1"]'); await required(page).fill('[1]'); await page.locator('#scenario-add').click();
  await expect(page.locator('#scenario-build-status')).toContainText('Cannot add'); await expect(arg).toHaveValue('["1"]'); await expect(required(page)).toHaveValue('[1]'); await expect(page.locator('#review-suite')).toHaveValue(before);
});

test('append uses one aggregate budget for old List values, without reserializing rejected old data', async ({ page }) => {
  await setup(page);
  const old = json({ version: 1, target: 'f', cases: [{ id: 'old', args: [Array(1024).fill('1')], expect: { result: { type: '[Int]', value: Array(1024).fill('1') }, output: '' } }] });
  await raw(page, old); await read(page); await input(page).fill('["2"]'); await required(page).fill('["2"]');
  await page.locator('#scenario-add').click(); await expect(page.locator('#scenario-build-status')).toContainText('unsupported existing values');
  await expect(page.locator('#review-suite')).toHaveValue(old); await expect(input(page)).toHaveValue('["2"]');
});

test('List buffers survive Add rejection, but input revert, recapture, target switch and reread invalidate old collectors', async ({ page }) => {
  await observe(page); await setup(page, 'fn f(xs:[Int])->[Int]{xs} fn g(b:Bool)->Bool{b}');
  for (const action of ['source', 'review-suite', 'capture', 'target', 'reread']) {
    await read(page); await input(page).fill('["1"]'); await required(page).fill('["1"]');
    await page.locator('#scenario-replace').check();
    const before = await page.locator('#review-suite').inputValue();
    await page.evaluate(() => { window.oldAdd = document.querySelector('#scenario-add').onclick; });
    if (action === 'source' || action === 'review-suite') await page.locator(`#${action}`).evaluate(node => { const old = node.value; node.value += ' '; node.dispatchEvent(new Event('input')); node.value = old; node.dispatchEvent(new Event('input')); });
    if (action === 'capture') await page.locator('#review-capture').click();
    if (action === 'target') await page.locator('#scenario-function').selectOption({ label: 'g' });
    if (action === 'reread') { await page.locator('#scenario-read').click(); await expect(page.locator('#scenario-build-status')).toContainText('Metadata Ready'); }
    await page.evaluate(() => window.oldAdd()); await expect(page.locator('#review-suite')).toHaveValue(before);
  }
  expect(await page.evaluate(() => window.requests.every(r => r.op === 'describe'))).toBe(true);
});
