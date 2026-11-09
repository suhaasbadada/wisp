/** Reproducible finite acceptance, not a benchmark or proof. Build target/debug/wisp
 * externally. Only run trusted, self-authored submissions: child processes are NOT
 * a security sandbox. Measurements are backend commands/bytes/time, not agent cost.
 * node scripts/evaluate.mjs [--submissions DIR] [--out NEW_FILE] [--task ID] [--arm wisp|typescript]
 * Frozen inputs are verified, never regenerated. Exit: 0 pass, 1 failure, 2 usage.
 */
import { readFileSync, statSync, mkdtempSync, rmSync, writeFileSync, openSync, closeSync } from 'node:fs';
import { resolve, dirname, join, relative, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import ts from 'typescript';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const LIMITS = { source_bytes: 65536, command_timeout_ms: 10000, command_output_bytes: 1048576 };
const TASKS = ['shipping', 'refund', 'quota'];
const ARMS = ['wisp', 'typescript'];
export const sha256 = data => createHash('sha256').update(data).digest('hex');
const message = error => String(error?.message ?? error).slice(0, 1500);
class UsageError extends Error {}

export function parseArgs(args) {
  const options = { submissions: 'evaluation/submissions' };
  const seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (!['--submissions', '--out', '--task', '--arm'].includes(flag) || seen.has(flag) || !args[i + 1] || args[i + 1].startsWith('--')) throw new UsageError(`Invalid argument: ${flag}`);
    seen.add(flag);
    options[flag.slice(2)] = args[++i];
  }
  if (options.task && !TASKS.includes(options.task)) throw new UsageError('Unknown task');
  if (options.arm && !ARMS.includes(options.arm)) throw new UsageError('Unknown arm');
  return options;
}

export function verifyFrozen(root = ROOT) {
  const bytes = readFileSync(join(root, 'evaluation/frozen.json'));
  const manifest = JSON.parse(bytes);
  if (manifest.version !== 1 || !manifest.files || Array.isArray(manifest.files) || typeof manifest.files !== 'object') throw new Error('Invalid frozen manifest');
  const required = ['evaluation/protocol.json', 'scripts/evaluation-cases.mjs', ...TASKS.flatMap(id => ['task.md', 'starter.ts', 'starter.wisp'].map(file => `evaluation/tasks/${id}/${file}`))];
  for (const path of required) if (!Object.hasOwn(manifest.files, path)) throw new Error(`Frozen input missing: ${path}`);
  for (const [path, hash] of Object.entries(manifest.files)) {
    if (isAbsolute(path) || path.split(/[\\/]/).includes('..') || !/^[a-f0-9]{64}$/.test(hash)) throw new Error('Invalid frozen entry');
    if (sha256(readFileSync(join(root, path))) !== hash) throw new Error(`Frozen input mismatch: ${path}`);
  }
  return { manifest_sha256: sha256(bytes), files: manifest.files };
}

/** All external commands are bounded and measured, including failed commands. */
export function createRunner(limits = LIMITS, spawn = spawnSync) {
  const metrics = { command_count: 0, response_bytes: 0, elapsed_ms: 0 };
  const run = (command, args, input = '', cwd = ROOT) => {
    const start = performance.now();
    metrics.command_count++;
    let result;
    try {
      result = spawn(command, args, { cwd, input, timeout: limits.command_timeout_ms, maxBuffer: limits.command_output_bytes, killSignal: 'SIGKILL', shell: false });
    } finally { metrics.elapsed_ms += performance.now() - start; }
    metrics.response_bytes += Buffer.byteLength(result.stdout ?? '') + Buffer.byteLength(result.stderr ?? '');
    if (result.error || result.status !== 0 || result.signal) throw new Error(`Command failed (${result.error?.code ?? result.signal ?? result.status}): ${String(result.stderr ?? '').slice(0, 600)} ${String(result.stdout ?? '').slice(0, 600)}`);
    return Buffer.isBuffer(result.stdout) ? result.stdout.toString('utf8') : result.stdout;
  };
  return { run, metrics };
}

