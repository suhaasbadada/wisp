import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const status = page => page.locator('#call-input-status');
const pack = page => page.locator('#call-input-download');
const rawFile = (buffer, name = 'data.json') => ({ name, mimeType: 'application/json', buffer: Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer) });
async function open(page, source = 'fn f(x: Int) -> Int { x }', args = '["2"]', target = 'f') {
  await page.goto(''); await page.locator('#source').fill(source);
  await expect(page.locator('#call-target option')).not.toHaveCount(0);
  await expect(page.locator('#call-target')).toContainText(target);
  await page.locator('#call-target').selectOption(target);
  await page.locator('#call-args').fill(args);
  await page.locator('#call-inputs > summary').click();
  await expect(pack(page)).toBeDisabled();
}
async function ready(page) {
  await page.locator('#call-input-check').click(); await expect(status(page)).toContainText('Inputs Ready — types only');
  await expect(pack(page)).toBeEnabled();
  return JSON.parse(await page.locator('#call-input-report').textContent());
}
async function download(page) {
  const pending = page.waitForEvent('download'); await pack(page).click(); const file = await pending;
  expect(file.suggestedFilename()).toBe('function-inputs.tar'); return { path: await file.path(), bytes: await readFile(await file.path()) };
}
async function boundaries(page) {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker; window.inputRequests = []; window.inputRequestJson = []; window.releaseWorkers = [];
    window.Worker = class extends NativeWorker {
      postMessage(message, ...rest) {
        const request = message.request ?? JSON.parse(message.requestJson);
        window.inputRequests.push(request); this.inputRequest = request;
        if (message.requestJson) window.inputRequestJson.push(message.requestJson);
        super.postMessage(message, ...rest);
      }
      set onmessage(handler) {
        super.onmessage = handler && (event => {
          if (this.inputRequest?.op === 'validate-call') {
            const r = event.data.report;
            if (r && window.mutateReady) window.mutateReady(r);
            if (window.delayInputWorker) { window.releaseWorkers.push(() => handler(event)); return; }
          }
          handler(event);
        });
      }
    };
    const NativeReader = window.FileReader; window.releaseReads = [];
    window.FileReader = class extends NativeReader {
      set onload(handler) {
        super.onload = handler && (event => {
          if (window.delayInputRead) window.releaseReads.push(() => handler(event)); else handler(event);
        });
      }
      readAsArrayBuffer(blob) {
        if (window.failInputRead) { this.onerror?.(new ProgressEvent('error')); return; }
        if (window.hangInputRead) return;
        super.readAsArrayBuffer(blob);
      }
    };
  });
}

test('explicit file load preserves raw UTF-8, duplicate keys and numeric spelling without running; shape errors belong to input paths', async ({ page }) => {
  await boundaries(page);
  const source = 'record Item { label: String, amount: Int }\nfn f(x: Item) -> Int { print("NO"); 1 / 0 } print(1 / 0);';
  await open(page, source, '[{"label":"old","amount":"1"}]');
  const raw = ' \n\t[ {"label":"雪 🚀", "amount":"2", "amount":9007199254740993.00} ] \n';
  const output = await page.locator('#output').textContent(); const result = await page.locator('#call-result').textContent();
  await page.locator('#call-input-file').setInputFiles(rawFile(raw, '<img src=x onerror=alert(1)>.json'));
  await expect(status(page)).toContainText('<img src=x onerror=alert(1)>.json'); await expect(status(page).locator('img')).toHaveCount(0);
  await expect(page.locator('#call-args')).toHaveValue('[{"label":"old","amount":"1"}]');
  expect(await page.evaluate(() => window.inputRequests.filter(r => ['call', 'validate-call', 'run'].includes(r.op)))).toEqual([]);
  await page.locator('#call-input-load').click(); await expect(page.locator('#call-args')).toHaveValue(raw);
  await expect(page.locator('#source')).toHaveValue(source); await expect(page.locator('#call-target')).toHaveValue('f');
  expect(await page.evaluate(() => window.inputRequests.filter(r => ['call', 'validate-call', 'run'].includes(r.op)))).toEqual([]);
  await page.locator('#call-input-check').click(); await expect(status(page)).toContainText('/args/0/amount');
  await expect(status(page)).toContainText('E_INPUT_FIELD_DUPLICATE'); await expect(pack(page)).toBeDisabled();
  expect((await page.evaluate(() => window.inputRequests.filter(r => r.op === 'validate-call')))[0].args[0].amount).toBe(9007199254740993.00);
  expect(await page.evaluate(() => window.inputRequestJson.find(raw => JSON.parse(raw).op === 'validate-call'))).toBe(`{"op":"validate-call","source":${JSON.stringify(source)},"function":"f","args":${raw}}`);
  await expect(page.locator('#call-args')).toHaveValue(raw); await expect(page.locator('#output')).toHaveText(output); await expect(page.locator('#call-result')).toHaveText(result);
  const report = JSON.parse(await page.locator('#call-input-report').textContent());
  expect(report.status).toBe('Error'); expect(report.input_validation.new_execution).toBe(false); expect(report).not.toHaveProperty('invocation');
});

