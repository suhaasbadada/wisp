import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const row = (id, args = ['1'], value = '1', type = 'Int') => ({ id, args, expect: { result: { type, value }, output: '' } });
const suite = cases => ({ version: 1, target: 'f', cases });
const pretty = value => JSON.stringify(value, null, 2);
const cards = page => page.locator('#scenario-editor .scenario-card');
const actions = page => page.locator('.scenario-select');
const action = (page, id) => page.locator('#review-decisions').getByRole('button', { name: `Edit saved scenario ${id}`, exact: true });
async function raw(page, text) {
  await page.locator('#review-suite').evaluate((node, value) => {
    node.value = value; node.dispatchEvent(new Event('input')); node.dispatchEvent(new Event('change'));
  }, text);
}
async function custom(page, code = 'fn f(x: Int)->Int{x}', cases = [row('owner')]) {
  await page.goto('?workbench');
  await page.locator('#source').fill(code); await page.locator('#review-capture').click();
  await raw(page, pretty(suite(cases)));
}
async function review(page, status = 'Pass') {
  await page.locator('#review-run').click();
  await expect(page.locator('#review-status')).toContainText(`Submitted inputs · ${status}`);
  return JSON.parse(await page.locator('#review-json').textContent());
}
async function hold(page, id) {
  await action(page, id).evaluate(button => { window.oldAction = button.onclick; });
}
async function inert(page) {
  await page.locator('#source').focus();
  await page.evaluate(() => window.oldAction());
  await expect(page.locator('#source')).toBeFocused();
}

test('expense failure navigates without writing or running; only an explicit owner edit repairs the requirement', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker; window.reviewRequests = 0;
    window.Worker = class extends NativeWorker {
      postMessage(message, ...rest) { if (message.requestJson) window.reviewRequests++; return super.postMessage(message, ...rest); }
    };
  });
  await page.goto('?workbench'); await page.locator('#workbench-expense').click();
  await review(page);
  const card = cards(page).nth(3); await card.locator('summary').click();
  const required = card.getByLabel('Required: reimbursable', { exact: true });
  await required.uncheck(); await card.locator('summary').click();
  const report = await review(page, 'Fail');
  expect(report.review.cases[3]).toMatchObject({ id: 'receipt-boundary', expectation: 'Fail', after: { result: { value: { reimbursable: true } } } });
  await page.evaluate(() => {
    window.inputEvents = 0;
    for (const name of ['input', 'change']) document.addEventListener(name, () => window.inputEvents++);
  });
  const before = await page.evaluate(() => ({ inputs: ['source', 'review-baseline', 'review-suite'].map(id => document.getElementById(id).value), evidence: document.getElementById('review-json').textContent, requests: window.reviewRequests, status: document.getElementById('review-status').textContent }));
  await action(page, 'receipt-boundary').click();
  await expect(card).toHaveAttribute('open', ''); await expect(required).toBeFocused(); await expect(required).not.toBeChecked();
  expect(await page.evaluate(() => ({ inputs: ['source', 'review-baseline', 'review-suite'].map(id => document.getElementById(id).value), evidence: document.getElementById('review-json').textContent, requests: window.reviewRequests, status: document.getElementById('review-status').textContent }))).toEqual(before);
  expect(await page.evaluate(() => window.inputEvents)).toBe(0);
  await expect(page.locator('#review-download-evidence')).toBeEnabled();
  await expect(page.locator('#review-decisions caption')).toContainText('Selection does not write or run');
  await required.check();
  await expect(page.locator('#review-status')).toContainText('Historical review');
  await expect(page.locator('#review-download-evidence')).toBeDisabled(); await expect(actions(page)).toHaveCount(0);
  await review(page); await expect(page.locator('#review-download-evidence')).toBeEnabled();
});

test('reservation decision and case-card actions focus the first required record value, not its type', async ({ page }) => {
  await page.goto('?workbench'); await review(page);
  const card = cards(page).first();
  await action(page, 'exact-pack').click();
  await expect(card.getByLabel('Required: accepted', { exact: true })).toBeFocused();
  await card.locator('summary').click();
  const resultCard = page.locator('#review-cases .review-case').first(); await resultCard.locator(':scope > summary').click();
  await resultCard.getByRole('button', { name: 'Edit saved scenario exact-pack', exact: true }).click();
  await expect(card.getByLabel('Required: accepted', { exact: true })).toBeFocused();
  await expect(card.getByLabel('Required result type', { exact: true })).not.toBeFocused();
});

