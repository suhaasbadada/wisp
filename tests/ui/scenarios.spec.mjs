import { test, expect } from '@playwright/test';

const row = (id = 'owner', args = ['1'], value = '1', type = 'Int', output = '') => ({ id, args, expect: { result: { type, value }, output } });
const suite = cases => ({ version: 1, target: 'f', cases });
const json = value => JSON.stringify(value, null, 2);
const cards = page => page.locator('#scenario-editor .scenario-card');
const data = page => page.locator('#review-suite').inputValue().then(JSON.parse);
async function raw(page, text) {
  await page.locator('#review-suite').evaluate((node, value) => { node.value = value; node.dispatchEvent(new Event('input')); node.dispatchEvent(new Event('change')); }, text);
}
async function custom(page, source = 'fn f(n: Int)->Int{n}', value = suite([row()])) {
  await page.goto('?workbench');
  await page.locator('#source').fill(source); await page.locator('#review-capture').click();
  await raw(page, json(value));
  await cards(page).first().locator('summary').click();
}
async function review(page, status) {
  await page.locator('#review-run').click();
  await expect(page.locator('#review-status')).toContainText(`Submitted inputs · ${status}`);
}

test('custom scalar forms preserve full i64 strings and owner requirements across Pass/Fail/edit-revert', async ({ page }) => {
  await custom(page);
  await review(page, 'Pass');
  await expect(page.locator('#review-download-evidence')).toBeEnabled();
  const card = cards(page).first();
  await card.getByLabel('Argument 1', { exact: true }).fill('9223372036854775807');
  await expect(page.locator('#review-download-source')).toBeDisabled();
  await expect(page.locator('#review-download-evidence')).toBeDisabled();
  expect((await data(page)).cases[0]).toEqual(row('owner', ['9223372036854775807']));
  await review(page, 'Fail');
  await card.getByLabel('Required result', { exact: true }).fill('9223372036854775807');
  await review(page, 'Pass');
  const report = JSON.parse(await page.locator('#review-json').textContent());
  expect(report.review.summary).toMatchObject({ total: 1, attempted_invocations: 2, expectation_pass: 1 });
  await card.getByLabel('Scenario ID', { exact: true }).click();
  // This checks per-key editing/focus retention, not the platform End key.
  // Establish and verify the intended append position explicitly.
  await card.getByLabel('Scenario ID', { exact: true }).evaluate(input => input.setSelectionRange(input.value.length, input.value.length));
  await expect.poll(() => card.getByLabel('Scenario ID', { exact: true }).evaluate(input => input.selectionStart)).toBe(5);
  await card.getByLabel('Scenario ID', { exact: true }).pressSequentially('-renamed');
  await expect(card.getByLabel('Scenario ID', { exact: true })).toBeFocused();
  expect((await data(page)).cases[0].id).toBe('owner-renamed');
  await card.getByLabel('Scenario ID', { exact: true }).fill('owner');
  await expect(page.locator('#review-status')).toContainText('Historical review');
  await expect(page.locator('#review-download-evidence')).toBeDisabled();
});

test('nested record and Bool forms display literal strings and keep output exact', async ({ page }) => {
  const literal = '<img src=x onerror=alert(1)>😀';
  const value = { inner: { text: literal, enabled: true }, flag: false };
  await custom(page, 'record Inner { text: String, enabled: Bool } record Outer { inner: Inner, flag: Bool } fn f(x: Outer)->Outer{x}', suite([row('literal', [value], value, 'Outer')]));
  const card = cards(page).first();
  await expect(card.getByLabel('Argument 1.inner.text', { exact: true })).toHaveValue(literal);
  await expect(page.locator('#scenario-editor img')).toHaveCount(0);
  await review(page, 'Pass');
  await card.getByLabel('Argument 1.inner.enabled', { exact: true }).uncheck();
  expect((await data(page)).cases[0].expect.result.value).toEqual(value);
  await review(page, 'Fail');
  await card.getByLabel('Required: inner.enabled', { exact: true }).uncheck();
  await review(page, 'Pass');
  const output = 'first\nsecond\n';
  await card.getByLabel('Required output', { exact: true }).fill(output);
  expect((await data(page)).cases[0].expect.output).toBe(output);
  await review(page, 'Fail');
  await card.getByLabel('Required result type', { exact: true }).fill('Wrong');
  expect((await data(page)).cases[0].expect.result.type).toBe('Wrong');
  await custom(page, 'fn f(x: String)->String{x}', suite([row('string', [literal], literal, 'String')]));
  await review(page, 'Pass');
  await cards(page).first().getByLabel('Argument 1', { exact: true }).fill('not an Int: 0001');
  expect((await data(page)).cases[0].expect.result.value).toBe(literal);
  await review(page, 'Fail');
  await custom(page, 'fn f(x: Bool)->Bool{x}', suite([row('bool', [true], true, 'Bool')]));
  await review(page, 'Pass');
  await cards(page).first().getByLabel('Argument 1', { exact: true }).uncheck();
  expect((await data(page)).cases[0].expect.result.value).toBe(true);
  await review(page, 'Fail');
});