test('file admission rejects size, encoding, BOM, CR, invalid standalone/root JSON without replacing owner inputs or invocation evidence', async ({ page }) => {
  await open(page); await page.locator('#invoke').click(); await expect(page.locator('#run-status')).toHaveText('CALL COMPLETE');
  const before = await page.locator('#call-result').textContent(); const evidence = await page.locator('#call-evidence').textContent();
  for (const buffer of [Buffer.alloc(65537, 32), Buffer.from([0xc3, 0x28]), Buffer.from('\uFEFF["2"]'), Buffer.from('["2"]\r\n'), Buffer.from('["2"], 3'), Buffer.from('{}')]) {
    await page.locator('#call-input-file').setInputFiles(rawFile(buffer)); await page.locator('#call-input-load').click();
    await expect(status(page)).toContainText('current inputs unchanged');
    await expect(page.locator('#source')).toHaveValue('fn f(x: Int) -> Int { x }'); await expect(page.locator('#call-args')).toHaveValue('["2"]'); await expect(page.locator('#call-target')).toHaveValue('f');
    await expect(page.locator('#call-result')).toHaveText(before); await expect(page.locator('#call-evidence')).toHaveText(evidence); await expect(pack(page)).toBeDisabled();
  }
});

test('delayed file read cannot commit after owner edit-and-revert, file change or Stop; fields stay editable', async ({ page }) => {
  await boundaries(page); await open(page);
  await page.evaluate(() => { window.delayInputRead = true; });
  for (const action of ['args', 'source', 'target', 'file', 'stop']) {
    await page.locator('#call-input-file').setInputFiles(rawFile('["8"]'));
    await page.locator('#call-input-load').click();
    await expect.poll(() => page.evaluate(() => window.releaseReads.length)).toBe(1);
    await expect(page.locator('#source')).toBeEditable(); await expect(page.locator('#call-args')).toBeEditable(); await expect(page.locator('#call-target')).toBeEnabled();
    if (action === 'stop') await page.locator('#call-input-stop').click();
    else if (action === 'file') await page.locator('#call-input-file').setInputFiles(rawFile('["9"]', 'another.json'));
    else await page.locator(action === 'args' ? '#call-args' : action === 'source' ? '#source' : '#call-target').evaluate(node => {
      const old = node.value; node.dispatchEvent(new Event('input')); node.value = old; node.dispatchEvent(new Event('change'));
    });
    await page.evaluate(() => window.releaseReads.splice(0).forEach(release => release()));
    await expect(page.locator('#call-args')).toHaveValue('["2"]'); await expect(pack(page)).toBeDisabled();
  }
});

test('file read failure and finite five-second deadline fail closed', async ({ page }) => {
  await boundaries(page); await open(page);
  await page.evaluate(() => { window.failInputRead = true; });
  await page.locator('#call-input-file').setInputFiles(rawFile('["8"]')); await page.locator('#call-input-load').click();
  await expect(status(page)).toContainText('File read failed');
  await page.evaluate(() => { window.failInputRead = false; window.hangInputRead = true; });
  await page.clock.install(); await page.locator('#call-input-load').click(); await page.clock.fastForward(5001);
  await expect(status(page)).toContainText('deadline (5 seconds)'); await expect(page.locator('#call-args')).toHaveValue('["2"]'); await expect(pack(page)).toBeDisabled(); await expect(page.locator('#call-input-stop')).toBeDisabled();
});