function native(run, request) {
  return JSON.parse(run(join(ROOT, 'target/debug/wisp'), ['--json'], JSON.stringify(request)));
}
function requireReady(report) {
  if (report?.status !== 'Ready') throw new Error(`Expected Ready compiler report: ${JSON.stringify(report?.diagnostics ?? report?.status).slice(0, 1200)}`);
}
function readSource(path, cap) {
  if (!statSync(path).isFile() || statSync(path).size > cap) throw new Error('Submission missing, not regular, or exceeds source byte limit');
  const bytes = readFileSync(path);
  if (bytes.length > cap) throw new Error('Source byte limit exceeded');
  const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (!Buffer.from(source).equals(bytes)) throw new Error('Noncanonical UTF-8 source');
  return { source, hash: sha256(bytes) };
}

/** Exact recomposition protects every byte outside one existing body. */
export function changedBody(baseline, candidate, before, after, protectedFunctions = [], byteSpans = false) {
  if (before.length !== after.length || !before.length) throw new Error('Function set changed');
  const slice = (source, start, end) => byteSpans ? Buffer.from(source).subarray(start, end).toString('utf8') : source.slice(start, end);
  const changed = [];
  for (let i = 0; i < before.length; i++) {
    const a = before[i], b = after[i];
    if (a.name !== b.name || a.signature !== b.signature) throw new Error('Function name/signature changed');
    if (slice(baseline, a.start, a.end) !== slice(candidate, b.start, b.end)) changed.push([a, b]);
  }
  if (changed.length !== 1) throw new Error('Exactly one existing function body must change');
  const [a, b] = changed[0];
  if (protectedFunctions.includes(a.name)) throw new Error('Protected function changed');
  const replacement = slice(candidate, b.start, b.end);
  if (slice(baseline, 0, a.start) + replacement + slice(baseline, a.end) !== candidate) throw new Error('Bytes outside the changed body were modified');
  return { name: a.name, replacement };
}