test('custom scalar Bool full-i64 Unicode literals and nested/empty records retain exact owner values', async ({ page }) => {
  const literal = '<img src=x onerror=alert(1)> café 😀\nsecond';
  for (const [code, saved, label] of [
    ['fn f(x: Int)->Int{x}', row('max-i64', ['9223372036854775807'], '9223372036854775807'), 'Required result'],
    ['fn f(x: Bool)->Bool{x}', row('bool', [false], false, 'Bool'), 'Required result'],
    ['fn f(x: String)->String{x}', row('literal', [literal], literal, 'String'), 'Required result'],
    ['record Inner { text: String, flag: Bool } record Outer { nested: Inner } fn f(x: Outer)->Outer{x}', row('nested', [{ nested: { text: literal, flag: true } }], { nested: { text: literal, flag: true } }, 'Outer'), 'Required: nested.text'],
    ['record Empty {} fn f(x: Empty)->Empty{x}', row('empty', [{}], {}, 'Empty'), 'Scenario ID'],
  ]) {
    await custom(page, code, [saved]); await review(page);
    const text = await page.locator('#review-suite').inputValue();
    await action(page, saved.id).click();
    await expect(cards(page).first().getByLabel(label, { exact: true })).toBeFocused();
    await expect(page.locator('#review-suite')).toHaveValue(text);
    await expect(page.locator('#scenario-editor img, #review-decisions img')).toHaveCount(0);
  }
});

test('attention preserves original case indices, including a last-case failure and executed faults/Unknown', async ({ page }) => {
  const code = 'fn f(x: Int)->Int{if x == 1 { 1 / (x - 1) } else { if x == 2 { f(x) } else { x } }}';
  await custom(page, code, [row('pass', ['0'], '0'), row('fault', ['1']), row('unknown', ['2'], '2'), row('last-fail', ['3'], '999')]);
  const report = await review(page, 'Error');
  expect(report.review.cases.map(item => item.expectation)).toEqual(['Pass', 'Error', 'Unknown', 'Fail']);
  await page.locator('#review-filter-attention').click();
  await expect(page.locator('#review-decisions tbody tr')).toHaveCount(3);
  for (const [id, index] of [['fault', 1], ['unknown', 2], ['last-fail', 3]]) {
    await action(page, id).click();
    await expect(cards(page).nth(index).getByLabel('Required result', { exact: true })).toBeFocused();
  }
  await expect(cards(page).last().getByLabel('Required result', { exact: true })).toHaveValue('999');
});

test('raw compact fallback needs explicit format then a new review; rejected and mismatched mappings have no actions', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      set onmessage(handler) {
        super.onmessage = event => {
          const row = event.data.report?.review?.cases?.[0];
          // Only corrupt mapping of a real native result; never fabricate execution.
          if (row && window.badMapping === 'index') row.index = 9;
          if (row && window.badMapping === 'id') row.id = 'different';
          handler?.(event);
        };
      }
    };
  });
  await custom(page);
  const compact = JSON.stringify(suite([row('owner')])); await raw(page, compact);
  await review(page); await expect(actions(page)).toHaveCount(0); await expect(page.locator('#review-suite')).toHaveValue(compact);
  await page.locator('#review-format-suite').click();
  await expect(cards(page)).toHaveCount(1); await expect(actions(page)).toHaveCount(0);
  await review(page); await expect(action(page, 'owner')).toBeEnabled();
  for (const mode of ['index', 'id']) {
    await page.evaluate(mode => { window.badMapping = mode; }, mode); await review(page); await expect(actions(page)).toHaveCount(0);
  }
  await page.evaluate(() => { window.badMapping = undefined; });
  await page.locator('#source').fill('fn f(x: String)->String{x}'); await page.locator('#review-capture').click();
  const unsupported = pretty(suite([row('raw-only', ['owner\rtext'], 'owner\rtext', 'String')]));
  await raw(page, unsupported); await review(page);
  await expect(cards(page)).toHaveCount(0); await expect(actions(page)).toHaveCount(0);
  await expect(page.locator('#review-suite')).toHaveValue(unsupported);
  await page.locator('#source').fill('fn f(x: Int)->Int{x}'); await page.locator('#review-capture').click();
  for (const saved of [suite([row('same'), row('same')]), suite([row('😀')]), suite([row('\"><svg/onload=alert(1)>')]), { ...suite([row('owner')]), extra: true }]) {
    const text = pretty(saved); await raw(page, text); await review(page, 'Error');
    await expect(actions(page)).toHaveCount(0); await expect(page.locator('#review-suite')).toHaveValue(text);
    await expect(page.locator('#scenario-editor svg')).toHaveCount(0);
  }
});

