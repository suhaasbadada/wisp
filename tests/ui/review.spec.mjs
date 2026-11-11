import { test, expect } from '@playwright/test';

async function walkthrough(page) {
  await page.goto('');
  await page.locator('#review-example').click();
  await page.locator('#review-run').click();
  await expect(page.locator('#review-status')).toContainText('Submitted inputs · Pass');
}

test('reservation review shows exact decisions and expectations without Run or approval', async ({ page }) => {
  await walkthrough(page);
  await expect(page.locator('#review-summary')).toContainText('2 Changed · 5 Unchanged');
  await expect(page.locator('#review-cases .review-case')).toHaveCount(7);
  await expect(page.locator('#output')).toHaveText('The bureau is open. Run the program.');
  await expect(page.locator('#run-status')).toHaveText('NOT RUN');
  const source = await page.locator('#source').inputValue();
  const suite = await page.locator('#review-suite').inputValue();
  const r = JSON.parse(await page.locator('#review-json').textContent());
  expect(r.review.approval).toBe('not_granted'); expect(r.review.summary.attempted_invocations).toBe(14);
  const partial = r.review.cases.find(c => c.id === 'partial-pack');
  expect(partial.before.result.value.packs).toBe('2'); expect(partial.after.result.value.packs).toBe('3');
  const mismatch = JSON.parse(suite); mismatch.cases[0].expect.result.value.packs = '999';
  await page.locator('#review-suite').fill(JSON.stringify(mismatch));
  await page.locator('#review-run').click();
  await expect(page.locator('#review-status')).toContainText('Submitted inputs · Fail');
  await expect(page.locator('#source')).toHaveValue(source);
  expect(JSON.parse(await page.locator('#review-suite').inputValue()).cases[0].expect.result.value.packs).toBe('999');
});

test('review preserves historical ghosts/output and recapture marks old reports historical', async ({ page }) => {
  await page.goto(''); await page.locator('#run').click();
  await expect(page.locator('#run-status')).toHaveText('FAIL');
  await page.locator('#review-example').click(); await page.locator('#review-run').click();
  await expect(page.locator('#review-status')).toContainText('Submitted inputs · Pass');
  await expect(page.locator('.ghost-card')).toContainText('input 9');
  await expect(page.locator('#output')).toHaveText('900\n');
  await page.locator('#review-capture').click();
  await expect(page.locator('#review-status')).toContainText('Historical review');
  await page.locator('#review-run').click();
  await expect(page.locator('#review-summary')).toContainText('0 Changed · 7 Unchanged');
  await expect(page.locator('#output')).toHaveText('900\n');
});

test('source and suite edit-and-revert never revive accepted review', async ({ page }) => {
  await walkthrough(page);
  const suite = await page.locator('#review-suite').inputValue();
  await page.locator('#review-suite').fill(suite + ' '); await page.locator('#review-suite').fill(suite);
  await expect(page.locator('#review-status')).toContainText('Historical review');
  await page.locator('#review-run').click(); await expect(page.locator('#review-status')).toContainText('Submitted inputs · Pass');
  const source = await page.locator('#source').inputValue();
  await page.locator('#source').fill(source + '\n'); await page.locator('#source').fill(source);
  await expect(page.locator('#review-status')).toContainText('Historical review');
  await page.locator('#example').selectOption('snacks');
  await expect(page.locator('#review-status')).toContainText('Historical review');
});

test('preflight failure keeps zero observations and document-owned diagnostics', async ({ page }) => {
  await page.addInitScript(() => {
    window.reviewClicks = 0;
    document.addEventListener('click', event => { if (event.target instanceof Element && event.target.closest('#review-run')) window.reviewClicks++; }, true);
  });
  await walkthrough(page);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe('auto');
  expect(await page.evaluate(() => window.reviewClicks)).toBe(1);
  const suite = JSON.parse(await page.locator('#review-suite').inputValue());
  suite.cases.at(-1).expect.result.value.packs = 0;
  await page.locator('#review-suite').fill(JSON.stringify(suite)); await page.locator('#review-run').click();
  expect(await page.evaluate(() => window.reviewClicks)).toBe(2);
  await expect(page.locator('#review-status')).toContainText('Submitted inputs · Error');
  let r = JSON.parse(await page.locator('#review-json').textContent());
  expect(r.review.phase).toBe('preflight'); expect(r.review.new_execution).toBe(false); expect(r.review.cases).toEqual([]);
  expect(r.diagnostics[0].path).toContain('/suite/cases/6/expect/result/value');
  await page.locator('#source').fill('fn f() -> Int { true }'); await page.locator('#review-run').click();
  await expect(page.locator('#review-json')).toContainText('"document": "candidate"');
  r = JSON.parse(await page.locator('#review-json').textContent());
  expect(r.diagnostics[0].span).toEqual({ start: 0, end: 0 }); expect(r.diagnostics[0].path).toBe('/candidate');
  await expect(page.locator('#review-cases .review-case')).toHaveCount(0);
});