test('duplicate copies requirements exactly with unique ASCII IDs; explicit removal enforces 1–16 cases', async ({ page }) => {
  await custom(page, undefined, suite([row('case-1', ['1'], '999')]));
  await expect(cards(page).first().getByRole('button', { name: 'Remove scenario' })).toBeDisabled();
  for (let count = 2; count <= 16; count++) {
    const first = cards(page).first();
    if (!(await first.evaluate(node => node.open))) await first.locator('summary').click();
    await first.getByRole('button', { name: 'Duplicate scenario' }).click();
    await expect(cards(page)).toHaveCount(count);
  }
  const saved = await data(page);
  expect(new Set(saved.cases.map(item => item.id)).size).toBe(16);
  expect(saved.cases.map(item => item.id)).toEqual(Array.from({ length: 16 }, (_, index) => `case-${index + 1}`));
  for (const item of saved.cases) expect({ ...item, id: 'case-1' }).toEqual(row('case-1', ['1'], '999'));
  await cards(page).first().locator('summary').click();
  await expect(cards(page).first().getByRole('button', { name: 'Duplicate scenario' })).toBeDisabled();
  await review(page, 'Fail');
  expect(JSON.parse(await page.locator('#review-json').textContent()).review.summary).toMatchObject({ total: 16, attempted_invocations: 32 });
  for (let count = 15; count >= 1; count--) {
    const first = cards(page).first();
    if (!(await first.evaluate(node => node.open))) await first.locator('summary').click();
    await first.getByRole('button', { name: 'Remove scenario' }).click();
    await expect(cards(page)).toHaveCount(count);
  }
  await cards(page).first().locator('summary').click();
  await expect(cards(page).first().getByRole('button', { name: 'Remove scenario' })).toBeDisabled();
  await expect(page.locator('#review-download-evidence')).toBeDisabled();
});

test('raw duplicate, unknown, unsupported, and noncanonical suites remain byte-for-byte fallback', async ({ page }) => {
  await page.goto('?workbench');
  const canonical = json(suite([row()]));
  for (const text of [
    canonical.replace('"version": 1', '"version": 1, "version": 1'),
    json({ ...suite([row()]), hidden: 'preserve' }),
    json(suite([{ ...row(), hidden: true }])),
    json(suite([{ ...row(), expect: { ...row().expect, hidden: true } }])),
    json(suite([row('bad', [42])])), json(suite([row('bad', [null])])), json(suite([row('bad', [[]])])),
    json(suite([row('cr', ['1'], '1', 'Int', '\r\n')])),
    JSON.stringify(suite([row()])), canonical + '\n', '{broken',
  ]) {
    await raw(page, text);
    await expect(cards(page)).toHaveCount(0);
    await expect(page.locator('#review-suite')).toHaveValue(text);
    await expect(page.locator('#scenario-editor')).toContainText('Custom or incomplete suite');
  }
  const tooMany = Object.fromEntries(Array.from({ length: 33 }, (_, i) => [`f${i}`, 'x']));
  await raw(page, json(suite([row('fields', [tooMany])]))); await expect(cards(page)).toHaveCount(0);
  let nested = 'x'; for (let i = 0; i < 17; i++) nested = { child: nested };
  await raw(page, json(suite([row('deep', [nested])]))); await expect(cards(page)).toHaveCount(0);
  const record = Object.fromEntries(Array.from({ length: 32 }, (_, i) => [`f${i}`, 'x']));
  await raw(page, json(suite([row('wide', Array.from({ length: 64 }, () => record))])));
  await expect(page.locator('#scenario-editor')).toContainText('UI field limit (2048)');
  await expect(cards(page)).toHaveCount(0);
});