test('retained callbacks cannot revive after edit/revert, recapture, rerender, reorder, duplicate or a new review', async ({ page }) => {
  await custom(page, undefined, [row('first'), row('last', ['2'], '2')]);
  await review(page); await hold(page, 'last');
  // Exercise a form-generation change without any suite input/change event:
  // a retained form input notices raw replacement and conservatively rebuilds.
  const original = await page.locator('#review-suite').inputValue();
  for (const text of [pretty(suite([row('last', ['2'], '2'), row('first')])), original]) {
    await cards(page).first().getByLabel('Scenario ID', { exact: true }).evaluate((input, rawSuite) => {
      document.getElementById('review-suite').value = rawSuite; input.dispatchEvent(new Event('input'));
    }, text);
  }
  await expect(page.locator('#review-status')).toContainText('Submitted inputs'); await inert(page);
  await review(page); await hold(page, 'last');
  const source = await page.locator('#source').inputValue();
  await page.locator('#source').fill(source + '\n'); await page.locator('#source').fill(source); await inert(page);
  await page.locator('#review-filter-attention').click(); await page.locator('#review-filter-all').click(); await expect(actions(page)).toHaveCount(0);
  await review(page); await hold(page, 'last'); await page.locator('#review-capture').click(); await inert(page);
  await review(page); await hold(page, 'last');
  await page.locator('#review-suite').evaluate(node => node.dispatchEvent(new Event('change'))); await inert(page);
  await review(page); await hold(page, 'last');
  const saved = await page.locator('#review-suite').inputValue();
  // Even an unannounced raw replacement must fail closed without rebuilding.
  await page.locator('#review-suite').evaluate(node => { const value = JSON.parse(node.value); value.cases.reverse(); node.value = JSON.stringify(value, null, 2); });
  await inert(page); await expect(cards(page).first().locator('summary')).toHaveText('first');
  await raw(page, pretty(suite([row('last', ['2'], '2'), row('first')]))); await inert(page);
  await review(page); await inert(page); await action(page, 'last').click();
  await expect(cards(page).first().getByLabel('Required result', { exact: true })).toBeFocused();
  await hold(page, 'last'); await cards(page).first().getByRole('button', { name: 'Duplicate scenario', exact: true }).click(); await inert(page);
  await raw(page, saved); await review(page); await hold(page, 'last'); await review(page); await inert(page);
  await hold(page, 'last');
  await page.evaluate(() => { document.getElementById('review-run').click(); document.getElementById('review-stop').click(); });
  await inert(page); await expect(actions(page)).toHaveCount(0);
});

test('workspace history import and Restore never authorize an old callback against new cards', async ({ page }) => {
  await custom(page); await review(page); await hold(page, 'owner');
  await page.locator('summary').filter({ hasText: 'Save or reopen your workspace' }).click();
  const code = 'fn f(x: Int)->Int{x}';
  const draft = { format: 'wisp-browser-workspace-v1', approval: 'not_granted', applied: false, baseline: code, candidate: code, suite_json: pretty(suite([row('owner', ['2'], '2')])) };
  await page.locator('#workspace-file').setInputFiles({ name: 'workspace.json', mimeType: 'application/json', buffer: Buffer.from(pretty(draft)) });
  await page.locator('#workspace-replace').click(); await inert(page); await expect(actions(page)).toHaveCount(0);
  await review(page); await inert(page);
  await action(page, 'owner').click(); await expect(cards(page).first().getByLabel('Required result', { exact: true })).toHaveValue('2');
  const pending = page.waitForEvent('download'); await page.locator('#review-download-evidence').click();
  const evidence = await readFile(await (await pending).path());
  await hold(page, 'owner'); await page.locator('#workspace-restore-previous').click(); await inert(page); await expect(actions(page)).toHaveCount(0);
  await review(page); await inert(page); await action(page, 'owner').click();
  await expect(cards(page).first().getByLabel('Required result', { exact: true })).toBeFocused();
  await expect(cards(page).first().getByLabel('Required result', { exact: true })).toHaveValue('1');
  await hold(page, 'owner');
  await page.locator('#workspace-file').setInputFiles({ name: 'review.json', mimeType: 'application/json', buffer: evidence });
  await page.locator('#workspace-replace').click(); await inert(page);
  await expect(page.locator('#workspace-history')).toBeVisible(); await expect(actions(page)).toHaveCount(0);
  await review(page); await inert(page); await action(page, 'owner').click();
  await expect(cards(page).first().getByLabel('Required result', { exact: true })).toHaveValue('2');
});

test('full playground omits navigation adapter without errors or edit buttons', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('?playground'); await page.locator('#review-example').click(); await review(page);
  await expect(page.locator('#review-decisions tbody tr')).toHaveCount(7);
  await expect(actions(page)).toHaveCount(0); expect(errors).toEqual([]);
});
