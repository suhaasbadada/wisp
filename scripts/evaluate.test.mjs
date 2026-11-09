import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { ROOT, LIMITS, parseArgs, verifyFrozen, structuralTypeScript, structuralWisp, gradeResult, createRunner, evaluateTask, sha256, validateCases } from './evaluate.mjs';
import { acceptanceCases } from './evaluation-cases.mjs';

const starter = (task, ext) => readFileSync(join(ROOT, `evaluation/tasks/${task}/starter.${ext}`), 'utf8');
const protocol = JSON.parse(readFileSync(join(ROOT, 'evaluation/protocol.json'), 'utf8'));
const nativePresent = existsSync(join(ROOT, 'target/debug/wisp'));
function temporary(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'wisp-harness-test-'));
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('argument grammar rejects unknown, duplicate, missing and invalid values', () => {
  assert.deepEqual(parseArgs([]), { submissions: 'evaluation/submissions' });
  assert.deepEqual(parseArgs(['--arm', 'wisp', '--task', 'quota', '--out', 'new.json']), { submissions: 'evaluation/submissions', arm: 'wisp', task: 'quota', out: 'new.json' });
  for (const args of [['extra'], ['--help'], ['--out'], ['--arm', 'rust'], ['--task', 'unknown'], ['--out', 'a', '--out', 'b'], ['--submissions', '--arm']]) assert.throws(() => parseArgs(args));
});

test('frozen verification hashes every required input and fails closed', () => temporary(dir => {
  const files = {};
  const paths = ['evaluation/protocol.json', 'scripts/evaluation-cases.mjs', ...protocol.tasks.flatMap(task => ['task.md', 'starter.ts', 'starter.wisp'].map(file => `evaluation/tasks/${task.id}/${file}`))];
  for (const path of paths) {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), 'frozen');
    files[path] = sha256('frozen');
  }
  const manifest = join(dir, 'evaluation/frozen.json');
  writeFileSync(manifest, JSON.stringify({ version: 1, files }));
  assert.deepEqual(verifyFrozen(dir).files, files);
  writeFileSync(join(dir, paths[0]), 'mutated');
  assert.throws(() => verifyFrozen(dir), /mismatch/);
  writeFileSync(manifest, JSON.stringify({ version: 1, files: {} }));
  assert.throws(() => verifyFrozen(dir), /missing/);
  writeFileSync(manifest, '{');
  assert.throws(() => verifyFrozen(dir));
}));

test('real TypeScript AST guard enforces one body, signatures, outer bytes and protected helpers', () => {
  const source = starter('refund', 'ts');
  const repaired = source.replace('unit_net(sale) * count', 'count * sale.unit_cents * (10000n - sale.discount_bps) / 10000n');
  assert.equal(structuralTypeScript(source, repaired, ['unit_net']).name, 'refund');
  for (const bad of [source, repaired.replace('10000n;', '9999n;'), repaired.replace('returned: bigint', 'returned: number'), repaired + '\n// probe mutation', repaired.replace('export interface Sale', 'interface Sale'), source.replace('sale.unit_cents *', '(sale.unit_cents + 1n) *')]) assert.throws(() => structuralTypeScript(source, bad, ['unit_net']));
  const unicode = '// é😀\nexport function f(): bigint { return 1n; }\n';
  assert.equal(structuralTypeScript(unicode, unicode.replace('1n', '2n')).name, 'f');
  assert.throws(() => structuralTypeScript(source, repaired.replace('return ', 'return @')));
});

test('native core guards Wisp bodies, signatures, probes, protected helpers and UTF-8 byte spans', { skip: !nativePresent && 'Build target/debug/wisp first' }, () => {
  const source = starter('refund', 'wisp');
  const repaired = source.replace('unit_net(sale) * count', 'count * sale.unit_cents * (10000 - sale.discount_bps) / 10000');
  assert.equal(structuralWisp(source, repaired, ['unit_net']).name, 'refund');
  for (const bad of [source, repaired.replace('/ 10000 }', '/ 9999 }'), repaired.replace('returned: Int', 'returned: Bool'), repaired.replace('n in 0..=5', 'n in 0..=4'), repaired + '\n', source.replace('sale.unit_cents *', '(sale.unit_cents + 1) *')]) assert.throws(() => structuralWisp(source, bad, ['unit_net']));
  const unicode = '// é😀\nfn f() -> Int { 1 }\n';
  assert.equal(structuralWisp(unicode, unicode.replace('{ 1 }', '{ 2 }')).name, 'f');
});

test('Ready, faults, Unknown, wrong types and malformed results never pass behavior', () => {
  const expected = { type: 'Int', value: '1' };
  assert.equal(gradeResult({ status: 'Complete', result: expected }, expected).ok, true);
  for (const report of [undefined, { status: 'Ready', result: expected }, { status: 'Unknown' }, { status: 'Fault' }, { status: 'Complete' }, { status: 'Complete', result: { type: 'Int', value: 1 } }, { status: 'Complete', result: { type: 'Int', value: '01' } }, { status: 'Complete', result: { type: 'Int', value: '1', extra: 1 } }, { status: 'Complete', result: { type: 'Bool', value: true } }]) assert.equal(gradeResult(report, expected).ok, false);
  assert.equal(gradeResult({ status: 'Complete', result: { type: 'Bool', value: 'false' } }, { type: 'Bool', value: false }).ok, false);
});

