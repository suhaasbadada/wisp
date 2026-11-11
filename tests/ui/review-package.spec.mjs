import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const names = ['baseline.wisp', 'candidate.wisp', 'cases.json', 'review.json', 'workspace.json', 'review.html', 'README.txt'];
const button = page => page.getByRole('button', { name: 'Download runnable review package', exact: true });
const scenario = (id, args, value) => ({ id, args, expect: { result: { type: 'Int', value }, output: '' } });
async function submit(page) {
  await page.locator('#review-run').click();
  await expect(page.locator('#review-status')).toContainText('Submitted inputs');
}
async function custom(page, before, after, suite) {
  await page.goto(''); await page.locator('#source').fill(before); await page.locator('#review-capture').click();
  await page.locator('#source').fill(after); await page.locator('#review-suite').fill(suite); await submit(page);
}
async function download(page, selector = '#review-download-package') {
  const pending = page.waitForEvent('download'); await page.locator(selector).click();
  const file = await pending;
  return { name: file.suggestedFilename(), path: await file.path(), bytes: await readFile(await file.path()) };
}

// Standard-library parser plus an independent byte-level check. Only three
// fixed inputs are copied into an owned empty TemporaryDirectory; no extractall,
// archive-controlled paths, shell, or environment credentials are used.
function inspect(file) {
  return JSON.parse(execFileSync('python3', ['-c', `
import io, json, pathlib, subprocess, sys, tarfile, tempfile
names = ['baseline.wisp','candidate.wisp','cases.json','review.json','workspace.json','review.html','README.txt']
raw = pathlib.Path(sys.argv[1]).read_bytes()
assert len(raw) % 512 == 0 and len(raw) <= 16 * 1024 * 1024
offset = 0
with tarfile.open(fileobj=io.BytesIO(raw), mode='r:') as archive:
    members = archive.getmembers()
    assert [m.name for m in members] == names
    files = {}
    for member in members:
        assert member.isfile() and member.type == tarfile.REGTYPE
        assert member.mode == 0o600 and member.uid == member.gid == member.mtime == 0
        assert member.uname == member.gname == member.linkname == '' and member.pax_headers == {}
        assert member.offset == offset and member.offset_data == offset + 512
        header = raw[offset:offset+512]
        assert header[257:265] == b'ustar\\0' + b'00'
        assert header[345:500] == bytes(155)
        checksum = sum(header[:148]) + 8 * 32 + sum(header[156:])
        assert int(header[148:154], 8) == checksum == member.chksum
        data = archive.extractfile(member).read()
        assert data == raw[offset+512:offset+512+member.size]
        files[member.name] = data.decode('utf-8')
        padded_end = offset + 512 + ((member.size + 511) // 512) * 512
        assert raw[offset+512+member.size:padded_end] == bytes(padded_end-offset-512-member.size)
        offset = padded_end
    assert raw[offset:] == bytes(1024)
with tempfile.TemporaryDirectory(prefix='wisp-package-') as folder:
    root = pathlib.Path(folder)
    for name in names[:3]:
        (root/name).write_bytes(files[name].encode('utf-8'))
    result = subprocess.run([sys.argv[2], 'review', 'baseline.wisp', 'candidate.wisp', '--suite', 'cases.json'], cwd=root, capture_output=True, timeout=10)
    check = subprocess.run([sys.argv[2], 'check', 'candidate.wisp'], cwd=root, capture_output=True, timeout=10)
    print(json.dumps({'files': files, 'report': json.loads(result.stdout), 'exit': result.returncode, 'checkExit': check.returncode}))
`, file.path, resolve('target/debug/wisp')], { encoding: 'utf8', timeout: 30000, maxBuffer: 32 * 1024 * 1024 }));
}

