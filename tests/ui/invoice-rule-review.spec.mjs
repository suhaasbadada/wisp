import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const file = (name, text) => ({ name, mimeType: 'application/octet-stream', buffer: Buffer.from(text) });
async function inputs() {
  return Promise.all(['examples/invoice-batch.wisp', 'examples/invoice-rule-review/bulk-discount.wisp',
    'examples/invoice-rule-review/cases.json', 'examples/invoice-rule-review/previous-requirements.json',
    'examples/invoice-rule-review/args.json'].map(path => readFile(path, 'utf8')));
}

test('published walkthrough source and data downloads match the authored files exactly', async ({ request }) => {
  for (const path of ['examples/invoice-batch.wisp', 'examples/invoice-rule-review/bulk-discount.wisp',
    'examples/invoice-rule-review/cases.json', 'examples/invoice-rule-review/previous-requirements.json', 'examples/invoice-rule-review/args.json']) {
    const response = await request.get(path); expect(response.status()).toBe(200);
    expect(await response.body()).toEqual(await readFile(path));
  }
});

test('authored batch files review real consequences; unchanged owner requirements Fail and exported inputs reproduce', async ({ page }) => {
  const [baseline, candidate, suite, old] = await inputs();
  await page.goto('?workbench');
  await page.locator('#policy-files-baseline').setInputFiles(file('baseline.wisp', baseline));
  await page.locator('#policy-files-candidate').setInputFiles(file('candidate.wisp', candidate));
  await page.locator('#policy-files-suite').setInputFiles(file('cases.json', suite));
  await expect(page.locator('#review-json')).toHaveText('');
  await page.locator('#policy-files-open').click(); await expect(page.locator('#policy-files-status')).toContainText('Files opened');
  await expect(page.locator('#review-baseline')).toHaveValue(baseline); await expect(page.locator('#source')).toHaveValue(candidate);
  await expect(page.locator('#review-suite')).toHaveValue(suite); await expect(page.locator('#review-json')).toHaveText('');
  await page.locator('#review-run').click(); await expect(page.locator('#review-status')).toContainText('Submitted inputs · Pass');
  const accepted = JSON.parse(await page.locator('#review-json').textContent());
  expect(accepted.review.summary).toMatchObject({ changed: 6, unchanged: 3, attempted_invocations: 18, expectation_pass: 9, expectation_fail: 0 });
  expect(accepted.review.approval).toBe('not_granted');
  const mixed = accepted.review.cases.find(row => row.id === 'mixed-original-indices');
  expect(mixed.before.result.value).toMatchObject({ computed_cents: '3011', first_mismatched_index: '3', first_invalid_index: '1' });
  expect(mixed.after.result.value).toMatchObject({ computed_cents: '2799', first_mismatched_index: '2', first_invalid_index: '1' });
  const pending = page.waitForEvent('download'); await page.locator('#review-download-package').click(); const archive = await pending;
  const reproduced = JSON.parse(execFileSync('python3', ['-c', `
import json,pathlib,subprocess,sys,tarfile,tempfile
names=['baseline.wisp','candidate.wisp','cases.json','review.json','workspace.json','review.html','README.txt']
with tempfile.TemporaryDirectory(prefix='wisp-rule-review-') as folder:
 root=pathlib.Path(folder)
 with tarfile.open(sys.argv[1]) as archive:
  assert [m.name for m in archive.getmembers()]==names
  for m in archive.getmembers():
   assert m.isfile() and m.mode==0o600
   (root/m.name).write_bytes(archive.extractfile(m).read())
 r=subprocess.run([sys.argv[2],'review','baseline.wisp','candidate.wisp','--suite','cases.json'],cwd=root,capture_output=True,timeout=30,check=True)
 print(json.dumps({'report':json.loads(r.stdout),'baseline':(root/'baseline.wisp').read_text(),'candidate':(root/'candidate.wisp').read_text(),'suite':(root/'cases.json').read_text()}))
`, await archive.path(), resolve('target/debug/wisp')], { encoding: 'utf8', timeout: 40000 }));
  expect(reproduced).toEqual({ report: accepted, baseline, candidate, suite });
  await page.locator('#policy-files-suite').setInputFiles(file('previous-requirements.json', old));
  await page.locator('#policy-files-open').click(); await expect(page.locator('#review-suite')).toHaveValue(old);
  await expect(page.locator('#review-download-package')).toBeDisabled();
  await page.locator('#review-run').click(); await expect(page.locator('#review-status')).toContainText('Submitted inputs · Fail');
  const rejected = JSON.parse(await page.locator('#review-json').textContent());
  expect(rejected.review.summary).toMatchObject({ changed: 6, unchanged: 3, expectation_pass: 3, expectation_fail: 6 });
  expect(rejected.review.approval).toBe('not_granted'); await expect(page.locator('#review-suite')).toHaveValue(old);
});

test('candidate data loads without execution, validates shapes and explicitly invokes the chosen rule', async ({ page }) => {
  const [, candidate, , , args] = await inputs();
  await page.goto('#playground'); await page.locator('#source').fill(candidate);
  await expect(page.locator('#call-target')).toHaveValue('reconcile');
  await page.locator('#call-inputs > summary').click(); await page.locator('#call-input-file').setInputFiles(file('args.json', args));
  await page.locator('#call-input-load').click(); await expect(page.locator('#call-args')).toHaveValue(args);
  await expect(page.locator('#run-status')).toHaveText('NOT RUN');
  await page.locator('#call-input-check').click(); await expect(page.locator('#call-input-status')).toContainText('Inputs Ready — types only');
  await expect(page.locator('#call-result')).toHaveText('No invocation yet.');
  await page.locator('#invoke').click(); await expect(page.locator('#run-status')).toHaveText('CALL COMPLETE');
  expect(JSON.parse(await page.locator('#call-result').textContent()).value).toEqual({ line_count: '2', computed_cents: '1800', declared_cents: '1800',
    mismatched_lines: '0', first_mismatched_index: '-1', invalid_lines: '0', first_invalid_index: '-1', payment_cents: '1800', payment_difference_cents: '0', balanced: true });
});
