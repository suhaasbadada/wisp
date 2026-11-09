import { test, expect } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const cli = (...args) => spawnSync('./target/debug/wisp', args, { encoding: 'utf8' });

test('browser ghost download validates natively and restores after reload', async ({ page }, info) => {
  await page.goto('');
  await expect(page.locator('#diagnostics')).toContainText('Checked by Rust');
  await page.locator('#run').click();
  await expect(page.locator('#run-status')).toHaveText('FAIL');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export ghost + source' }).click();
  const file = info.outputPath('browser.wisp-ghost.json');
  await (await download).saveAs(file);
  await expect(page.locator('#artifact-status')).toContainText('Export prepared');
  const artifact = JSON.parse(readFileSync(file, 'utf8'));
  expect(artifact.ghost.input).toBe('9');
  const inspect = cli('inspect', file);
  expect(inspect.status, inspect.stderr).toBe(0);
  expect(JSON.parse(inspect.stdout).validation.new_execution).toBe(true);
  const replay = cli('replay', 'examples/snacks-repaired.wisp', '--artifact', file);
  expect(replay.status, replay.stderr).toBe(0);
  expect(JSON.parse(replay.stdout).replay.status).toBe('Pass');

  await page.reload();
  await expect(page.locator('.ghost-card')).toHaveCount(0);
  await page.locator('#example').selectOption('repaired');
  const current = await page.locator('#source').inputValue();
  await page.locator('#artifact-file').setInputFiles(file);
  await expect(page.locator('#artifact-status')).toContainText('Imported: historical failure reproduced');
  await expect(page.locator('#source')).toHaveValue(current);
  await expect(page.locator('.ghost-card')).toContainText('not authentication');
  await page.getByRole('button', { name: 'Replay input 9' }).click();
  await expect(page.locator('#output')).toContainText('Replay input 9: Pass');
  await expect(page.locator('#evidence')).toContainText('not a Clear probe');
});

test('native artifact imports; corrupt, duplicate, unsupported, oversized and invalid UTF8 reject', async ({ page }, info) => {
  const file = info.outputPath('native.wisp-ghost.json');
  const archived = cli('archive', 'examples/snacks.wisp', '--out', file);
  expect(archived.status, archived.stderr).toBe(0);
  const raw = readFileSync(file, 'utf8'); const artifact = JSON.parse(raw);
  const injected = `${raw.trimEnd()},"limits":{"cases":0}`;
  const injectedPath = info.outputPath('injected.json'); writeFileSync(injectedPath, injected);
  expect(cli('inspect', injectedPath).status).toBe(1);
  expect(cli('replay', 'examples/snacks-repaired.wisp', '--artifact', injectedPath).status).toBe(1);
  await page.goto('');
  await page.locator('#artifact-file').setInputFiles(file);
  await expect(page.locator('#artifact-status')).toContainText('Imported: historical failure reproduced');
  await expect(page.locator('.ghost-card')).toHaveCount(1);
  await page.locator('#artifact-file').setInputFiles({ name: 'injected.json', mimeType: 'application/json', buffer: Buffer.from(injected) });
  await expect(page.locator('#artifact-status')).toContainText('one standalone JSON value');
  await expect(page.locator('.ghost-card')).toHaveCount(1);
  for (const [name, value] of [
    ['corrupt', { ...artifact, source: artifact.source.replace('80', '81') }],
    ['version', { ...artifact, version: 2 }],
    ['compiler', { ...artifact, compiler: 'future' }],
  ]) {
    await page.locator('#artifact-file').setInputFiles({ name: `${name}.json`, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) });
    await expect(page.locator('#artifact-status')).toContainText('No artifact accepted');
    await expect(page.locator('.ghost-card')).toHaveCount(1);
  }
  for (const duplicate of [raw.replace('"version": 1', '"version": 1, "version": 1'), raw.replace('"fuel": 100000', '"fuel": 100000, "fuel": 100000')]) {
    const duplicatePath = info.outputPath('duplicate.json'); writeFileSync(duplicatePath, duplicate);
    expect(cli('inspect', duplicatePath).status).toBe(1);
    await page.locator('#artifact-file').setInputFiles({ name: 'duplicate.json', mimeType: 'application/json', buffer: Buffer.from(duplicate) });
    await expect(page.locator('#artifact-status')).toContainText('No artifact accepted');
  }
  await page.locator('#artifact-file').setInputFiles({ name: 'large.json', mimeType: 'application/json', buffer: Buffer.alloc(1_048_577) });
  await expect(page.locator('#artifact-status')).toContainText('exceeds the 1 MiB');
  await page.locator('#artifact-file').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from([0xff]) });
  await expect(page.locator('#artifact-status')).toContainText('not valid UTF-8');
  await expect(page.locator('.ghost-card')).toHaveCount(1);
});

test('Stop excludes late artifact acceptance and import errors do not replace current diagnostics', async ({ page }, info) => {
  const file = info.outputPath('stopped.json');
  expect(cli('archive', 'examples/snacks.wisp', '--out', file).status).toBe(0);
  await page.goto('');
  // Cancel while the asynchronous local file read is pending.
  await page.evaluate(raw => {
    const file = new File([raw], 'ghost.json', { type: 'application/json' });
    const transfer = new DataTransfer(); transfer.items.add(file);
    document.querySelector('#artifact-file').files = transfer.files;
    document.querySelector('#artifact-file').dispatchEvent(new Event('change'));
    document.querySelector('#stop').click();
  }, readFileSync(file, 'utf8'));
  await expect(page.locator('#artifact-status')).toContainText('No artifact was accepted');
  await expect(page.locator('.ghost-card')).toHaveCount(0);
  await expect(page.locator('#run')).toBeEnabled();
  await page.locator('#source').fill('print(@);');
  await expect(page.locator('#diagnostics')).toContainText('Syntax');
  await page.locator('#artifact-file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{}') });
  await expect(page.locator('#artifact-status')).toContainText('No artifact accepted');
  await expect(page.locator('#diagnostics')).toContainText('Syntax');
});

test('import deadline covers stalled file reading and rejects late completion', async ({ page }, info) => {
  const file = info.outputPath('delayed.json');
  expect(cli('archive', 'examples/snacks.wisp', '--out', file).status).toBe(0);
  await page.clock.install();
  await page.goto('');
  await page.evaluate(() => {
    const read = FileReader.prototype.readAsArrayBuffer;
    FileReader.prototype.readAsArrayBuffer = function(file) {
      window.resumeRead = () => new Promise(resolve => {
        this.addEventListener('loadend', () => resolve(), { once: true });
        read.call(this, file);
      });
    };
  });
  await page.locator('#artifact-file').setInputFiles(file);
  await expect(page.locator('#artifact-status')).toContainText('Reading selected local file');
  await page.clock.fastForward(5001);
  await expect(page.locator('#activity')).toContainText('file read interrupted');
  await expect(page.locator('#artifact-status')).toContainText('No artifact was accepted');
  await expect(page.locator('#run')).toBeEnabled();
  await page.evaluate(() => window.resumeRead());
  await expect(page.locator('.ghost-card')).toHaveCount(0);
  await expect(page.locator('#artifact-status')).toContainText('No artifact was accepted');
});
