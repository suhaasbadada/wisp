import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const button = page => page.getByRole('button', { name: 'Download readable review', exact: true });
const scenario = (id, args, type, value, output = '') => ({ id, args, expect: { result: { type, value }, output } });
async function submit(page) {
  await page.locator('#review-run').click();
  await expect(page.locator('#review-status')).toContainText('Submitted inputs');
}
async function custom(page, before, after, cases) {
  await page.goto('');
  await page.locator('#source').fill(before); await page.locator('#review-capture').click();
  await page.locator('#source').fill(after);
  await page.locator('#review-suite').fill(JSON.stringify({ version: 1, target: 'f', cases }));
  await submit(page);
}
async function download(page, selector = '#review-download-readable') {
  const pending = page.waitForEvent('download'); await page.locator(selector).click();
  const file = await pending;
  return { name: file.suggestedFilename(), raw: await readFile(await file.path(), 'utf8') };
}
async function offline(browser, raw, inspect) {
  const context = await browser.newContext({ offline: true });
  const page = await context.newPage(); const requests = []; const dialogs = [];
  page.on('request', request => requests.push(request.url()));
  page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });
  await page.route('**/*', route => route.abort());
  try {
    await page.setContent(raw, { waitUntil: 'load' });
    await expect(page.locator('script, img, svg, iframe, object, embed, link, a, form')).toHaveCount(0);
    expect(await page.locator('*').evaluateAll(nodes => nodes.flatMap(node => [...node.attributes].filter(attr => /^on/i.test(attr.name)).map(attr => attr.name)))).toEqual([]);
    await expect(page.locator('meta[charset]')).toHaveAttribute('charset', 'utf-8');
    await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute('content', "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'");
    await expect(page.locator('.warning')).toContainText('Historical snapshot, not current acceptance');
    await expect(page.locator('.warning')).toContainText('Approval: not_granted; applied: false');
    await expect(page.locator('.warning')).toContainText('Finite evidence is not proof');
    await inspect(page);
    expect(requests).toEqual([]); expect(dialogs).toEqual([]);
  } finally { await context.close(); }
}

test('download is complete offline evidence, including all seven passed rows under an empty attention filter', async ({ page, browser }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker; window.reviewWorkers = 0;
    window.Worker = class extends NativeWorker { constructor(...args) { super(...args); window.reviewWorkers++; } };
  });
  await page.goto('?workbench'); await submit(page);
  const reportText = await page.locator('#review-json').textContent(); const report = JSON.parse(reportText);
  const source = await page.locator('#source').inputValue(); const baseline = await page.locator('#review-baseline').inputValue();
  const suite = await page.locator('#review-suite').inputValue(); const inputs = JSON.parse(suite).cases;
  const workers = await page.evaluate(() => window.reviewWorkers);
  await page.getByRole('button', { name: 'Needs attention', exact: true }).click();
  await expect(page.locator('#review-decisions tbody tr')).toHaveCount(0);
  const file = await download(page); expect(file.name).toBe('policy-review.html');
  const bundle = JSON.parse((await download(page, '#review-download-evidence')).raw);
  expect(JSON.stringify(bundle.report, null, 2)).toBe(reportText);
  await expect(page.locator('#review-json')).toHaveText(reportText);
  await expect(page.locator('#source')).toHaveValue(source); await expect(page.locator('#review-suite')).toHaveValue(suite);
  expect(await page.evaluate(() => window.reviewWorkers)).toBe(workers);
  await offline(browser, file.raw, async saved => {
    await expect(saved.locator('h1')).toHaveText('Wisp policy review — native outcome: Pass');
    await expect(saved.locator('tbody tr')).toHaveCount(7);
    const identity = saved.locator('dl').first();
    for (const value of [report.compiler, report.revision, report.review.baseline_revision, report.review.candidate_revision, report.review.suite_hash, report.review.query_key]) await expect(identity).toContainText(value);
    const counters = saved.locator('dl').nth(1);
    for (const [name, value] of Object.entries(report.review.summary)) {
      await expect(counters.locator('dt').filter({ hasText: new RegExp(`^${name}$`) })).toHaveCount(1);
      expect(await counters.locator('dt').filter({ hasText: new RegExp(`^${name}$`) }).evaluate(node => node.nextElementSibling.textContent)).toBe(String(value));
    }
    for (const [index, row] of report.review.cases.entries()) {
      const cells = saved.locator('tbody tr').nth(index).locator('td');
      await expect(cells.nth(0)).toHaveText(`${row.id}\nNative index: ${row.index}\nSaved inputs: ${JSON.stringify(inputs[index].args, null, 2)}`);
      for (const [cell, observation] of [[1, row.before], [2, row.after]]) {
        await expect(cells.nth(cell)).toContainText(`Result (${observation.result.type}): ${JSON.stringify(observation.result.value, null, 2)}`);
        await expect(cells.nth(cell)).toContainText(`Output: ${JSON.stringify(observation.output)}`);
      }
      await expect(cells.nth(3)).toHaveText(`Result (${row.expected.result.type}): ${JSON.stringify(row.expected.result.value, null, 2)}\nOutput: ${JSON.stringify(row.expected.output)}`);
      await expect(cells.nth(4).locator('.native-case-status')).toHaveText(`Expectation: ${row.expectation}\nComparison: ${row.comparison}\nReason: ${row.comparison_reason}`);
    }
    expect(await saved.locator('#baseline-source').textContent()).toBe(baseline);
    expect(await saved.locator('#candidate-source').textContent()).toBe(source);
    expect(await saved.locator('#raw-suite').textContent()).toBe(suite);
    expect(await saved.locator('#native-report').textContent()).toBe(reportText);
    await expect(saved.locator('details[open]')).toHaveCount(0);
  });
});

