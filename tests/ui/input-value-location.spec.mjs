import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const status = page => page.locator('#call-input-status');
const buttons = page => page.locator('#call-input-locations button');
async function open(page, source = 'fn f(x: Int) -> Int { x }', raw = '[12345]', target = 'f') {
  await page.goto(''); await page.locator('#source').fill(source);
  await expect(page.locator('#call-target')).toContainText(target);
  await page.locator('#call-target').selectOption(target);
  await page.locator('#call-args').fill(raw);
  await page.locator('#call-inputs > summary').click();
}
async function check(page) {
  await page.locator('#call-input-check').click();
  await expect(page.locator('#call-input-check')).toBeEnabled();
  await expect(page.locator('#call-input-download')).toBeDisabled();
  return JSON.parse(await page.locator('#call-input-report').textContent());
}
async function selection(page) {
  return page.locator('#call-args').evaluate(node => ({ start: node.selectionStart, end: node.selectionEnd, text: node.value.slice(node.selectionStart, node.selectionEnd), focused: document.activeElement === node }));
}
async function boundary(page) {
  await page.addInitScript(() => {
    const Original = window.Worker; window.requests = []; window.releases = [];
    window.Worker = class extends Original {
      postMessage(message, ...rest) {
        this.request = message.request ?? JSON.parse(message.requestJson);
        window.requests.push(this.request); super.postMessage(message, ...rest);
      }
      set onmessage(handler) {
        super.onmessage = handler && (event => {
          if (this.request?.op === 'validate-call') {
            if (window.mutate) window.mutate(event.data.report);
            if (window.delay) { window.releases.push(() => handler(event)); return; }
          }
          handler(event);
        });
      }
    };
  });
}

