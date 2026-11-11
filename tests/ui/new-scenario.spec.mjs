import { test, expect } from '@playwright/test';

const json = x => JSON.stringify(x, null, 2);
const row = (id = 'old', args = ['1'], value = '999') => ({ id, args, expect: { result: { type: 'Int', value }, output: '' } });
const suite = (cases = [row()], target = 'f') => ({ version: 1, target, cases });
const builder = page => page.locator('#new-scenario');
const field = (page, label) => label.endsWith('(Bool)') ? builder(page).getByRole('combobox', { name: label, exact: true }) : builder(page).getByLabel(label, { exact: true });
const saved = async page => JSON.parse(await page.locator('#review-suite').inputValue());
async function raw(page, text) {
  await page.locator('#review-suite').evaluate((node, value) => { node.value = value; node.dispatchEvent(new Event('input')); node.dispatchEvent(new Event('change')); }, text);
}
async function custom(page, source = 'fn f(n: Int)->Int{n}', text = json(suite())) {
  await page.goto('?workbench');
  await page.locator('#source').fill(source); await page.locator('#review-capture').click(); await raw(page, text);
  await builder(page).locator('summary').click();
}
async function read(page, name = 'f') {
  await page.locator('#scenario-read').click();
  await expect(page.locator('#scenario-build-status')).toContainText('Metadata Ready');
  await page.locator('#scenario-function').selectOption({ label: name });
  await expect(page.locator('#scenario-add')).toBeEnabled();
}
async function add(page, replace = true) {
  if (replace) await page.locator('#scenario-replace').check();
  await page.locator('#scenario-add').click();
  await expect(page.locator('#scenario-build-status')).toContainText('Scenario added');
}
async function review(page, status) {
  await page.locator('#review-run').click();
  await expect(page.locator('#review-status')).toContainText(`Submitted inputs · ${status}`);
}
async function instrument(page) {
  await page.addInitScript(() => {
    const Native = window.Worker;
    window.sent = []; window.nativeReports = [];
    window.Worker = class extends Native {
      constructor(...args) { super(...args); this.addEventListener('message', event => window.nativeReports.push(event.data.report)); }
      postMessage(message, ...rest) { window.sent.push(JSON.parse(message.requestJson ?? JSON.stringify(message.request))); super.postMessage(message, ...rest); }
    };
  });
}

test('first custom scenario is wholly manual, describes without execution, then native Pass and preserved wrong requirement Fail', async ({ page }) => {
  await instrument(page);
  await custom(page, 'fn f(n: Int,b: Bool,s: String)->Int{n} print("top-level"); probe i in 0..=1 { f(i,true,"probe") == i }', '{not JSON');
  const original = await page.locator('#review-suite').inputValue();
  await read(page);
  await expect(field(page, 'Required result type (from Rust)')).toHaveValue('Int');
  await expect(field(page, 'Required result type (from Rust)')).toHaveAttribute('readonly', '');
  await field(page, 'Input n (Int)').fill('9223372036854775807');
  await field(page, 'Input b (Bool)').selectOption('false');
  await field(page, 'Input s (String)').fill('literal 😀\nline');
  await field(page, 'Required result (Int)').fill('999');
  await expect(page.locator('#review-suite')).toHaveValue(original);
  expect(await page.evaluate(() => window.sent.map(r => r.op))).toEqual(['describe']);
  expect(await page.evaluate(() => window.nativeReports[0])).toMatchObject({ status: 'Ready', output: '', probes: [], interface: { contract_version: 1, phase: 'described', new_execution: false } });
  await expect(page.locator('#review-json')).toHaveText('');
  await add(page);
  expect(await page.evaluate(() => window.sent.map(r => r.op))).toEqual(['describe']);
  expect((await saved(page)).cases[0]).toEqual(row('case-1', ['9223372036854775807', false, 'literal 😀\nline']));
  await expect(page.locator('#scenario-add')).toBeDisabled();
  await review(page, 'Fail');
  expect((await saved(page)).cases[0].expect.result.value).toBe('999');
  // This function invocation has no output: top-level print/probe are skipped.
  const report = JSON.parse(await page.locator('#review-json').textContent());
  expect(report.review.summary.attempted_invocations).toBe(2);
  expect(report.review.cases[0].after.output).toBe('');
  await read(page);
  await field(page, 'Input n (Int)').fill('9223372036854775807'); await field(page, 'Input b (Bool)').selectOption('true');
  await field(page, 'Input s (String)').fill(''); await field(page, 'Required result (Int)').fill('9223372036854775807');
  await add(page); await review(page, 'Pass');
});