test('runner uses bounded no-shell subprocesses, counts actual bytes on failure', () => {
  let options;
  const runner = createRunner(LIMITS, (_cmd, _args, opts) => { options = opts; return { status: null, signal: 'SIGKILL', error: { code: 'ETIMEDOUT' }, stdout: 'é', stderr: 'x' }; });
  assert.throws(() => runner.run('stub', [], 'source via stdin'), /ETIMEDOUT/);
  assert.equal(options.input, 'source via stdin');
  assert.equal(options.timeout, 10000);
  assert.equal(options.maxBuffer, 1048576);
  assert.equal(options.shell, false);
  assert.equal(runner.metrics.command_count, 1);
  assert.equal(runner.metrics.response_bytes, 3);
  assert.ok(runner.metrics.elapsed_ms >= 0);
});

test('real subprocess timeout and maxBuffer are enforced', () => {
  assert.throws(() => createRunner({ ...LIMITS, command_timeout_ms: 100 }).run(process.execPath, ['-e', 'while(true){}']), /ETIMEDOUT/);
  assert.throws(() => createRunner({ ...LIMITS, command_output_bytes: 100 }).run(process.execPath, ['-e', 'process.stdout.write("x".repeat(10000))']), /ENOBUFS/);
  const runner = createRunner();
  runner.run(process.execPath, ['-e', 'process.stdout.write(Buffer.from([255])); process.stderr.write(Buffer.from([254]));']);
  assert.equal(runner.metrics.response_bytes, 2); // raw bytes, not decoded replacement characters
});

test('missing and oversized candidates fail tasks without losing case totals', () => temporary(dir => {
  const task = protocol.tasks[0];
  const cases = acceptanceCases().filter(c => c.task === task.id);
  let result = evaluateTask({ arm: 'typescript', task, cases, submissions: dir });
  assert.equal(result.passed, false);
  assert.equal(result.cases_total, cases.length);
  assert.equal(result.source_sha256, null);
  mkdirSync(join(dir, 'typescript'));
  writeFileSync(join(dir, 'typescript/shipping.ts'), ' '.repeat(65537));
  result = evaluateTask({ arm: 'typescript', task, cases, submissions: dir });
  assert.equal(result.passed, false);
  assert.equal(result.command_count, 0);
}));

test('worker batches typed record arguments, catches errors, rejects numbers/undefined and logs', () => temporary(dir => {
  const file = join(dir, 'candidate.cjs');
  writeFileSync(file, 'exports.good = (s, b) => b ? s.n : 0n; exports.number = () => 1; exports.none = () => {}; exports.fail = () => { throw Error("bad"); }; exports.bool = () => false;');
  const cases = ['good', 'number', 'none', 'fail', 'bool', 'missing'].map(target => ({ target, args: [{ n: '12' }, true] }));
  const runner = createRunner();
  const reports = JSON.parse(runner.run(process.execPath, [join(ROOT, 'scripts/evaluation-ts-worker.cjs'), file], JSON.stringify({ cases })));
  assert.equal(reports.length, cases.length);
  assert.deepEqual(reports[0].result, { type: 'Int', value: '12' });
  assert.deepEqual(reports[4].result, { type: 'Bool', value: false });
  for (const i of [1, 2, 3, 5]) assert.equal(reports[i].status, 'Error');
  writeFileSync(file, 'console.log("pollution"); exports.good = () => 1n;');
  assert.throws(() => JSON.parse(runner.run(process.execPath, [join(ROOT, 'scripts/evaluation-ts-worker.cjs'), file], JSON.stringify({ cases: cases.slice(0, 1) }))));
  writeFileSync(file, 'process.exit(0);');
  assert.throws(() => JSON.parse(runner.run(process.execPath, [join(ROOT, 'scripts/evaluation-ts-worker.cjs'), file], JSON.stringify({ cases }))));
}));

test('case validation rejects empty, unknown, duplicate, wrong-type or omitted tasks', () => {
  const cases = acceptanceCases();
  validateCases(cases, protocol.tasks);
  assert.equal(cases.length, 1237);
  for (const bad of [[], [...cases, cases[0]], cases.filter(c => c.task !== 'quota'), [{ ...cases[0], task: 'typo' }, ...cases.slice(1)], [{ ...cases[0], expected: { type: 'Int', value: 1 } }, ...cases.slice(1)]]) assert.throws(() => validateCases(bad, protocol.tasks));
});

