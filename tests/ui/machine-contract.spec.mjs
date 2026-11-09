import { test, expect } from '@playwright/test';
import { spawnSync } from 'node:child_process';

test('published manifest matches native compiler with live docs and runnable examples', async ({ page }) => {
  const response = await page.request.get('/wisp/agent.json');
  expect(response.ok()).toBeTruthy();
  expect(response.headers()['content-type']).toContain('application/json');
  const raw = await response.text(); expect(Buffer.byteLength(raw)).toBeLessThanOrEqual(32768);
  const manifest = JSON.parse(raw);
  const native = spawnSync('./target/debug/wisp', ['capabilities'], { encoding: 'utf8' });
  expect(native.status, native.stderr).toBe(0);
  expect(manifest).toEqual(JSON.parse(native.stdout));
  expect(manifest.capabilities.diagnostics.codes).toHaveLength(44);
  for (const path of Object.values(manifest.capabilities.docs)) {
    const doc = await page.request.get(new URL(path, response.url()).href);
    expect(doc.ok()).toBeTruthy(); expect(await doc.text()).toMatch(/^#/);
  }
  await page.goto('documentation/');
  await expect(page.locator('#agent-mode')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#error-contract')).toContainText('E_DIV_ZERO');
  await expect(page.getByRole('link', { name: 'Compiler capabilities — agent.json ↗' })).toHaveAttribute('href', '/wisp/agent.json');
  await expect(page.locator('#error-contract')).toContainText('Unknown means incomplete');
});

test('actual compiler diagnostic codes distinguish arithmetic and input failures', async ({ page }) => {
  await page.goto('');
  for (const [source, code] of [
    ['print(1 / 0);', 'E_DIV_ZERO'],
    ['print(-9223372036854775808 / -1);', 'E_INT_OVERFLOW'],
    ['probe n in 2..=1 { true }', 'E_PROBE_DOMAIN'],
  ]) {
    await page.locator('#source').fill(source);
    await page.locator('#run').click();
    await expect(page.locator('#diagnostics')).toContainText(`[${code}]`);
    await expect(page.locator('#run-status')).toHaveText('ERROR');
  }
  await page.locator('#example').selectOption('snacks');
  await expect(page.locator('#invoke')).toBeEnabled();
  await page.locator('#call-args').fill('[9]');
  await page.locator('#invoke').click();
  await expect(page.locator('#diagnostics')).toContainText('Input · /args/0');
  await expect(page.locator('#diagnostics')).toContainText('[E_INPUT_TYPE]');
});

test('client tolerates an unknown future code using legacy kind and report status', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = Worker;
    window.Worker = class extends NativeWorker {
      postMessage(message, options) {
        if (message.request?.op === 'run') {
          queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', { data: { id: message.id, report: {
            compiler: 'future', revision: 'future-revision', status: 'Error', output: '', probes: [], limits: {}, graph: { functions: [] },
            diagnostics: [{ code: 'E_FUTURE_UNRECOGNIZED', kind: 'Runtime', message: 'future category', span: { start: 0, end: 0 } }],
          } } })));
        } else super.postMessage(message, options);
      }
    };
  });
  await page.goto('');
  await page.locator('#run').click();
  await expect(page.locator('#run-status')).toHaveText('ERROR');
  await expect(page.locator('#diagnostics')).toContainText('Runtime ·');
  await expect(page.locator('#diagnostics')).toContainText('[E_FUTURE_UNRECOGNIZED]');
});