test('native nested records including __proto__ keep i64, Unicode/NUL and XSS literal strings without evaluation', async ({ page }) => {
  const source = 'record Inner { __proto__: String, enabled: Bool, n: Int } record Outer { inner: Inner, flag: Bool } fn f(x: Outer)->Outer{x}';
  await custom(page, source); await read(page);
  const literal = '<img src=x onerror=alert(1)>😀\n\u0000';
  for (const prefix of ['Input x', 'Required result']) {
    // DOM assignment retains NUL (keyboard fill can be platform-dependent).
    await field(page, `${prefix}.inner.__proto__ (String)`).evaluate((node, value) => { node.value = value; node.dispatchEvent(new Event('input')); }, literal);
    await field(page, `${prefix}.inner.enabled (Bool)`).selectOption('true');
    await field(page, `${prefix}.inner.n (Int)`).fill('-9223372036854775808');
    await field(page, `${prefix}.flag (Bool)`).selectOption('false');
  }
  await expect(builder(page).locator('img')).toHaveCount(0);
  await add(page);
  const value = { inner: Object.fromEntries([['__proto__', literal], ['enabled', true], ['n', '-9223372036854775808']]), flag: false };
  const data = await saved(page); expect(data.cases[0].args).toEqual([value]); expect(data.cases[0].expect.result).toEqual({ type: 'Outer', value });
  expect(await page.evaluate(() => ({}).polluted)).toBeUndefined(); await review(page, 'Pass');
});

test('canonical same-target append preserves prior requirements and unique scaffold IDs, limits 16 cases', async ({ page }) => {
  const old = row('case-1'); await custom(page, undefined, json(suite([old]))); await read(page);
  await expect(field(page, 'New scenario ID (String)')).toHaveValue('case-2');
  await field(page, 'Input n (Int)').fill('2'); await field(page, 'Required result (Int)').fill('2');
  await add(page, false);
  expect((await saved(page)).cases).toEqual([old, row('case-2', ['2'], '2')]);
  await read(page); await field(page, 'New scenario ID (String)').fill('case-1');
  await page.locator('#scenario-add').click(); await expect(page.locator('#scenario-build-status')).toContainText('unique ID');
  expect((await saved(page)).cases).toHaveLength(2);
  const full = json(suite(Array.from({ length: 16 }, (_, i) => row(`case-${i + 1}`))));
  await raw(page, full); await read(page); await page.locator('#scenario-add').click();
  await expect(page.locator('#scenario-build-status')).toContainText('fewer than 16'); await expect(page.locator('#review-suite')).toHaveValue(full);
});

test('other-target, duplicate-member and minified suites require explicit replacement, with both policies and previous buffer intact', async ({ page }) => {
  const variants = [json(suite([row()], 'other')), JSON.stringify(suite()), json(suite()).replace('"version": 1', '"version": 1, "version": 1')];
  for (const text of variants) {
    await custom(page, undefined, text);
    const before = await page.locator('#review-baseline').inputValue();
    await page.locator('#source').fill('fn f(n: Int)->Int{n+1}');
    const candidate = await page.locator('#source').inputValue(); await read(page);
    await field(page, 'Input n (Int)').fill('2'); await field(page, 'Required result (Int)').fill('3');
    await page.locator('#scenario-add').click(); await expect(page.locator('#scenario-build-status')).toContainText('Cannot add');
    await expect(page.locator('#review-suite')).toHaveValue(text);
    await add(page); expect((await saved(page)).cases).toHaveLength(1);
    await expect(page.locator('#source')).toHaveValue(candidate); await expect(page.locator('#review-baseline')).toHaveValue(before);
    await page.getByText('Save or reopen your workspace', { exact: true }).click();
    await page.locator('#workspace-restore-previous').click();
    await expect(page.locator('#review-suite')).toHaveValue(text); await expect(page.locator('#source')).toHaveValue(candidate); await expect(page.locator('#review-baseline')).toHaveValue(before);
  }
});