test('real Rust Ready checks only types: top-level faults, prints, probes and infinite function do not run', async ({ page }) => {
  await boundaries(page);
  const source = 'fn f(x: Int) -> Int { print(x); f(x) } print(1 / 0); probe n in 0..=0 { 1 / 0 == 0 }';
  const args = ' \n [ "2" ] \t\n'; await open(page, source, args);
  const report = await ready(page);
  expect(report.compiler).toBe('wisp-0.1.0-semantics-7'); expect(report.revision).toBe(createHash('sha256').update(source).digest('hex'));
  expect(report.input_validation).toEqual({ contract_version: 1, phase: 'validated', new_execution: false, target: 'f', argument_count: 1, argument_hash: createHash('sha256').update('[ "2" ]').digest('hex') });
  expect(report.output).toBe(''); expect(report.probes).toEqual([]); expect(report.diagnostics).toEqual([]);
  for (const key of ['result', 'usage', 'invocation', 'execution_key']) expect(report).not.toHaveProperty(key);
  await expect(status(page)).toContainText('function/top-level/probes NOT executed; not success/approval');
  await expect(page.locator('#call-result')).toHaveText('No invocation yet.'); await expect(page.locator('#run-status')).toHaveText('NOT RUN');
  expect(await page.evaluate(() => window.inputRequests.filter(r => ['call', 'run'].includes(r.op)))).toEqual([]);
});

test('elapsed deadline rejects reads, worker responses and digests even before the cancellation timer runs', async ({ page }) => {
  await boundaries(page); await open(page);
  await page.evaluate(() => {
    const now = performance.now.bind(performance); window.elapsedInputTime = 0;
    performance.now = () => now() + window.elapsedInputTime;
    window.delayInputRead = true;
  });
  await page.locator('#call-input-file').setInputFiles(rawFile('["8"]'));
  await page.locator('#call-input-load').click();
  await expect.poll(() => page.evaluate(() => window.releaseReads.length)).toBe(1);
  await page.evaluate(() => { window.elapsedInputTime += 6000; window.releaseReads.splice(0).forEach(release => release()); });
  await expect(status(page)).toContainText('deadline'); await expect(page.locator('#call-args')).toHaveValue('["2"]');
  await page.evaluate(() => { window.delayInputWorker = true; });
  await page.locator('#call-input-check').click();
  await expect.poll(() => page.evaluate(() => window.releaseWorkers.length)).toBe(1);
  await page.evaluate(() => { window.elapsedInputTime += 6000; window.releaseWorkers.splice(0).forEach(release => release()); });
  await expect(status(page)).toContainText('deadline'); await expect(pack(page)).toBeDisabled();
  await page.evaluate(() => {
    window.delayInputWorker = false; window.releaseDigests = [];
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    crypto.subtle.digest = async (...args) => { const result = await digest(...args); return new Promise(resolve => window.releaseDigests.push(() => resolve(result))); };
  });
  await page.locator('#call-input-check').click();
  await expect.poll(() => page.evaluate(() => window.releaseDigests.length)).toBe(2);
  await page.evaluate(() => { window.elapsedInputTime += 6000; window.releaseDigests.splice(0).forEach(release => release()); });
  await expect(status(page)).toContainText('deadline'); await expect(pack(page)).toBeDisabled();
});

test('every owner edit-and-revert, target switch, new file, load and Stop revokes Ready package', async ({ page }) => {
  await open(page, 'fn f(x: Int) -> Int { x } fn g(x: Int) -> Int { x }');
  for (const selector of ['#source', '#call-args', '#call-target']) {
    await ready(page);
    await page.locator(selector).evaluate(node => { const old = node.value; if (node.tagName === 'SELECT') node.value = 'g'; else node.value += '\n'; node.dispatchEvent(new Event('input')); node.value = old; node.dispatchEvent(new Event('input')); });
    await expect(pack(page)).toBeDisabled();
  }
  await ready(page); await page.locator('#call-target').selectOption('g'); await expect(pack(page)).toBeDisabled();
  await ready(page); await page.locator('#call-input-file').setInputFiles(rawFile('["2"]')); await expect(pack(page)).toBeDisabled();
  await ready(page); await page.locator('#call-input-load').click(); await expect(status(page)).toContainText('Loaded exact'); await expect(pack(page)).toBeDisabled();
  await ready(page); await page.locator('#call-input-stop').click(); await expect(pack(page)).toBeDisabled();
});