test('native Fail preserves distinct observed and owner-required values and exact quoted outputs', async ({ page, browser }) => {
  await custom(page, 'fn f() -> Int { 2 }', 'fn f() -> Int { print("line"); 2 }', [scenario('owner-mismatch', [], 'Int', '999')]);
  await offline(browser, (await download(page)).raw, async saved => {
    await expect(saved.locator('h1')).toContainText('native outcome: Fail');
    const cells = saved.locator('tbody td');
    await expect(cells.nth(1)).toContainText('Result (Int): "2"\nOutput: ""');
    await expect(cells.nth(2)).toContainText('Result (Int): "2"\nOutput: "line\\n"');
    await expect(cells.nth(3)).toHaveText('Result (Int): "999"\nOutput: ""');
    await expect(cells.nth(4)).toContainText('Expectation: Fail');
  });
});

test('leading blank lines in both sources and the raw suite survive HTML reopening', async ({ page, browser }) => {
  const baseline = '\n\nfn f() -> Int { 1 }'; const candidate = '\nfn f() -> Int { 2 }\n';
  const suite = '\n\n' + JSON.stringify({ version: 1, target: 'f', cases: [scenario('leading', [], 'Int', '2')] }) + '\n';
  await page.goto('');
  await page.locator('#source').fill(baseline); await page.locator('#review-capture').click();
  await page.locator('#source').fill(candidate); await page.locator('#review-suite').fill(suite); await submit(page);
  await expect(page.locator('#review-status')).toContainText('Submitted inputs · Pass');
  await offline(browser, (await download(page)).raw, async saved => {
    expect(await saved.locator('#baseline-source').textContent()).toBe(baseline);
    expect(await saved.locator('#candidate-source').textContent()).toBe(candidate);
    expect(await saved.locator('#raw-suite').textContent()).toBe(suite);
  });
});