test('invalid Int strings and duplicate IDs reach native preflight without automatic repair', async ({ page }) => {
  await custom(page);
  const card = cards(page).first();
  await card.getByLabel('Argument 1', { exact: true }).fill('01');
  await review(page, 'Error');
  expect((await data(page)).cases[0]).toEqual(row('owner', ['01']));
  await expect(page.locator('#review-summary')).toContainText('no case invocations');
  await card.getByLabel('Argument 1', { exact: true }).fill('1');
  await card.getByLabel('Required result', { exact: true }).fill('+1');
  await review(page, 'Error');
  expect((await data(page)).cases[0].expect.result.value).toBe('+1');
  await card.getByLabel('Required result', { exact: true }).fill('1');
  await page.getByLabel('Function target', { exact: true }).fill('missing');
  await review(page, 'Error');
  expect((await data(page)).target).toBe('missing');
  await page.getByLabel('Function target', { exact: true }).fill('f');
  await card.getByRole('button', { name: 'Duplicate scenario' }).click();
  await cards(page).nth(1).locator('summary').click();
  await cards(page).nth(1).getByLabel('Scenario ID', { exact: true }).fill('owner');
  await review(page, 'Error');
  expect((await data(page)).cases.map(item => item.id)).toEqual(['owner', 'owner']);
  await expect(cards(page)).toHaveCount(2);
});

test('stale controls cannot overwrite new raw suites or newer rendered data', async ({ page }) => {
  await custom(page);
  const rawText = '{"duplicate":1,"duplicate":2}';
  await cards(page).first().getByLabel('Argument 1', { exact: true }).evaluate((input, text) => {
    window.obsoleteInput = input;
    document.getElementById('review-suite').value = text;
    input.value = '999'; input.dispatchEvent(new Event('input'));
  }, rawText);
  await expect(page.locator('#review-suite')).toHaveValue(rawText);
  await expect(cards(page)).toHaveCount(0);
  const newer = json(suite([row('new', ['2'], '2')]));
  await raw(page, newer);
  await page.evaluate(() => window.obsoleteInput.dispatchEvent(new Event('input')));
  await expect(page.locator('#review-suite')).toHaveValue(newer);
  await expect(cards(page)).toHaveCount(1);
});

test('canonical file and workspace imports refresh generic forms; minified import stays raw', async ({ page }) => {
  await page.goto('?workbench');
  const source = 'fn f(n: Int)->Int{n}';
  const canonical = json(suite([row()]));
  const file = (name, text) => ({ name, mimeType: 'application/octet-stream', buffer: Buffer.from(text) });
  await page.locator('#policy-files-baseline').setInputFiles(file('baseline.wisp', source));
  await page.locator('#policy-files-suite').setInputFiles(file('cases.json', canonical));
  await page.locator('#policy-files-open').click();
  await expect(cards(page)).toHaveCount(1);
  await expect(page.getByLabel('Function target', { exact: true })).toHaveValue('f');
  await review(page, 'Pass');
  await page.locator('#policy-files-suite').setInputFiles(file('cases.json', JSON.stringify(suite([row()]))));
  await page.locator('#policy-files-open').click();
  await expect(cards(page)).toHaveCount(0);
  await page.locator('summary').filter({ hasText: 'Save or reopen your workspace' }).click();
  await page.locator('#workspace-file').setInputFiles(file('workspace.json', json({ format: 'wisp-browser-workspace-v1', approval: 'not_granted', applied: false, baseline: source, candidate: source, suite_json: canonical })));
  await page.locator('#workspace-replace').click();
  await expect(cards(page)).toHaveCount(1);
  await expect(page.locator('#review-suite')).toHaveValue(canonical);
  await expect(page.locator('#review-download-evidence')).toBeDisabled();
});