test('delayed real worker and digest responses cannot enable stale Ready, including edit-revert and Stop', async ({ page }) => {
  await boundaries(page); await open(page);
  await page.evaluate(() => { window.delayInputWorker = true; });
  await page.locator('#call-input-check').click(); await expect.poll(() => page.evaluate(() => window.releaseWorkers.length)).toBe(1);
  await page.locator('#call-args').fill('["3"]'); await page.locator('#call-args').fill('["2"]');
  await page.evaluate(() => window.releaseWorkers.splice(0).forEach(release => release())); await expect(pack(page)).toBeDisabled();
  await page.evaluate(() => {
    window.delayInputWorker = false; window.releaseDigests = [];
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    crypto.subtle.digest = async (...args) => { const result = await digest(...args); return new Promise(resolve => window.releaseDigests.push(() => resolve(result))); };
  });
  for (const action of ['edit', 'file', 'stop']) {
    await page.locator('#call-input-check').click(); await expect.poll(() => page.evaluate(() => window.releaseDigests.length)).toBe(2);
    if (action === 'edit') { await page.locator('#call-args').fill('["3"]'); await page.locator('#call-args').fill('["2"]'); }
    if (action === 'file') await page.locator('#call-input-file').setInputFiles(rawFile('["2"]'));
    if (action === 'stop') await page.locator('#call-input-stop').click();
    await page.evaluate(() => window.releaseDigests.splice(0).forEach(release => release())); await expect(pack(page)).toBeDisabled();
  }
});

test('unsupported or inconsistent Ready metadata from real Rust boundary never authorizes package', async ({ page }) => {
  await boundaries(page); await open(page);
  const changes = [
    "r.compiler = 'other'", "r.revision = '0'.repeat(64)", 'delete r.input_validation',
    'r.input_validation.contract_version = 2', "r.input_validation.phase = 'executed'", 'r.input_validation.new_execution = true',
    "r.input_validation.target = 'g'", 'r.input_validation.argument_count = 2', "r.input_validation.argument_hash = '0'.repeat(64)",
    "r.output = 'ran'", 'r.probes = [{}]', 'r.diagnostics = [{}]', 'r.result = {}', 'r.usage = {}', 'r.invocation = {}',
    'r.new_execution = true', 'r.input_validation.execution_key = "extra"'
  ];
  for (const change of changes) {
    await page.evaluate(change => { window.mutateReady = new Function('r', change); }, change);
    await page.locator('#call-input-check').click(); await expect(status(page)).toContainText('Unsupported or inconsistent'); await expect(pack(page)).toBeDisabled();
  }
});

test('native Unknown and worker deadline cannot accept partial validation or revive a late response', async ({ page }) => {
  await boundaries(page); await open(page);
  await page.evaluate(() => { window.mutateReady = r => { r.status = 'Unknown'; r.diagnostics = [{ kind: 'Limit', path: '/args', code: 'E_LIMIT_INPUT_BYTES', message: 'bounded' }]; }; });
  await page.locator('#call-input-check').click(); await expect(status(page)).toContainText('Unknown — Limit /args: bounded'); await expect(pack(page)).toBeDisabled();
  await page.evaluate(() => { window.delayInputWorker = true; });
  await page.clock.install(); await page.locator('#call-input-check').click(); await page.clock.fastForward(5001);
  await expect(status(page)).toContainText('deadline'); await expect(pack(page)).toBeDisabled();
  await page.evaluate(() => window.releaseWorkers.splice(0).forEach(release => release())); await expect(pack(page)).toBeDisabled();
});

