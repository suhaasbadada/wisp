import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

test('CSV transport writes validated exact strings that load, validate and explicitly execute in WASM', async ({ page, request }, testInfo) => {
  for (const path of ['examples/invoice-csv/sample.csv', 'examples/invoice-csv/run.py', 'examples/invoice-csv/README.md']) {
    const response = await request.get(path); expect(response.status()).toBe(200);
    expect(await response.body()).toEqual(await readFile(path));
  }
  await mkdir(testInfo.outputDir, { recursive: true });
  const argsPath = testInfo.outputPath('csv-args.json');
  const report = JSON.parse(execFileSync('python3', ['-B', 'examples/invoice-csv/run.py',
    '--csv', 'examples/invoice-csv/sample.csv', '--payment-cents', '1500',
    '--binary', resolve('target/debug/wisp'), '--args-out', argsPath], { encoding: 'utf8', timeout: 40000 }));
  expect(report.status).toBe('Ready'); expect(report.input_validation.new_execution).toBe(false);
  expect(report).not.toHaveProperty('result'); expect(report).not.toHaveProperty('invocation');
  const source = await readFile('examples/invoice-batch.wisp', 'utf8');
  const raw = await readFile(argsPath, 'utf8');
  await page.goto('#playground'); await page.locator('#source').fill(source);
  await expect(page.locator('#call-target')).toHaveValue('reconcile');
  await page.locator('#call-inputs > summary').click(); await page.locator('#call-input-file').setInputFiles(argsPath);
  await page.locator('#call-input-load').click(); await expect(page.locator('#call-args')).toHaveValue(raw);
  await expect(page.locator('#run-status')).toHaveText('NOT RUN');
  await page.locator('#call-input-check').click(); await expect(page.locator('#call-input-status')).toContainText('Inputs Ready — types only');
  expect(JSON.parse(await page.locator('#call-input-report').textContent())).toEqual(report);
  await expect(page.locator('#call-result')).toHaveText('No invocation yet.');
  await page.locator('#invoke').click(); await expect(page.locator('#run-status')).toHaveText('CALL COMPLETE');
  expect(JSON.parse(await page.locator('#call-result').textContent()).value).toEqual({ line_count: '3', computed_cents: '1500', declared_cents: '1490',
    mismatched_lines: '1', first_mismatched_index: '1', invalid_lines: '0', first_invalid_index: '-1',
    payment_cents: '1500', payment_difference_cents: '0', balanced: false });
});