test('bounded lexical locations preserve all raw value kinds and fail closed for ambiguous/invalid documents and pointers', async () => {
  const source = await readFile('web/json-input-location.ts', 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
  const { jsonInputLocation: locate } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
  const raw = ' \n [ {"雪🚀":0,"\\u005f_proto__":{"a/b~c":[1e400,true,false,null,"bad"]}}, -9007199254740993.00 ] \n';
  for (const [pointer, value] of [['/args/0/__proto__/a~1b~0c/0', '1e400'], ['/args/0/__proto__/a~1b~0c/1', 'true'], ['/args/0/__proto__/a~1b~0c/2', 'false'], ['/args/0/__proto__/a~1b~0c/3', 'null'], ['/args/0/__proto__/a~1b~0c/4', '"bad"'], ['/args/1', '-9007199254740993.00']]) {
    const range = locate(raw, pointer); expect(range).toEqual({ start: raw.indexOf(value), end: raw.indexOf(value) + value.length });
  }
  expect(raw.slice(...Object.values(locate(raw, '/args')))).toBe(raw.trim());
  expect(locate('['.repeat(17) + '0' + ']'.repeat(17), '/args')).toBeDefined();
  for (const text of ['['.repeat(18) + '0' + ']'.repeat(18), '[{"a":1,"\\u0061":2}]', '[0,{"a":1,"a":2}]', '[0,]', '[01]', '[+1]', '[NaN]', '["\\uD800"]', '["\ud800"]', '[0]\r', '\uFEFF[0]', '[0]true', '{}', ' '.repeat(65537) + '[0]', '["' + '雪'.repeat(22000) + '"]']) expect(locate(text, '/args/0')).toBeUndefined();
  for (const pointer of ['/arg/0', '/args/01', '/args/+0', '/args/-', '/args/-0', '/args/90071992547409930000', '/args/1', '/args/0/~2', '/args/0/~', '/args/0/missing']) expect(locate('[{}]', pointer)).toBeUndefined();
  expect(locate('[{"":1}]', '/args/0/')).toEqual({ start: 5, end: 6 });
});

test('real 200-row preflight selects the exact bad quantity; manual fix then explicit Check and Invoke stay separate', async ({ page }) => {
  await boundary(page);
  const source = await readFile('examples/invoice-batch.wisp', 'utf8');
  const rows = Array.from({ length: 200 }, () => ({ quantity: '2', unit_cents: '250', declared_cents: '500' }));
  rows[199].quantity = 12345;
  const raw = '\n ' + JSON.stringify([rows, '100000']) + ' \n';
  await open(page, source, raw, 'reconcile');
  const before = await page.locator('#output, #call-result, #call-evidence').allTextContents();
  await page.locator('#source').evaluate(node => node.setSelectionRange(3, 7));
  const report = await check(page); expect(report.status).toBe('Error'); expect(report.diagnostics[0].path).toBe('/args/0/199/quantity');
  await expect(buttons(page)).toHaveCount(1);
  const requests = await page.evaluate(() => window.requests.length);
  await page.evaluate(() => { window.ownerEvents = 0; for (const id of ['source', 'call-args', 'call-target']) for (const type of ['input', 'change']) document.getElementById(id).addEventListener(type, () => window.ownerEvents++); });
  await buttons(page).click();
  expect(await selection(page)).toEqual({ start: raw.indexOf('12345'), end: raw.indexOf('12345') + 5, text: '12345', focused: true });
  expect(await page.locator('#source').evaluate(node => [node.selectionStart, node.selectionEnd])).toEqual([3, 7]);
  expect(await page.evaluate(() => [window.ownerEvents, window.requests.length])).toEqual([0, requests]);
  await expect(page.locator('#call-args')).toHaveValue(raw); await expect(page.locator('#source')).toHaveValue(source);
  expect(await page.locator('#output, #call-result, #call-evidence').allTextContents()).toEqual(before);
  const fixed = raw.replace('12345', '"2"'); await page.locator('#call-args').fill(fixed);
  await page.locator('#call-input-check').click(); await expect(status(page)).toContainText('Inputs Ready');
  await expect(buttons(page)).toHaveCount(0); await expect(page.locator('#call-result')).toHaveText('No invocation yet.');
  expect(await page.evaluate(() => window.requests.filter(r => ['call', 'run'].includes(r.op)))).toEqual([]);
  await page.locator('#invoke').click(); await expect(page.locator('#run-status')).toHaveText('CALL COMPLETE');
  expect(JSON.parse(await page.locator('#call-result').textContent())).toEqual({ type: 'Reconciliation', value: {
    line_count: '200', computed_cents: '100000', declared_cents: '100000', mismatched_lines: '0', first_mismatched_index: '-1',
    invalid_lines: '0', first_invalid_index: '-1', payment_cents: '100000', payment_difference_cents: '0', balanced: true
  } });
});

test('real canonical Int diagnostic handles Unicode before an escaped __proto__ key and selects quotes with outer whitespace', async ({ page }) => {
  const source = 'record R { label: String, __proto__: Int } fn f(x: R) -> Int { x.__proto__ }';
  const raw = ' \n\t[ {"label":"雪 🚀", "\\u005f_proto__":"01"} ] \n';
  await open(page, source, raw); const report = await check(page);
  expect(report.diagnostics[0].path).toBe('/args/0/__proto__');
  await buttons(page).click(); expect(await selection(page)).toEqual({ start: raw.indexOf('"01"'), end: raw.indexOf('"01"') + 4, text: '"01"', focused: true });
  await expect(page.locator('#call-args')).toHaveValue(raw);
});

test('real duplicate keys anywhere, missing fields and source diagnostics have no guessed navigation', async ({ page }) => {
  await open(page, 'record R { x: Int } fn f(x: R) -> Int { x.x }');
  for (const raw of ['[{"x":"1","x":12345}]', '[{"x":"1","\\u0078":12345}]', '[{}]', '[{"x":12345}, {"other":1,"other":2}]']) {
    await page.locator('#call-args').fill(raw); await check(page); await expect(buttons(page)).toHaveCount(0);
  }
  await page.locator('#source').fill('fn f(x: Int) -> Int { unknown }');
  await expect(page.locator('#call-target')).toContainText('f'); await page.locator('#call-args').fill('[12345]');
  const report = await check(page); expect(report.status).toBe('Error');
  expect(report.diagnostics.some(d => !d.path)).toBe(true); await expect(buttons(page)).toHaveCount(0);
});

test('real arity /args selects the whole array and Unknown list 1025 selects the existing list', async ({ page }) => {
  await open(page, 'fn f(x: [Int]) -> Int { 1 }', ' \n [] \t');
  let report = await check(page); expect(report.diagnostics[0].path).toBe('/args');
  await buttons(page).click(); expect((await selection(page)).text).toBe('[]');
  const list = JSON.stringify(Array(1025).fill('1')); await page.locator('#call-args').fill('[ ' + list + ' ]');
  report = await check(page); expect(report.status).toBe('Unknown'); expect(report.diagnostics[0].path).toBe('/args/0');
  await buttons(page).click(); expect((await selection(page)).text).toBe(list);
  await page.locator('#call-args').fill('['.repeat(18) + '0' + ']'.repeat(18));
  await check(page); await expect(buttons(page)).toHaveCount(0);
});

test('mutating actual Rust Error metadata or pointers never creates navigation or accepted Ready; text is not HTML', async ({ page }) => {
  await boundary(page); await open(page);
  for (const change of ["r.compiler='other'", "r.revision='0'.repeat(64)", "r.input_validation.target='g'", 'r.input_validation.new_execution=true', 'r.input_validation.new_execution="false"', 'r.input_validation.contract_version=2', 'r.input_validation.argument_count=1', 'r.input_validation.argument_hash="extra"', 'r.usage={}', 'r.result={}', 'r.invocation={}', 'r.execution_key="x"', 'r.new_execution="false"', 'r.output="ran"', 'r.probes=[{}]', 'r.status="Complete"', 'r.diagnostics={}', 'delete r.diagnostics[0].message', 'r.diagnostics[0].path="/args/01"', 'r.diagnostics[0].path="/args/+0"', 'r.diagnostics[0].path="/args/0/~2"', 'r.diagnostics[0].path="/args/90071992547409930000"', 'r.diagnostics[0].path="/source/0"', 'delete r.diagnostics[0].path']) {
    await page.evaluate(change => { window.mutate = new Function('r', change); }, change);
    await check(page); await expect(buttons(page)).toHaveCount(0); await expect(status(page)).not.toContainText('Inputs Ready');
  }
  await page.evaluate(() => { window.mutate = r => { r.diagnostics[0].message = '<img src=x onerror=alert(1)>'; r.diagnostics[0].code = '<b>bad</b>'; }; });
  await check(page); await expect(buttons(page)).toHaveCount(1);
  await expect(page.locator('#call-input-locations')).toContainText('<img src=x onerror=alert(1)>');
  await expect(page.locator('#call-input-locations img, #call-input-locations b')).toHaveCount(0);
});

test('retained button callbacks cannot select after owner edit-revert, file, Stop, read start, new check or new acceptance', async ({ page }) => {
  await boundary(page); await open(page, 'fn f(x: Int) -> Int { x } fn g(x: Int) -> Int { x }');
  for (const action of ['args', 'source', 'target', 'file', 'stop', 'load', 'new-check', 'new-error', 'new-ready']) {
    await page.evaluate(() => { window.delay = false; });
    await check(page); await expect(buttons(page)).toHaveCount(1);
    await buttons(page).evaluate(node => { window.oldSelect = node.onclick; });
    if (['args', 'source', 'target'].includes(action)) await page.locator(action === 'args' ? '#call-args' : action === 'source' ? '#source' : '#call-target').evaluate(node => {
      const raw = node.value; node.value = node.tagName === 'SELECT' ? 'g' : raw + '\n'; node.dispatchEvent(new Event('input')); node.value = raw; node.dispatchEvent(new Event('change'));
    });
    if (action === 'file' || action === 'load') {
      await page.locator('#call-input-file').setInputFiles({ name: 'input.json', mimeType: 'application/json', buffer: Buffer.from('[12345]') });
      if (action === 'load') { await page.locator('#call-input-load').click(); await expect(status(page)).toContainText('Loaded exact'); }
    }
    if (action === 'stop') await page.locator('#call-input-stop').click();
    if (action === 'new-check') { await page.evaluate(() => { window.delay = true; }); await page.locator('#call-input-check').click(); }
    if (action === 'new-error') { await check(page); await expect(buttons(page)).toHaveCount(1); }
    if (action === 'new-ready') { await page.locator('#call-args').fill('["2"]'); await page.locator('#call-input-check').click(); await expect(status(page)).toContainText('Inputs Ready'); }
    await page.locator('#call-args').evaluate(node => { node.setSelectionRange(0, 0); document.getElementById('call-input-check').focus(); window.oldSelect(); });
    expect(await selection(page)).toMatchObject({ start: 0, end: 0, focused: false });
    if (action === 'new-check') { await page.locator('#call-input-stop').click(); await page.evaluate(() => window.releases.splice(0).forEach(fn => fn())); }
    if (action === 'new-ready') await page.locator('#call-args').fill('[12345]');
  }
});

test('Error digest shares monotonic deadline and generation guards; accepted selection has no TTL', async ({ page }) => {
  await boundary(page); await open(page);
  await page.evaluate(() => {
    window.digests = []; const digest = crypto.subtle.digest.bind(crypto.subtle);
    crypto.subtle.digest = async (...args) => { const result = await digest(...args); return new Promise(resolve => window.digests.push(() => resolve(result))); };
    const now = performance.now.bind(performance); window.elapsed = 0; performance.now = () => now() + window.elapsed;
  });
  for (const action of ['deadline', 'edit', 'stop']) {
    await page.locator('#call-input-check').click(); await expect.poll(() => page.evaluate(() => window.digests.length)).toBe(1);
    if (action === 'deadline') await page.evaluate(() => { window.elapsed += 6000; });
    if (action === 'edit') { await page.locator('#call-args').fill('[2]'); await page.locator('#call-args').fill('[12345]'); }
    if (action === 'stop') await page.locator('#call-input-stop').click();
    await page.evaluate(() => window.digests.splice(0).forEach(fn => fn())); await expect(buttons(page)).toHaveCount(0); await expect(page.locator('#call-input-download')).toBeDisabled();
  }
  await page.locator('#call-input-check').click(); await expect.poll(() => page.evaluate(() => window.digests.length)).toBe(1);
  await page.evaluate(() => window.digests.splice(0).forEach(fn => fn())); await expect(buttons(page)).toHaveCount(1);
  await page.evaluate(() => { window.elapsed += 6000; }); await buttons(page).click(); expect((await selection(page)).text).toBe('12345');
});

test('location mapping cannot accept navigation after the elapsed deadline even before timer delivery', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const now = performance.now.bind(performance); window.elapsed = 0;
    performance.now = () => now() + window.elapsed;
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    window.mapCanDelay = false;
    crypto.subtle.digest = async (...args) => { const value = await digest(...args); window.mapCanDelay = true; return value; };
    const encode = TextEncoder.prototype.encode;
    let delayed = false;
    TextEncoder.prototype.encode = function (text) {
      if (!delayed && window.mapCanDelay && text === '[12345]') { delayed = true; window.elapsed += 6000; }
      return encode.call(this, text);
    };
  });
  await page.locator('#call-input-check').click();
  await expect(status(page)).toContainText('deadline');
  await expect(buttons(page)).toHaveCount(0); await expect(page.locator('#call-input-download')).toBeDisabled();
});