test('worker creation/post exceptions, errors, message errors and transport failures are fail closed and independent of Invoke', async ({ page }) => {
  await boundaries(page); await open(page);
  await page.evaluate(() => {
    const PreviousWorker = window.Worker;
    window.Worker = class extends PreviousWorker {
      constructor(...args) { if (window.workerFailure === 'create') throw new Error('creation failed'); super(...args); }
    };
    const old = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function(message, ...rest) {
      if (message.requestJson && JSON.parse(message.requestJson).op === 'validate-call') {
        if (window.workerFailure === 'post') throw new Error('post failed');
        if (window.workerFailure === 'error' || window.workerFailure === 'messageerror') { this.dispatchEvent(new Event(window.workerFailure)); return; }
        if (window.workerFailure === 'transport') { this.dispatchEvent(new MessageEvent('message', { data: { id: message.id, error: 'transport failed' } })); return; }
      }
      return old.call(this, message, ...rest);
    };
  });
  for (const mode of ['create', 'post', 'error', 'messageerror', 'transport']) {
    await page.evaluate(mode => { window.workerFailure = mode; }, mode);
    await page.locator('#call-input-check').click(); await expect(status(page)).toContainText('No accepted input validation'); await expect(pack(page)).toBeDisabled();
    await expect(page.locator('#call-input-stop')).toBeDisabled(); await expect(page.locator('#call-input-check')).toBeEnabled();
  }
  await page.locator('#invoke').click(); await expect(page.locator('#run-status')).toHaveText('CALL COMPLETE');
});

test('host shape checks cap both inputs and reject invalid Unicode/BOM/CR/syntax before dispatch', async ({ page }) => {
  await boundaries(page); await open(page);
  for (const value of [' '.repeat(65537), '\uFEFF["2"]', '["2"]\r\n', '["\ud800"]', '[] , "injected": true', '{}']) {
    // Textareas normalize CR themselves; the host still checks the immutable raw
    // snapshot (the file path independently rejects CR before applying it).
    await page.locator('#call-args').evaluate((node, value) => { Object.defineProperty(node, 'value', { configurable: true, get: () => value }); node.dispatchEvent(new Event('input')); }, value);
    await page.locator('#call-input-check').click(); await expect(status(page)).toContainText('No accepted input validation'); await expect(pack(page)).toBeDisabled();
  }
  await page.locator('#call-args').evaluate(node => { delete node.value; });
  for (const target of ['f\n', 'f\r', 'f\u2028', 'f;echo_bad', '../f', '雪']) {
    await page.locator('#call-target').evaluate((node, value) => { node.add(new Option(value, value)); node.value = value; node.dispatchEvent(new Event('change')); }, target);
    await page.locator('#call-input-check').click(); await expect(status(page)).toContainText('ASCII function identifier'); await expect(pack(page)).toBeDisabled();
  }
  await page.locator('#source').evaluate(node => { Object.defineProperty(node, 'value', { configurable: true, get: () => ' '.repeat(65537) }); });
  await page.locator('#call-input-check').click(); await expect(status(page)).toContainText('Source exceeds 64 KiB');
  expect(await page.evaluate(() => window.inputRequests.filter(r => r.op === 'validate-call'))).toEqual([]);
});