test('runnable package is deterministic standard USTAR with complete snapshots, offline HTML and no execution on export', async ({ page, browser }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker; window.reviewWorkers = 0;
    window.Worker = class extends NativeWorker { constructor(...args) { super(...args); window.reviewWorkers++; } };
  });
  await page.goto('?workbench'); await expect(button(page)).toBeDisabled(); await submit(page);
  const before = await page.locator('#review-baseline').inputValue(); const after = await page.locator('#source').inputValue();
  const suite = await page.locator('#review-suite').inputValue(); const report = await page.locator('#review-json').textContent();
  const workers = await page.evaluate(() => window.reviewWorkers);
  await page.locator('#review-filter-attention').click(); await expect(page.locator('#review-decisions tbody tr')).toHaveCount(0);
  const first = await download(page); expect(first.name).toBe('policy-review.tar');
  expect((await download(page)).bytes).toEqual(first.bytes);
  const result = inspect(first); expect(Object.keys(result.files)).toEqual(names);
  expect(result.files['baseline.wisp']).toBe(before); expect(result.files['candidate.wisp']).toBe(after);
  expect(result.files['cases.json']).toBe(suite); expect(result.files['review.json']).toBe(report);
  expect(result.files['workspace.json']).toBe((await download(page, '#review-download-evidence')).bytes.toString('utf8'));
  expect(result.files['review.html']).toBe((await download(page, '#review-download-readable')).bytes.toString('utf8'));
  expect(result.report).toEqual(JSON.parse(report)); expect(result.exit).toBe(0); expect(result.checkExit).toBe(0);
  const readme = result.files['README.txt'];
  for (const text of ['TRUSTED installed Wisp compiler', 'new,\nempty folder', 'wisp review baseline.wisp candidate.wisp --suite cases.json', 'wisp check candidate.wisp', '0 Pass; 1 Fail or Error; 3 Unknown; 2 host/usage failure', 'not approval', 'not current acceptance', 'not_granted; applied: false']) expect(readme).toContain(text);
  const context = await browser.newContext({ offline: true });
  try {
    const saved = await context.newPage(); const requests = []; saved.on('request', request => requests.push(request.url()));
    await saved.route('**/*', route => route.abort()); await saved.setContent(result.files['review.html']);
    await expect(saved.locator('script, img, svg, iframe, object, embed, link, a, form')).toHaveCount(0);
    await expect(saved.locator('tbody tr')).toHaveCount(7);
    expect(await saved.locator('#native-report').textContent()).toBe(report);
    expect(await saved.locator('#baseline-source').textContent()).toBe(before);
    await expect(saved.locator('.warning')).toContainText('Historical snapshot, not current acceptance'); expect(requests).toEqual([]);
  } finally { await context.close(); }
  expect(await page.evaluate(() => window.reviewWorkers)).toBe(workers);
  await expect(page.locator('#source')).toHaveValue(after); await expect(page.locator('#review-suite')).toHaveValue(suite);
  await expect(page.locator('#review-json')).toHaveText(report);
});

test('UTF-8, source NUL, leading LF, raw suite whitespace and full i64 survive terminal reproduction exactly', async ({ page }) => {
  const source = '\n\n// 雪 🚀 NUL:\0 </pre><script>not code</script>\nfn f(x: Int) -> Int { x }\n';
  const suite = '\n\n' + JSON.stringify({ version: 1, target: 'f', cases: [scenario('full-i64', ['9223372036854775807'], '9223372036854775807')] }) + '\n';
  await custom(page, source, source, suite);
  const result = inspect(await download(page));
  expect(result.files['baseline.wisp']).toBe(source); expect(result.files['candidate.wisp']).toBe(source); expect(result.files['cases.json']).toBe(suite);
  expect(result.files['review.json']).toBe(await page.locator('#review-json').textContent());
  expect(result.report).toEqual(JSON.parse(result.files['review.json'])); expect(result.exit).toBe(0);
  expect(result.files['README.txt']).not.toContain('雪');
  const bundle = JSON.parse(result.files['workspace.json']);
  expect(bundle.baseline).toBe(source); expect(bundle.candidate).toBe(source); expect(bundle.suite_json).toBe(suite);
});