test('review cancellation and deadline exclude delayed backend callbacks', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.__lateReviews = [];
    window.Worker = class {
      constructor(...args) { this.native = new NativeWorker(...args); this.native.onmessage = event => this.onmessage?.(event); this.native.onerror = event => this.onerror?.(event); }
      postMessage(message) {
        if (message.requestJson?.startsWith('{"op":"review"')) {
          window.__lateReviews.push(() => this.onmessage?.({ data: { id: message.id, report: { status: 'Pass', diagnostics: [], review: { contract_version: 1, phase: 'executed', approval: 'not_granted', baseline_revision: 'a'.repeat(64), candidate_revision: 'b'.repeat(64), suite_hash: 'c'.repeat(64), cases: [] } } } }));
        } else this.native.postMessage(message);
      }
      terminate() { this.native.terminate(); }
    };
  });
  await page.clock.install(); await page.goto(''); await page.locator('#review-example').click();
  await page.evaluate(() => { document.querySelector('#review-run').click(); document.querySelector('#review-stop').click(); window.__lateReviews[0](); });
  await expect(page.locator('#review-status')).toContainText('Host interruption — stopped');
  await expect(page.locator('#review-json')).toHaveText('');
  await page.evaluate(() => { document.querySelector('#review-run').click(); document.querySelector('#review-suite').dispatchEvent(new Event('input')); window.__lateReviews[1](); });
  await expect(page.locator('#review-status')).toContainText('request cancelled');
  await page.locator('#review-run').click(); await page.clock.fastForward(5001);
  await page.evaluate(() => window.__lateReviews[2]());
  await expect(page.locator('#review-status')).toContainText('deadline');
  await expect(page.locator('#review-json')).toHaveText('');
});

test('strings stay literal data and raw duplicate members reach Rust', async ({ page }) => {
  await page.goto('');
  const source = 'fn f(x: String) -> String { print(x); x }';
  await page.locator('#source').fill(source); await page.locator('#review-capture').click();
  const value = 'é😀<img src=x onerror=alert(1)>';
  const suite = { version: 1, target: 'f', cases: [{ id: 'literal', args: [value], expect: { result: { type: 'String', value }, output: value + '\n' } }] };
  await page.locator('#review-suite').fill(JSON.stringify(suite)); await page.locator('#review-run').click();
  await expect(page.locator('#review-status')).toContainText('Submitted inputs · Pass');
  await expect(page.locator('#review-cases img')).toHaveCount(0);
  await expect(page.locator('#output')).toHaveText('The bureau is open. Run the program.');
  await page.locator('#review-suite').fill(JSON.stringify(suite).replace('"version":1', '"version":1,"ver\\u0073ion":1'));
  await page.locator('#review-run').click(); await expect(page.locator('#review-json')).toContainText('E_REVIEW_REQUEST');
});

test('loading walkthrough after a custom review never presents old observations as current', async ({ page }) => {
  await page.goto('');
  await page.locator('#source').fill('fn f(x: Int) -> Int { x }');
  await page.locator('#review-capture').click();
  await page.locator('#review-suite').fill(JSON.stringify({ version: 1, target: 'f', cases: [{ id: 'custom', args: ['2'], expect: { result: { type: 'Int', value: '2' }, output: '' } }] }));
  await page.locator('#review-run').click();
  await expect(page.locator('#review-status')).toContainText('Submitted inputs · Pass');
  await page.locator('#review-example').click();
  await expect(page.locator('#review-status')).toContainText('Historical review');
  await expect(page.locator('#review-status')).toContainText('Walkthrough loaded');
  await expect(page.locator('#review-cases')).toContainText('custom');
  await page.locator('#review-run').click();
  await expect(page.locator('#review-status')).toContainText('Submitted inputs · Pass');
  await expect(page.locator('#review-cases .review-case')).toHaveCount(7);
});