test('valid source NUL is visibly escaped while the exact JSON input snapshot remains lossless', async ({ page, browser }) => {
  const source = '// NUL:\0\nfn f() -> Int { 1 }';
  await custom(page, source, source, [scenario('nul-comment', [], 'Int', '1')]);
  await expect(page.locator('#review-status')).toContainText('Submitted inputs · Pass');
  const suite = await page.locator('#review-suite').inputValue();
  await offline(browser, (await download(page)).raw, async saved => {
    expect(await saved.locator('#candidate-source').textContent()).toBe(source.replaceAll('\0', '\\u0000'));
    const exact = JSON.parse(await saved.locator('#exact-inputs').textContent());
    expect(exact).toEqual({ baseline: source, candidate: source, suite_json: suite });
  });
});

test('String Bool record and full i64 data with hostile HTML remain literal, without executable nodes or requests', async ({ page, browser }) => {
  const payload = '</pre><script>alert(1)</script><img src="https://invalid.test/leak" onerror="alert(2)"><iframe src=//invalid.test></iframe>';
  const data = { text: payload, flag: true, number: '9223372036854775807' };
  const code = `// ${payload}\nrecord Data { text: String, flag: Bool, number: Int }\nfn f(text: String, flag: Bool, data: Data) -> Data { print(text); data }`;
  await custom(page, code, code, [scenario('literal-record', [payload, false, data], 'Data', data, payload + '\n')]);
  const native = await page.locator('#review-json').textContent();
  await offline(browser, (await download(page)).raw, async saved => {
    await expect(saved.locator('h1')).toContainText('native outcome: Pass');
    for (const cell of [0, 1, 2, 3]) {
      await expect(saved.locator('tbody td').nth(cell)).toContainText('9223372036854775807');
      await expect(saved.locator('tbody td').nth(cell)).toContainText(payload.replaceAll('"', '\\"'));
    }
    await expect(saved.locator('tbody td').nth(0)).toContainText('false');
    expect(await saved.locator('#candidate-source').textContent()).toBe(code);
    expect(await saved.locator('#native-report').textContent()).toBe(native);
  });
  const strings = 'fn f(text: String) -> String { text }';
  await custom(page, strings, strings, [scenario('string', [payload], 'String', payload)]);
  await offline(browser, (await download(page)).raw, async saved => {
    await expect(saved.locator('tbody td').nth(3)).toHaveText(`Result (String): ${JSON.stringify(payload)}\nOutput: ""`);
  });
  await custom(page, 'fn f(flag: Bool) -> Bool { flag }', 'fn f(flag: Bool) -> Bool { flag }', [scenario('bool', [false], 'Bool', false)]);
  await offline(browser, (await download(page)).raw, async saved => {
    await expect(saved.locator('tbody td').nth(3)).toHaveText('Result (Bool): false\nOutput: ""');
  });
});

test('native Error and bounded Unknown retain every observation diagnostic without suggesting Pass or authority', async ({ page, browser }) => {
  const before = 'fn f(x: Int) -> Int { x }';
  const after = 'fn f(x: Int) -> Int { if x == 1 { 1 / (x - 1) } else { f(x) } }';
  await custom(page, before, after, [scenario('error', ['1'], 'Int', '1'), scenario('unknown', ['2'], 'Int', '2')]);
  const report = JSON.parse(await page.locator('#review-json').textContent());
  expect(report.review.cases.map(row => row.expectation)).toEqual(['Error', 'Unknown']);
  await offline(browser, (await download(page)).raw, async saved => {
    await expect(saved.locator('h1')).not.toContainText('outcome: Pass');
    for (const [index, row] of report.review.cases.entries()) {
      const cells = saved.locator('tbody tr').nth(index).locator('td');
      await expect(cells.nth(2)).toContainText(`Native diagnostics: ${JSON.stringify(row.after.diagnostics, null, 2)}`);
      await expect(cells.nth(4)).toContainText(`Expectation: ${row.expectation}`);
    }
    expect(JSON.parse(await saved.locator('#native-report').textContent())).toEqual(report);
  });
});