test('Fail, runtime Error, bounded Unknown and preflight Error retain native statuses and terminal exits', async ({ page }) => {
  for (const [candidate, args, value, status, exit, phase] of [
    ['fn f(x: Int) -> Int { x }', ['2'], '999', 'Fail', 1, 'executed'],
    ['fn f(x: Int) -> Int { 1 / x }', ['0'], '1', 'Error', 1, 'executed'],
    ['fn f(x: Int) -> Int { f(x) }', ['1'], '1', 'Unknown', 3, 'executed'],
    ['fn f(x: Int) -> Int { x }', ['01'], '1', 'Error', 1, 'preflight']
  ]) {
    await custom(page, 'fn f(x: Int) -> Int { x }', candidate, JSON.stringify({ version: 1, target: 'f', cases: [scenario('case', args, value)] }));
    const result = inspect(await download(page));
    expect(result.report).toEqual(JSON.parse(await page.locator('#review-json').textContent()));
    expect(result.report.status).toBe(status); expect(result.report.review.phase).toBe(phase); expect(result.exit).toBe(exit);
    expect(result.files['review.html']).toContain(`native outcome: ${status}`);
    if (phase === 'preflight') expect(result.report.review.cases).toEqual([]);
  }
});

test('edits, edit-and-revert, recapture and explicit suite formatting revoke package download', async ({ page }) => {
  await page.goto('?workbench'); await submit(page);
  for (const selector of ['#source', '#review-suite']) {
    const value = await page.locator(selector).inputValue();
    await page.locator(selector).evaluate((node, value) => { node.value = value + '\n'; node.dispatchEvent(new Event('input')); }, value); await expect(button(page)).toBeDisabled();
    await page.locator(selector).evaluate((node, value) => { node.value = value; node.dispatchEvent(new Event('input')); }, value); await expect(button(page)).toBeDisabled();
    await submit(page); await expect(button(page)).toBeEnabled();
  }
  await page.locator('#review-capture').click(); await expect(button(page)).toBeDisabled(); await submit(page);
  await page.locator('#review-suite').evaluate(node => { node.value = JSON.stringify(JSON.parse(node.value)); node.dispatchEvent(new Event('input')); });
  await submit(page); await expect(button(page)).toBeEnabled();
  await page.locator('#review-format-suite').click(); await expect(button(page)).toBeDisabled();
});

test('imported history, even with tampered report, never enables package download before a fresh native review', async ({ page }) => {
  await page.goto('?workbench'); await submit(page);
  const bundle = JSON.parse((await download(page, '#review-download-evidence')).bytes.toString('utf8'));
  bundle.report.status = 'Unknown'; bundle.report.compiler = 'untrusted history';
  await page.locator('summary').filter({ hasText: 'Save or reopen your workspace' }).click();
  await page.locator('#workspace-file').setInputFiles({ name: 'history.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bundle, null, 2)) });
  await page.locator('#workspace-replace').click(); await expect(page.locator('#workspace-history')).toBeVisible();
  await expect(button(page)).toBeDisabled(); await expect(page.locator('#review-json')).toHaveText('');
  await submit(page); await expect(button(page)).toBeEnabled();
  expect(inspect(await download(page)).report.compiler).not.toBe('untrusted history');
});

test('active worker, missing native review and unsupported review contract cannot enable package export', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      set onmessage(handler) { super.onmessage = event => {
        if (event.data.report && window.responseMode === 'missing') delete event.data.report.review;
        if (event.data.report?.review && window.responseMode === 'unsupported') event.data.report.review.contract_version = 999;
        setTimeout(() => handler?.(event), 200);
      }; }
    };
  });
  await page.goto('?workbench'); await submit(page);
  await page.locator('#review-run').click(); await expect(button(page)).toBeDisabled();
  await expect(page.locator('#review-status')).toContainText('Submitted inputs');
  for (const mode of ['missing', 'unsupported']) {
    await page.evaluate(mode => { window.responseMode = mode; }, mode);
    await page.locator('#review-run').click(); await expect(page.locator('#review-status')).toContainText(/no review accepted/i);
    await expect(button(page)).toBeDisabled();
  }
});

test('oversize package fails generically without a successful download', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      set onmessage(handler) { super.onmessage = event => {
        if (event.data.report?.review) event.data.report.package_limit_test = 'x'.repeat(17 * 1024 * 1024);
        handler?.(event);
      }; }
    };
  });
  await page.goto('?workbench'); await submit(page);
  const downloads = []; page.on('download', file => downloads.push(file));
  await button(page).click();
  await expect(page.locator('#review-status')).toHaveText('Review package could not be created. No package downloaded; nothing applied or approved.');
  expect(downloads).toEqual([]);
});