test('native candidate Error and Unknown cannot add; oversized UI record shapes fail closed', async ({ page }) => {
  await instrument(page);
  await custom(page, 'fn broken('); await page.locator('#scenario-read').click();
  await expect(page.locator('#scenario-build-status')).toContainText('No usable shapes');
  await expect(page.locator('#scenario-add')).toBeDisabled(); await expect(page.locator('#scenario-build-status')).toContainText('Native diagnostics');
  expect(await page.evaluate(() => window.nativeReports.at(-1))).toMatchObject({ status: 'Error', interface: { new_execution: false, phase: 'preflight' } });
  // Rust rejects too many fields; the UI never guesses a smaller layout.
  const fields = Array.from({ length: 33 }, (_, i) => `f${i}: Int`).join(',');
  await page.locator('#source').fill(`record Wide {${fields}} fn f(x: Wide)->Wide{x}`); await page.locator('#scenario-read').click();
  await expect(page.locator('#scenario-build-status')).toContainText('No usable shapes'); await expect(page.locator('#scenario-add')).toBeDisabled();
  expect(await page.evaluate(() => window.nativeReports.at(-1))).toMatchObject({ status: 'Unknown', interface: { new_execution: false, phase: 'preflight' } });
});

test('manual Bool selection is required; invalid Int text reaches native Error without repair and excessive data does not write', async ({ page }) => {
  await custom(page, 'fn f(n: Int,b: Bool)->Int{n}'); const original = await page.locator('#review-suite').inputValue(); await read(page);
  await field(page, 'Input n (Int)').fill('01'); await field(page, 'Required result (Int)').fill('+1');
  await page.locator('#scenario-replace').check(); await page.locator('#scenario-add').click();
  await expect(page.locator('#scenario-build-status')).toContainText('Choose true or false'); await expect(page.locator('#review-suite')).toHaveValue(original);
  await field(page, 'Input b (Bool)').selectOption('false');
  await field(page, 'Required output — empty means explicitly require no output (String)').fill('x'.repeat(65536));
  await page.locator('#scenario-add').click(); await expect(page.locator('#scenario-build-status')).toContainText('64 KiB'); await expect(page.locator('#review-suite')).toHaveValue(original);
  await field(page, 'Required output — empty means explicitly require no output (String)').fill('');
  await add(page); expect((await saved(page)).cases[0]).toEqual(row('case-1', ['01', false], '+1'));
  await review(page, 'Error'); await expect(page.locator('#review-summary')).toContainText('no case invocations');
});

test('source/suite edit-and-revert, baseline recapture and silent suite mismatch invalidate binding with no writes', async ({ page }) => {
  await custom(page);
  for (const id of ['source', 'review-suite']) {
    await read(page); const text = await page.locator(`#${id}`).inputValue();
    await page.locator(`#${id}`).evaluate((node, value) => { node.value = value + ' '; node.dispatchEvent(new Event('input')); node.value = value; node.dispatchEvent(new Event('input')); }, text);
    await expect(page.locator('#scenario-add')).toBeDisabled(); await expect(page.locator('#scenario-build-status')).toContainText('Inputs changed');
  }
  await read(page); await page.locator('#review-capture').click(); await expect(page.locator('#scenario-add')).toBeDisabled();
  await read(page); const text = await page.locator('#review-suite').inputValue();
  await page.locator('#review-suite').evaluate(node => { node.value = 'changed silently'; });
  await page.locator('#scenario-add').click(); await expect(page.locator('#review-suite')).toHaveValue('changed silently'); await expect(page.locator('#scenario-add')).toBeDisabled();
  await raw(page, text); await read(page);
  await page.locator('#review-example').click(); await expect(page.locator('#scenario-add')).toBeDisabled();
});