test('preflight exports no observations and all document-owned diagnostics; missing native review never enables export', async ({ page, browser }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      set onmessage(handler) { super.onmessage = event => { if (window.omitReview && event.data.report) delete event.data.report.review; handler?.(event); }; }
    };
  });
  await custom(page, 'fn f(x: Int) -> Int { x }', 'fn f(x: Int) -> Int { x }', [scenario('bad-int', ['01'], 'Int', '1')]);
  const report = JSON.parse(await page.locator('#review-json').textContent());
  expect(report.review.phase).toBe('preflight');
  await offline(browser, (await download(page)).raw, async saved => {
    await expect(saved.locator('h1')).toContainText('native outcome: Error');
    await expect(saved.locator('tbody tr')).toHaveCount(0);
    await expect(saved.locator('body')).toContainText('Preflight: no case observations or case invocations');
    await expect(saved.locator('li')).toHaveCount(report.diagnostics.length);
    for (const [index, diagnostic] of report.diagnostics.entries()) expect(await saved.locator('li pre').nth(index).textContent()).toBe(JSON.stringify(diagnostic, null, 2));
    await expect(saved.locator('ul')).toContainText('E_INPUT_INT_CANONICAL');
    await expect(saved.locator('ul')).toContainText('/suite/cases/0/args/0');
    expect(JSON.parse(await saved.locator('#native-report').textContent())).toEqual(report);
  });
  await page.evaluate(() => { window.omitReview = true; });
  await page.locator('#review-run').click(); await expect(page.locator('#review-status')).toContainText('no review accepted');
  await expect(button(page)).toBeDisabled();
});

test('candidate/suite edits and reverts, baseline recapture and explicit preparation formatting expire the download gate', async ({ page }) => {
  await page.goto('?workbench'); await expect(button(page)).toBeDisabled(); await submit(page);
  for (const selector of ['#source', '#review-suite']) {
    const value = await page.locator(selector).inputValue();
    await page.locator(selector).evaluate((node, value) => { node.value = value + '\n'; node.dispatchEvent(new Event('input')); }, value);
    await expect(button(page)).toBeDisabled();
    await page.locator(selector).evaluate((node, value) => { node.value = value; node.dispatchEvent(new Event('input')); }, value);
    await expect(button(page)).toBeDisabled(); await submit(page); await expect(button(page)).toBeEnabled();
  }
  await page.locator('#review-capture').click(); await expect(button(page)).toBeDisabled();
  await submit(page); await expect(button(page)).toBeEnabled();
  const compact = JSON.stringify(JSON.parse(await page.locator('#review-suite').inputValue()));
  await page.locator('#review-suite').evaluate((node, value) => { node.value = value; node.dispatchEvent(new Event('input')); }, compact);
  await submit(page); await expect(button(page)).toBeEnabled();
  await page.locator('#review-format-suite').click(); await expect(button(page)).toBeDisabled();
});

test('imported review history and file replacement cannot export until a fresh native review', async ({ page }) => {
  await page.goto('?workbench'); await submit(page);
  const bundle = (await download(page, '#review-download-evidence')).raw;
  await page.locator('summary').filter({ hasText: 'Save or reopen your workspace' }).click();
  await page.locator('#workspace-file').setInputFiles({ name: 'review.json', mimeType: 'application/json', buffer: Buffer.from(bundle) });
  await page.locator('#workspace-replace').click(); await expect(page.locator('#workspace-history')).toBeVisible();
  await expect(button(page)).toBeDisabled(); await expect(page.locator('#review-json')).toHaveText('');
  await submit(page); await expect(button(page)).toBeEnabled();
  const file = (name, text) => ({ name, mimeType: 'text/plain', buffer: Buffer.from(text) });
  const code = 'fn f() -> Int { 1 }';
  await page.locator('#policy-files-baseline').setInputFiles(file('baseline.wisp', code));
  await page.locator('#policy-files-candidate').setInputFiles(file('candidate.wisp', code));
  await page.locator('#policy-files-suite').setInputFiles(file('cases.json', JSON.stringify({ version: 1, target: 'f', cases: [scenario('fresh', [], 'Int', '1')] })));
  await page.locator('#policy-files-open').click(); await expect(button(page)).toBeDisabled();
  await submit(page); await expect(button(page)).toBeEnabled();
});