test('truncated batches, polluted stdout and batch timeout fail without dropping cases', () => temporary(dir => {
  mkdirSync(join(dir, 'typescript'));
  writeFileSync(join(dir, 'typescript/shipping.ts'), starter('shipping', 'ts').replace('extra / 500n', '(extra + 499n) / 500n'));
  const task = protocol.tasks[0], cases = acceptanceCases().filter(c => c.task === task.id);
  for (const output of ['[]', 'pollution\n[]', null]) {
    let commands = 0;
    const runner = { metrics: { command_count: 2, response_bytes: 2, elapsed_ms: 0 }, run: () => {
      if (++commands === 1) return ''; // injected compiler success, never evaluates code
      if (output === null) throw new Error('ETIMEDOUT');
      return output;
    } };
    const result = evaluateTask({ arm: 'typescript', task, cases, submissions: dir, runner });
    assert.equal(result.passed, false);
    assert.equal(result.compile_check, true);
    assert.equal(result.cases_passed, 0);
    assert.equal(result.cases_total, cases.length);
    assert.equal(result.failures[0].stage, 'execution');
  }
}));

test('real strict compiler errors fail compilation, all case failures are bounded at 20', () => temporary(dir => {
  mkdirSync(join(dir, 'typescript'));
  const source = starter('shipping', 'ts');
  const file = join(dir, 'typescript/shipping.ts');
  writeFileSync(file, source.replace('extra / 500n', '"not an Int"'));
  const task = protocol.tasks[0], cases = acceptanceCases().filter(c => c.task === 'shipping');
  let result = evaluateTask({ arm: 'typescript', task, cases, submissions: dir });
  assert.equal(result.structural_check, true);
  assert.equal(result.compile_check, false);
  assert.match(result.failures[0].error, /error TS/);
  writeFileSync(file, source.replace('extra / 500n', '0n'));
  result = evaluateTask({ arm: 'typescript', task, cases, submissions: dir });
  assert.equal(result.compile_check, true);
  assert.equal(result.passed, false);
  assert.equal(result.failures.length, 20);
  assert.ok(result.cases_passed < result.cases_total);
  assert.equal(result.command_count, 2); // one tsc, one worker, never a Node process per case
}));

test('CLI refuses existing output without overwriting and validates before running', () => temporary(dir => {
  const file = join(dir, 'existing.json');
  writeFileSync(file, 'preserve');
  const cli = join(ROOT, 'scripts/evaluate.mjs');
  const existing = spawnSync(process.execPath, [cli, '--out', file], { encoding: 'utf8' });
  assert.equal(existing.status, 2);
  assert.equal(readFileSync(file, 'utf8'), 'preserve');
  assert.equal(spawnSync(process.execPath, [cli, '--arm', 'invalid']).status, 2);
}));

// Trusted test fixtures, not agent trial submissions. Independent finite oracles
// exercise the entire runner, including helper-target overrides and i64 edges.
for (const arm of ['typescript', 'wisp']) test(`all 1237 cases pass through the real ${arm} backend`, { skip: arm === 'wisp' && !nativePresent && 'Build target/debug/wisp first' }, () => temporary(dir => {
  mkdirSync(join(dir, arm));
  const ext = arm === 'wisp' ? 'wisp' : 'ts';
  const replacements = arm === 'wisp' ? {
    shipping: ['extra / 500', 'if extra == 0 { 0 } else { (extra - 1) / 500 + 1 }'],
    refund: ['unit_net(sale) * count', 'count * sale.unit_cents * (10000 - sale.discount_bps) / 10000'],
    quota: ['requested >= 0 && requested < usage.limit - usage.used', 'usage.used >= 0 && usage.reserved >= 0 && usage.limit >= 0 && requested >= 0 && usage.used <= usage.limit && usage.reserved <= usage.limit - usage.used && requested <= usage.limit - usage.used - usage.reserved'],
  } : {
    shipping: ['extra / 500n', 'extra === 0n ? 0n : (extra - 1n) / 500n + 1n'],
    refund: ['unit_net(sale) * count', 'count * sale.unit_cents * (10000n - sale.discount_bps) / 10000n'],
    quota: ['requested >= 0n && requested < usage.limit - usage.used', 'usage.used >= 0n && usage.reserved >= 0n && usage.limit >= 0n && requested >= 0n && usage.used + usage.reserved + requested <= usage.limit'],
  };
  let count = 0;
  for (const task of protocol.tasks) {
    writeFileSync(join(dir, arm, `${task.id}.${ext}`), starter(task.id, ext).replace(...replacements[task.id]));
    const cases = acceptanceCases().filter(c => c.task === task.id);
    const result = evaluateTask({ arm, task, cases, submissions: dir });
    assert.equal(result.passed, true, JSON.stringify(result.failures));
    assert.equal(result.cases_passed, cases.length);
    assert.equal(result.command_count, arm === 'wisp' ? cases.length + 3 : 2);
    assert.ok(result.response_bytes > 0);
    assert.ok(result.elapsed_ms > 0);
    assert.match(result.source_sha256, /^[a-f0-9]{64}$/);
    count += result.cases_passed;
  }
  assert.equal(count, 1237);
}));