async function synthetic(page) {
  await page.addInitScript(() => {
    window.fakeWorkers = [];
    window.Worker = class {
      constructor() { window.fakeWorkers.push(this); }
      terminate() { this.terminated = true; }
      postMessage(message) { this.message = message; this.callback = this.onmessage; }
    };
    window.reply = async (index, patch = {}) => {
      const worker = window.fakeWorkers[index]; const request = JSON.parse(worker.message.requestJson);
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(request.source));
      const report = { compiler: 'wisp-0.1.0-semantics-5', revision: Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join(''), status: 'Ready', output: '', probes: [], diagnostics: [],
        interface: { contract_version: 1, phase: 'described', new_execution: false, functions: [{ name: 'f', parameters: [{ name: 'n', type: { kind: 'Int' } }], return_type: { kind: 'Int' } }], records: [], encodings: { Int: 'canonical_signed_i64_string', Bool: 'JSON_boolean', String: 'JSON_string', Unit: 'JSON_null', Record: 'exact_field_object' }, scope: 'synthetic transport test' }, ...patch };
      worker.callback({ data: { id: worker.message.id, report } });
    };
  });
}

test('Stop, deadline and old out-of-order callbacks never revive metadata or pending status', async ({ page }) => {
  await synthetic(page); await custom(page); await page.clock.install();
  await page.locator('#scenario-read').click(); await page.locator('#scenario-read-stop').click();
  await page.evaluate(() => window.reply(0)); await expect(page.locator('#scenario-build-status')).toContainText('Reading stopped'); await expect(page.locator('#scenario-add')).toBeDisabled();
  await page.locator('#scenario-read').click(); await page.clock.fastForward(5001);
  await expect(page.locator('#scenario-build-status')).toContainText('deadline'); await page.evaluate(() => window.reply(1));
  await expect(page.locator('#scenario-add')).toBeDisabled();
  await page.locator('#scenario-read').click(); const source = await page.locator('#source').inputValue();
  await page.locator('#source').fill(source + ' '); await page.locator('#source').fill(source);
  await expect(page.locator('#scenario-build-status')).toContainText('Inputs changed');
  await page.locator('#scenario-read').click(); await page.evaluate(() => window.reply(2));
  await expect(page.locator('#scenario-build-status')).toContainText('Reading candidate');
  await page.evaluate(() => window.reply(3)); await expect(page.locator('#scenario-build-status')).toContainText('Metadata Ready');
  expect(await page.evaluate(() => window.fakeWorkers.every(w => w.terminated))).toBe(true);
  expect(await page.evaluate(() => window.fakeWorkers.map(w => Object.keys(JSON.parse(w.message.requestJson))))).toEqual(Array.from({ length: 4 }, () => ['op', 'source']));
});