function inspect(file, target) {
  return JSON.parse(execFileSync('python3', ['-c', `
import io, json, pathlib, subprocess, sys, tarfile, tempfile
raw = pathlib.Path(sys.argv[1]).read_bytes()
names = ['program.wisp','args.json','input-validation.json','README.txt']
assert len(raw) <= 16*1024*1024 and len(raw)%512 == 0
files = {}; offset = 0
with tarfile.open(fileobj=io.BytesIO(raw), mode='r:') as archive:
    members = archive.getmembers()
    assert [m.name for m in members] == names
    for m in members:
        assert m.isfile() and m.type == tarfile.REGTYPE and m.mode == 0o600
        assert m.uid == m.gid == m.mtime == 0 and m.uname == m.gname == m.linkname == '' and m.pax_headers == {}
        assert m.offset == offset and m.offset_data == offset+512
        header = raw[offset:offset+512]
        assert header[257:265] == b'ustar\\0'+b'00' and header[345:500] == bytes(155)
        assert int(header[148:154],8) == sum(header[:148])+8*32+sum(header[156:]) == m.chksum
        data = archive.extractfile(m).read(); files[m.name] = data.decode('utf-8')
        assert data == raw[offset+512:offset+512+m.size]
        end = offset+512+((m.size+511)//512)*512
        assert raw[offset+512+m.size:end] == bytes(end-offset-512-m.size)
        offset = end
assert raw[offset:] == bytes(1024)
with tempfile.TemporaryDirectory(prefix='wisp-inputs-') as folder:
    root = pathlib.Path(folder)
    # Fixed test-owned paths only; never extractall or archive-controlled paths.
    for name in names: (root/name).write_bytes(files[name].encode('utf-8'))
    outputs = []
    for op in ['validate','call']:
        r = subprocess.run([sys.argv[2],op,'program.wisp',sys.argv[3],'--args-file','args.json'],cwd=root,capture_output=True,timeout=10)
        outputs.append({'exit':r.returncode,'report':json.loads(r.stdout)})
    print(json.dumps({'files':files,'validate':outputs[0],'call':outputs[1]}))
`, file.path, resolve('target/debug/wisp'), target], { encoding: 'utf8', timeout: 30000, maxBuffer: 32 * 1024 * 1024 }));
}

test('fixed plaintext archive preserves exact raw UTF-8/escaped NUL/outer whitespace and reproduces trusted native validate then call', async ({ page }) => {
  await boundaries(page);
  const source = '\n// 雪 🚀 NUL:\0 $(do-not-run) </script>\nfn f(x: String) -> String { x }\n';
  const args = ' \n\t[ "雪 🚀\\u0000" ] \n'; await open(page, source, args); const native = await ready(page);
  const requests = await page.evaluate(() => window.inputRequests.length);
  const file = await download(page); expect((await download(page)).bytes).toEqual(file.bytes);
  expect(await page.evaluate(() => window.inputRequests.length)).toBe(requests);
  const result = inspect(file, 'f');
  expect(Object.keys(result.files)).toEqual(['program.wisp', 'args.json', 'input-validation.json', 'README.txt']);
  expect(result.files['program.wisp']).toBe(source); expect(result.files['args.json']).toBe(args); expect(JSON.parse(result.files['input-validation.json'])).toEqual(native);
  expect(result.validate.exit).toBe(0); expect(result.validate.report).toEqual(native); expect(result.call.exit).toBe(0); expect(result.call.report.result).toEqual({ type: 'String', value: '雪 🚀\0' });
  for (const text of ['new empty directory', 'TRUSTED installed Wisp compiler', 'wisp validate program.wisp f --args-file args.json', 'wisp call program.wisp f --args-file args.json', '0 Complete/Ready; 1 Error; 3 Unknown; 2 host/usage failure', 'not fresh execution success or approval']) expect(result.files['README.txt']).toContain(text);
  expect(result.files['README.txt']).not.toContain('do-not-run'); await expect(page.locator('#call-result')).toHaveText('No invocation yet.');
});

test('200-record invoice batch loads as data, validates without execution, then reproduces known native summary from package', async ({ page }) => {
  const source = await readFile('examples/invoice-batch.wisp', 'utf8');
  const rows = Array.from({ length: 200 }, () => ({ quantity: '2', unit_cents: '250', declared_cents: '500' }));
  rows[199].declared_cents = '490';
  const args = '\n ' + JSON.stringify([rows, '100000']) + ' \n';
  await open(page, source, '[]', 'reconcile'); await page.locator('#call-input-file').setInputFiles(rawFile(args)); await page.locator('#call-input-load').click();
  await expect(page.locator('#call-args')).toHaveValue(args); await ready(page);
  const result = inspect(await download(page), 'reconcile'); expect(result.validate.exit).toBe(0); expect(result.call.exit).toBe(0);
  expect(result.call.report.result.type).toBe('Reconciliation');
  expect(result.call.report.result.value).toEqual({ line_count: '200', computed_cents: '100000', declared_cents: '99990', mismatched_lines: '1', invalid_lines: '0', payment_cents: '100000', payment_difference_cents: '0', balanced: false });
  expect(result.files['args.json']).toBe(args); await expect(page.locator('#call-result')).toHaveText('No invocation yet.');
});