function tsFunctions(source) {
  const tree = ts.createSourceFile('candidate.ts', source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  if (tree.parseDiagnostics.length) throw new Error('TypeScript syntax error');
  return tree.statements.filter(ts.isFunctionDeclaration).map(fn => {
    if (!fn.name || !fn.body) throw new Error('Expected named function with body');
    return { name: fn.name.text, signature: source.slice(fn.getStart(tree), fn.body.getStart(tree)), start: fn.body.getStart(tree), end: fn.body.end };
  });
}
export function structuralTypeScript(baseline, candidate, protectedFunctions = []) {
  return changedBody(baseline, candidate, tsFunctions(baseline), tsFunctions(candidate), protectedFunctions);
}
export function structuralWisp(baseline, candidate, protectedFunctions = [], run = createRunner().run) {
  const base = native(run, { op: 'analyze', source: baseline });
  const next = native(run, { op: 'analyze', source: candidate });
  requireReady(base); requireReady(next);
  const functions = report => report.graph.functions.map(fn => ({ name: fn.name, signature: fn.signature, start: fn.body_span.start, end: fn.body_span.end }));
  const change = changedBody(baseline, candidate, functions(base), functions(next), protectedFunctions, true);
  const metadata = base.graph.functions.find(fn => fn.name === change.name);
  const edit = native(run, { op: 'edit', source: baseline, focus: change.name, change: { expected_revision: base.revision, expected_body_hash: metadata.body_hash, replacement: change.replacement } });
  requireReady(edit);
  if (edit.edit?.source !== candidate) throw new Error('Core edit did not exactly reproduce submission');
  return { ...change, compiler: next.compiler };
}

export function gradeResult(report, expected) {
  const actual = report?.result;
  if (report?.status !== 'Complete') return { ok: false, actual: { status: report?.status ?? 'missing', error: message(JSON.stringify(report?.diagnostics ?? report?.error ?? 'incomplete result')) } };
  const valid = actual && Object.keys(actual).sort().join(',') === 'type,value' && actual.type === expected.type && (actual.type === 'Int' ? typeof actual.value === 'string' && /^(0|-[1-9][0-9]*|[1-9][0-9]*)$/.test(actual.value) : actual.type === 'Bool' && typeof actual.value === 'boolean');
  return { ok: Boolean(valid && actual.value === expected.value), actual: actual ?? { error: 'missing typed result' } };
}

function compileTS(source, temp, run) {
  const file = join(temp, 'candidate.ts');
  writeFileSync(file, source, { flag: 'wx' });
  run(process.execPath, [join(ROOT, 'node_modules/typescript/bin/tsc'), '--strict', '--target', 'ES2022', '--module', 'commonjs', '--noEmitOnError', '--outDir', join(temp, 'compiled'), file], '', temp);
  return join(temp, 'compiled/candidate.js');
}

export function evaluateTask({ arm, task, cases, submissions, limits = LIMITS, runner = createRunner(limits) }) {
  const start = performance.now();
  const result = { arm, task: task.id, source_sha256: null, structural_check: false, compile_check: null, cases_executed: 0, cases_passed: 0, cases_total: cases.length, failures: [], command_count: 0, response_bytes: 0, elapsed_ms: 0 };
  const fail = failure => { if (result.failures.length < 20) result.failures.push(failure); };
  let temp;
  try {
    if (!cases.length) throw new Error('No acceptance cases for task');
    const extension = arm === 'wisp' ? 'wisp' : 'ts';
    const candidate = readSource(join(submissions, arm, `${task.id}.${extension}`), limits.source_bytes);
    result.source_sha256 = candidate.hash;
    const baseline = readSource(join(ROOT, 'evaluation/tasks', task.id, `starter.${extension}`), limits.source_bytes).source;
    let reports;
    if (arm === 'wisp') {
      const change = structuralWisp(baseline, candidate.source, task.protected_functions, runner.run);
      result.structural_check = true;
      result.compile_check = true; // Ready analyze is whole-program checking, NOT behavior acceptance.
      result.compiler = change.compiler;
      reports = cases.map(test => {
        try { return native(runner.run, { op: 'call', source: candidate.source, function: test.target ?? task.target, args: test.args }); }
        catch (error) { return { status: 'Error', error: message(error) }; }
      });
    } else {
      structuralTypeScript(baseline, candidate.source, task.protected_functions);
      result.structural_check = true;
      temp = mkdtempSync(join(tmpdir(), 'wisp-acceptance-'));
      result.compile_check = false;
      const compiled = compileTS(candidate.source, temp, runner.run);
      result.compile_check = true;
      const batch = JSON.parse(runner.run(process.execPath, [join(ROOT, 'scripts/evaluation-ts-worker.cjs'), compiled], JSON.stringify({ cases: cases.map(test => ({ target: test.target ?? task.target, args: test.args })) }), temp));
      if (!Array.isArray(batch) || batch.length !== cases.length) throw new Error('Worker must return exactly one report per case');
      reports = batch;
    }
    for (let i = 0; i < cases.length; i++) {
      result.cases_executed++;
      const grade = gradeResult(reports[i], cases[i].expected);
      if (grade.ok) result.cases_passed++;
      else fail({ case: cases[i].name, expected: cases[i].expected, actual: grade.actual });
    }
  } catch (error) {
    fail({ stage: result.compile_check === true ? 'execution' : result.structural_check ? 'compile' : 'source_or_structure', error: message(error) });
  } finally {
    if (temp) rmSync(temp, { recursive: true, force: true });
    Object.assign(result, runner.metrics);
    result.elapsed_ms = performance.now() - start;
  }
  result.passed = result.structural_check && result.compile_check && result.cases_total > 0 && result.cases_passed === result.cases_total;
  return result;
}

export function validateCases(cases, tasks) {
  if (!Array.isArray(cases) || !cases.length) throw new Error('Empty case generator');
  const names = new Set();
  for (const test of cases) {
    const task = tasks.find(task => task.id === test.task);
    if (!task || typeof test.name !== 'string' || names.has(`${test.task}/${test.name}`) || !Array.isArray(test.args) || !gradeResult({ status: 'Complete', result: test.expected }, test.expected).ok || (test.target !== undefined && typeof test.target !== 'string')) throw new Error('Invalid/duplicate acceptance case');
    if (test.expected.type !== task.result_type) throw new Error('Case result type does not match task');
    names.add(`${test.task}/${test.name}`);
  }
  for (const task of tasks) if (!cases.some(test => test.task === task.id)) throw new Error('Task has no cases');
}

export async function main(args = process.argv.slice(2)) {
  let fd;
  try {
    const options = parseArgs(args);
    const start = performance.now();
    const runner = createRunner();
    // Snapshot before creating an in-tree result, which would itself dirty Git.
    const head = runner.run('git', ['rev-parse', 'HEAD']).trim();
    const dirty = runner.run('git', ['status', '--porcelain', '--untracked-files=normal']).length > 0;
    if (options.out) {
      try { fd = openSync(resolve(options.out), 'wx'); }
      catch { throw new UsageError('Output must be a new writable file (no overwrite)'); }
    }
    let report;
    try {
      const frozen = verifyFrozen();
      const protocol = JSON.parse(readFileSync(join(ROOT, 'evaluation/protocol.json'), 'utf8'));
      if (protocol.version !== 1 || !protocol.limits || Object.keys(protocol.limits).length !== Object.keys(LIMITS).length || !Object.entries(LIMITS).every(([key, value]) => protocol.limits[key] === value) || protocol.tasks.map(t => t.id).join(',') !== TASKS.join(',')) throw new Error('Unsupported evaluation protocol');
      const { acceptanceCases } = await import('./evaluation-cases.mjs');
      const cases = acceptanceCases();
      validateCases(cases, protocol.tasks);
      const discovery = native(runner.run, { op: 'capabilities', source: '' });
      requireReady(discovery);
      const results = [];
      for (const arm of options.arm ? [options.arm] : ARMS) for (const task of protocol.tasks.filter(task => !options.task || task.id === options.task)) {
        results.push(evaluateTask({ arm, task, cases: cases.filter(test => test.task === task.id), submissions: resolve(ROOT, options.submissions), limits: protocol.limits }));
      }
      report = { version: 1, git_head: head, dirty, compiler: discovery.compiler, binary_sha256: sha256(readFileSync(join(ROOT, 'target/debug/wisp'))), evaluator_sha256: sha256(readFileSync(fileURLToPath(import.meta.url))), worker_sha256: sha256(readFileSync(join(ROOT, 'scripts/evaluation-ts-worker.cjs'))), platform: process.platform, architecture: process.arch, node_version: process.version, typescript_version: ts.version, case_generator_sha256: frozen.files['scripts/evaluation-cases.mjs'], frozen, measurement_scope: 'Backend commands, stdout+stderr bytes, and monotonic elapsed milliseconds; not agent tokens or latency. cases_executed counts reports graded, including faults/timeouts, not proof of function completion. compile_check:null means that combined checking gate was not completed; it does not diagnose a compile failure. Finite acceptance only; no superiority claim. Trusted submissions only; not a sandbox.', results, passed: results.every(result => result.passed) };
    } catch (error) { report = { version: 1, passed: false, error: message(error) }; }
    report.command_count = runner.metrics.command_count + (report.results ?? []).reduce((n, r) => n + r.command_count, 0);
    report.response_bytes = runner.metrics.response_bytes + (report.results ?? []).reduce((n, r) => n + r.response_bytes, 0);
    report.elapsed_ms = performance.now() - start;
    const json = `${JSON.stringify(report, null, 2)}\n`;
    if (fd !== undefined) writeFileSync(fd, json); else process.stdout.write(json);
    return report.passed ? 0 : 1;
  } catch (error) {
    process.stderr.write(`${message(error)}\n`);
    return error instanceof UsageError ? 2 : 1;
  } finally { if (fd !== undefined) closeSync(fd); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = await main();