test('synthetic future interface/type, Unknown, executing report and wrong revision are rejected, UI cap blocks recursive expansion', async ({ page }) => {
  await synthetic(page); await custom(page); const original = await page.locator('#review-suite').inputValue();
  for (const patch of [{ status: 'Unknown' }, { revision: 'a'.repeat(64) }, { compiler: 'future' }, { interface: { contract_version: 2, new_execution: false } }, { interface: { contract_version: 1, new_execution: true } }]) {
    await page.locator('#scenario-read').click(); await page.evaluate(async patch => { await window.reply(window.fakeWorkers.length - 1, patch); }, patch);
    await expect(page.locator('#scenario-build-status')).toContainText('No usable shapes'); await expect(page.locator('#scenario-add')).toBeDisabled();
    if (patch.status === 'Unknown') await expect(page.locator('#scenario-build-status')).toContainText('Native Unknown');
  }
  // Start from a valid envelope, mutate native-shaped catalog in the callback.
  for (const mode of ['future-type', 'wide', 'depth', 'cap']) {
    await page.locator('#scenario-read').click();
    await page.evaluate(async mode => {
      const w = window.fakeWorkers.at(-1), callback = w.callback;
      w.callback = event => {
        const api = event.data.report.interface;
        if (mode === 'future-type') api.functions[0].return_type = { kind: 'Array' };
        else {
          api.functions[0].parameters = [{ name: 'n', type: { kind: 'Record', name: 'R0' } }];
          const depth = mode === 'depth' ? 17 : mode === 'cap' ? 3 : 1;
          api.records = Array.from({ length: depth }, (_, i) => ({ name: `R${i}`, fields: Array.from({ length: mode === 'wide' ? 33 : mode === 'cap' ? 32 : 1 }, (_, j) => ({ name: `v${j}`, type: i + 1 < depth ? { kind: 'Record', name: `R${i + 1}` } : { kind: 'Int' } })) }));
        }
        callback(event);
      };
      await window.reply(window.fakeWorkers.length - 1);
    }, mode);
    if (mode === 'future-type') await expect(page.locator('#scenario-build-status')).toContainText('No usable shapes');
    else { await expect(page.locator('#scenario-build-status')).toContainText('Metadata Ready'); await page.locator('#scenario-function').selectOption('0'); await expect(page.locator('#scenario-build-status')).toContainText('No usable form'); }
    await expect(page.locator('#scenario-add')).toBeDisabled(); await expect(page.locator('#review-suite')).toHaveValue(original);
  }
});

test('compact native record descriptions cannot expand into excessive form-label text', async ({ page }) => {
  await instrument(page);
  const key = 'field_' + 'x'.repeat(10000);
  const source = `record R { ${key}: Int } record P { ${Array.from({ length: 32 }, (_, i) => `f${i}: R`).join(', ')} } fn f(x: P)->P{x}`;
  expect(Buffer.byteLength(source)).toBeLessThan(65536);
  await custom(page, source); const original = await page.locator('#review-suite').inputValue();
  await page.locator('#scenario-read').click(); await expect(page.locator('#scenario-build-status')).toContainText('Metadata Ready');
  await page.locator('#scenario-function').selectOption({ label: 'f' });
  await expect(page.locator('#scenario-build-status')).toContainText('UI label budget (256 KiB) exceeded');
  await expect(page.locator('#scenario-add')).toBeDisabled(); await expect(page.locator('#scenario-new-fields input')).toHaveCount(0);
  await expect(page.locator('#review-suite')).toHaveValue(original);
  expect(await page.evaluate(() => window.sent.map(r => r.op))).toEqual(['describe']);
});

test('new and existing case IDs must follow the native ASCII rule and existing IDs must be unique before append', async ({ page }) => {
  await instrument(page); await custom(page); await read(page);
  const original = await page.locator('#review-suite').inputValue();
  await field(page, 'Input n (Int)').fill('2'); await field(page, 'Required result (Int)').fill('2');
  for (const id of ['my case', 'é', 'x'.repeat(65), '', 'line\nid']) {
    await field(page, 'New scenario ID (String)').fill(id); await page.locator('#scenario-add').click();
    await expect(page.locator('#scenario-build-status')).toContainText('Scenario ID must be 1–64 ASCII');
    await expect(page.locator('#review-suite')).toHaveValue(original);
  }
  for (const cases of [[row('same'), row('same')], [row('my case')], [row('é')], [row('x'.repeat(65))]]) {
    const rawSuite = json(suite(cases)); await raw(page, rawSuite); await read(page);
    await field(page, 'New scenario ID (String)').fill('valid_1');
    await field(page, 'Input n (Int)').fill('2'); await field(page, 'Required result (Int)').fill('2');
    await page.locator('#scenario-add').click();
    await expect(page.locator('#scenario-build-status')).toContainText('existing scenario IDs must be unique');
    await expect(page.locator('#review-suite')).toHaveValue(rawSuite);
  }
  expect(await page.evaluate(() => window.sent.every(r => r.op === 'describe'))).toBe(true);
  await add(page); expect((await saved(page)).cases.map(row => row.id)).toEqual(['valid_1']);
});
