import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import init, { dispatch } from '../web/pkg/wisp.js';

const build = spawnSync('cargo', ['build', '--quiet'], { stdio: 'inherit' });
assert.equal(build.status, 0);
await init({ module_or_path: readFileSync(new URL('../web/pkg/wisp_bg.wasm', import.meta.url)) });
const examples = ['snacks', 'snacks-repaired', 'inventory', 'invoice'].map(name => readFileSync(`examples/${name}.wisp`, 'utf8'));
const recordSources = [
  'record A { s: String } print(new A { s: "é\\n\\\"" });',
  'record A { n: Int } record B { n: Int } print(new A { n: 1 } == new B { n: 1 });',
  'record A { b: B } record B { a: A } print(1);',
  'record A { n: Int } print(new A { n: 1 }.missing);',
  'record A { n: Int } fn loud() -> A { print(1); new A { n: 1 } } probe n in 1..=1 { loud().n == 1 }',
  'record A { n: Int } let a = new A { n: 1 }; probe n in 1..=1 { new A { n: n } == new A { n: n } }',
];
const sources = [...examples, ...recordSources, 'print(-9223372036854775808); print(-7 / 3);', 'print(9223372036854775807 + 1);', 'print(1 / 0);', 'fn recurse(n: Int) -> Int { recurse(n) } print(recurse(0));', 'print("<script>not HTML</script>");', 'print(true || (1 / 0 == 0));', 'probe n in 2..=1 { true }', 'print(@);'];
for (const source of sources) {
  for (const limits of [{}, { fuel: 0 }, { cases: 0 }, { output_bytes: 0 }]) {
    const request = JSON.stringify({ op: 'run', source, limits });
    const native = spawnSync('./target/debug/wisp', ['--json'], { input: request, encoding: 'utf8' });
    assert.equal(native.status, 0, native.stderr);
    assert.deepEqual(JSON.parse(dispatch(request)), JSON.parse(native.stdout));
  }
}
const broken = JSON.parse(dispatch(JSON.stringify({ op: 'run', source: examples[0] })));
const ghost = broken.probes[0].ghost;
assert.equal(ghost.input, '9');
for (const source of examples.slice(0, 2)) {
  const request = JSON.stringify({ op: 'replay', source, ghost });
  const native = spawnSync('./target/debug/wisp', ['--json'], { input: request, encoding: 'utf8' });
  assert.deepEqual(JSON.parse(dispatch(request)), JSON.parse(native.stdout));
}
console.log(`Native/WASM agreement: ${sources.length * 4 + 2} exact report comparisons passed.`);
for (const value of ['4294967296', '18446744073709551615']) {
  const request = `{"op":"run","source":"print(1);","budget":${value},"limits":{"source_bytes":${value},"call_depth":${value},"evaluation_depth":${value},"output_bytes":${value},"allocation_bytes":${value}}}`;
  const native = spawnSync('./target/debug/wisp', ['--json'], { input: request, encoding: 'utf8' });
  const wasm = JSON.parse(dispatch(request));
  assert.equal(wasm.status, 'Complete');
  assert.deepEqual(wasm, JSON.parse(native.stdout));
}
console.log('Native/WASM large transport integer clamping: 2 comparisons passed.');
let artifactComparisons = 0;
function compareArtifact(request) {
  const raw = typeof request === 'string' ? request : JSON.stringify(request);
  const native = spawnSync('./target/debug/wisp', ['--json'], { input: raw, encoding: 'utf8' });
  assert.equal(native.status, 0, native.stderr);
  const wasm = JSON.parse(dispatch(raw));
  assert.deepEqual(wasm, JSON.parse(native.stdout));
  artifactComparisons++; return wasm;
}
const archive = compareArtifact({ op: 'archive', source: examples[0], ghost, limits: broken.limits });
assert.equal(archive.status, 'Ready');
const artifact = archive.artifact;
compareArtifact({ op: 'inspect-artifact', source: '', artifact });
for (const source of [examples[0], examples[1], 'print(@);', examples[0].replace('1..=11', '1..=12')]) {
  compareArtifact({ op: 'replay-artifact', source, artifact });
}
for (const changed of [
  { ...artifact, source: examples[1] },
  { ...artifact, version: 2 },
  { ...artifact, compiler: 'different' },
  { ...artifact, limits: { ...artifact.limits, fuel: 0 } },
  { ...artifact, limits: { ...artifact.limits, call_depth: 4294967296 } },
  { ...artifact, limits: { ...artifact.limits, unknown: 1 } },
  { ...artifact, ghost: { ...ghost, input: '8' } },
]) compareArtifact({ op: 'inspect-artifact', source: '', artifact: changed });
const raw = JSON.stringify({ op: 'inspect-artifact', source: '', artifact });
assert.equal(compareArtifact(raw.replace('"fuel":100000', '"fuel":100000,"fuel":100000')).status, 'Error');
assert.equal(compareArtifact('{"op":"run","source":"","limits":null}').status, 'Error');
console.log(`Portable artifacts native/WASM agreement: ${artifactComparisons} exact comparisons passed.`);
const recordsBroken = 'record Item { quantity: Int } fn bill(item: Item) -> Int { if item.quantity >= 10 { item.quantity * 80 } else { item.quantity * 100 } } probe n in 1..=11 { bill(new Item { quantity: n + 1 }) >= bill(new Item { quantity: n }) }';
const recordsRun = compareArtifact({ op: 'run', source: recordsBroken });
assert.equal(recordsRun.probes[0].failing_input, '9');
const recordsArchive = compareArtifact({ op: 'archive', source: recordsBroken, limits: recordsRun.limits, ghost: recordsRun.probes[0].ghost });
assert.equal(recordsArchive.status, 'Ready');
const recordReplay = compareArtifact({ op: 'replay-artifact', source: recordsBroken.replace('item.quantity * 80', '900 + (item.quantity - 9) * 80'), artifact: recordsArchive.artifact });
assert.equal(recordReplay.replay.status, 'Pass');
const oldCompiler = compareArtifact({ op: 'inspect-artifact', source: '', artifact: { ...recordsArchive.artifact, compiler: 'wisp-0.1.0-semantics-4' } });
assert.equal(oldCompiler.status, 'Error');
assert.equal(oldCompiler.validation.new_execution, false);
for (const [source, fuel, used] of [
  ['record A { first: Int, last: String } new A { first: 0, last: "abcdefghij" } == new A { first: 1, last: "abcdefghij" };', 35, 33],
  ['record A { first: Int, last: String } record B { head: A, tail: String } new B { head: new A { first: 0, last: "abcdefghij" }, tail: "abcdefghij" } == new B { head: new A { first: 1, last: "abcdefghij" }, tail: "abcdefghij" };', 68, 66],
]) {
  const result = compareArtifact({ op: 'run', source, limits: { fuel } });
  assert.equal(result.status, 'Complete'); assert.equal(result.usage.fuel, used);
}
console.log(`Records/artifact integration: 6 additional exact comparisons passed (${sources.length * 4 + 4 + artifactComparisons} total).`);
let invocationComparisons = 0;
function compareCall(request) {
  const raw = typeof request === 'string' ? request : JSON.stringify(request);
  const native = spawnSync('./target/debug/wisp', ['--json'], { input: raw, encoding: 'utf8' });
  assert.equal(native.status, 0, native.stderr);
  const result = JSON.parse(dispatch(raw));
  assert.deepEqual(result, JSON.parse(native.stdout));
  invocationComparisons++; return result;
}
const invocationCases = [
  { op: 'call', source: examples[3], function: 'total', args: [{ quantity: '9', unit_price: '100' }] },
  { op: 'call', source: examples[3], function: 'invoice', args: ['9223372036854775807'] },
  { op: 'call', source: 'fn echo(x: Int) -> Int { x }', function: 'echo', args: ['-9223372036854775808'] },
  { op: 'call', source: 'fn echo(x: String) -> String { print("inside"); x } print(1 / 0); probe n in 1..=1 {false}', function: 'echo', args: ['"); print(99);\n😀'] },
  { op: 'call', source: 'fn echo(x: Bool) -> Bool { !x }', function: 'echo', args: [true] },
  { op: 'call', source: 'fn value() -> Int { 1 }', function: 'value' },
];
for (const request of invocationCases) for (const limits of [{}, { fuel: 0 }, { output_bytes: 0 }, { allocation_bytes: 0 }]) compareCall({ ...request, limits });
for (const args of [['+1'], ['01'], ['-0'], ['9223372036854775808'], [1], [null], [], [false]]) compareCall({ op: 'call', source: 'fn echo(x: Int) -> Int { x }', function: 'echo', args });
compareCall({ op: 'call', source: examples[3], function: 'missing', args: [] });
compareCall({ op: 'call', source: 'print(@);', function: 'missing', args: null });
compareCall('{"op":"call","source":"record A { n: Int } fn echo(a:A)->A{a}","function":"echo","args":[{"n":"1","n":"2"}]}');
const invoiceResult = compareCall({ op: 'call', source: examples[3], function: 'invoice', args: ['9'] });
assert.equal(invoiceResult.output, ''); assert.equal(invoiceResult.probes.length, 0);
assert.equal(invoiceResult.result.value.item.quantity, '9');
console.log(`Typed invocation: ${invocationComparisons} additional native/WASM comparisons (${sources.length * 4 + 4 + artifactComparisons + invocationComparisons} total).`);
const discoveryRequest = '{"op":"capabilities","source":""}';
const discovery = compareCall(discoveryRequest);
const nativeDiscovery = spawnSync('./target/debug/wisp', ['capabilities'], { encoding: 'utf8' });
assert.equal(nativeDiscovery.status, 0);
assert.deepEqual(discovery, JSON.parse(nativeDiscovery.stdout));
assert.deepEqual(discovery, JSON.parse(readFileSync('dist/agent.json', 'utf8')));
assert.ok(Buffer.byteLength(JSON.stringify(discovery)) <= 32768);
for (const example of discovery.capabilities.examples) {
  const result = compareCall(example.request);
  assert.equal(result.status, example.expected_status);
  if (example.expected_result) assert.deepEqual(result.result, example.expected_result);
}
const pinned = JSON.parse(readFileSync('tests/fixtures/semantics5-ghost.json', 'utf8'));
assert.equal(compareCall({ op: 'inspect-artifact', source: '', artifact: pinned }).status, 'Ready');
const contractRequests = [
  { op: 'run', source: 'print(1 / 0);' },
  { op: 'run', source: 'print(-9223372036854775808 / -1);' },
  { op: 'run', source: 'print(1 / 0); probe n in 1..=1 { true }' },
  { op: 'run', source: 'probe n in 1..=1 { true }', limits: { cases: 0 } },
  { op: 'call', source: 'fn f(n:Int)->Int{n}', function: 'f', args: ['01'] },
];
for (const request of contractRequests) compareCall(request);
for (const malformed of ['{"op":"capabilities"}', '{"op":"run","source":null}', '{"op":"run","source":"","source":""}']) compareCall(malformed);
console.log(`Machine contract: native/WASM/static manifest and runnable examples agree (${sources.length * 4 + 4 + artifactComparisons + invocationComparisons} total native/WASM comparisons).`);
let contextComparisons = 0;
function compareContext(request) {
  const raw = typeof request === 'string' ? request : JSON.stringify(request);
  const native = spawnSync('./target/debug/wisp', ['--json'], { input: raw, encoding: 'utf8' });
  assert.equal(native.status, 0, native.stderr);
  const wasm = dispatch(raw);
  assert.equal(wasm, native.stdout.trimEnd());
  contextComparisons++; const result = JSON.parse(wasm);
  if (result.context) {
    assert.equal(result.new_execution, false); assert.equal(result.output, ''); assert.deepEqual(result.probes, []); assert.equal(result.usage, undefined);
    const c = result.context; const textBytes = Buffer.from(c.text);
    assert.equal(c.used_bytes, textBytes.length); assert.ok(c.used_bytes <= c.budget_bytes);
    assert.equal(c.used_bytes, c.ledger.reduce((sum, entry) => sum + entry.included_bytes, 0));
    assert.equal(c.required_bytes, c.ledger.filter(entry => entry.eligible).reduce((sum, entry) => sum + entry.chunk_bytes, 0));
    const source = Buffer.from((typeof request === 'string' ? JSON.parse(request) : request).source);
    let stopped = false;
    for (const entry of c.ledger) {
      const slice = source.subarray(entry.span.start, entry.span.end);
      assert.equal(entry.source_hash, createHash('sha256').update(slice).digest('hex'));
      assert.equal(entry.chunk_bytes, slice.length + 2);
      if (entry.disposition === 'included') {
        assert.equal(stopped, false);
        assert.deepEqual(textBytes.subarray(entry.source_text_range.start, entry.source_text_range.end), slice);
        assert.equal(entry.included_bytes, entry.chunk_bytes);
        assert.deepEqual(textBytes.subarray(entry.text_range.start, entry.text_range.end), Buffer.concat([slice, Buffer.from('\n\n')]));
      } else {
        assert.equal(entry.included_bytes, 0); assert.equal(entry.text_range, null);
        if (entry.eligible) stopped = true;
      }
    }
  }
  return result;
}
const contextSources = [examples[0], examples[3], 'print(1 / 0); probe n in 1..=1 { true }', 'fn f(n:Int)->Int{f(n)} probe n in 1..=1 {f(n)==n}', 'fn label()->String{"é😀<script>"} probe n in 1..=1 {label()==label()}'];
for (const source of contextSources) for (const budget of [0, 1, 50, 4096, 65536]) compareContext({ op: 'context', source, focus: 'probe:0', budget });
const fullContext = compareContext({ op: 'context', source: examples[0] });
const exactBudget = fullContext.context.required_bytes;
assert.equal(compareContext({ op: 'context', source: examples[0], budget: exactBudget }).context.overflow, false);
assert.equal(compareContext({ op: 'context', source: examples[0], budget: exactBudget - 1 }).context.overflow, true);
for (const focus of ['', 'probe:00', 'probe:-1', 'probe:18446744073709551616', 'function:bill', 'probe:1', null]) compareContext({ op: 'context', source: examples[0], focus });
compareContext('{"op":"context","source":"probe n in 1..=1 {true}","budget":18446744073709551615}');
compareContext({ op: 'context', source: 'fn f()->Int{true}', focus: 'invalid' });
console.log(`Probe context: ${contextComparisons} exact serialized-byte comparisons with independently reconciled source hashes/ranges/ledger (${sources.length * 4 + 4 + artifactComparisons + invocationComparisons + contextComparisons} total).`);
let editComparisons = 0;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function compareEdit(request) {
  const raw = typeof request === 'string' ? request : JSON.stringify(request);
  const native = spawnSync('./target/debug/wisp', ['--json'], { input: raw, encoding: 'utf8' });
  assert.equal(native.status, 0, native.stderr);
  const wasm = dispatch(raw); assert.equal(wasm, native.stdout.trimEnd()); editComparisons++;
  const report = JSON.parse(wasm); const edit = report.edit;
  if (edit?.state === 'prepared') {
    const req = typeof request === 'string' ? JSON.parse(request) : request;
    const base = Buffer.from(req.source); const candidate = Buffer.from(edit.source); const replacement = Buffer.from(req.change.replacement);
    assert.equal(report.status, 'Ready'); assert.equal(report.new_execution, false); assert.equal(report.usage, undefined); assert.deepEqual(report.probes, []);
    assert.equal(report.revision, sha(base)); assert.equal(edit.candidate_revision, sha(candidate));
    assert.equal(edit.base_body_hash, sha(base.subarray(edit.base_body_span.start, edit.base_body_span.end)));
    assert.equal(edit.candidate_body_hash, sha(candidate.subarray(edit.candidate_body_span.start, edit.candidate_body_span.end)));
    assert.deepEqual(candidate, Buffer.concat([base.subarray(0, edit.base_body_span.start), replacement, base.subarray(edit.base_body_span.end)]));
    assert.deepEqual(candidate.subarray(edit.insertion_range.start, edit.insertion_range.end), replacement);
    for (const field of ['checked', 'prefix', 'suffix', 'signature', 'records', 'other_functions', 'top_level_statements']) assert.equal(edit.preservation[field], true);
    for (const probe of edit.preservation.probes) { assert.equal(probe.text_preserved, true); assert.equal(probe.domain_preserved, true); }
  } else if (edit) { assert.equal(edit.source, undefined); assert.notEqual(edit.state, 'prepared'); }
  return report;
}
for (const source of [examples[0], 'fn label()->String{"é😀"} fn f(n:Int)->Int{n} probe n in 1..=1 { f(n)==n }', 'fn f(n:Int)->Int{n}\r\nprobe n in 1..=1 {f(n)==n}']) {
  const facts = JSON.parse(dispatch(JSON.stringify({ op: 'analyze', source })));
  const fn = facts.graph.functions.find(fn => fn.name !== 'label');
  const req = { op: 'edit', source, focus: fn.name, change: { expected_revision: facts.revision, expected_body_hash: fn.body_hash, replacement: '' } };
  for (const replacement of [fn.name === 'bill' ? '{ snacks * 100 }' : '{ n + 0 }', ' \n{ 1 / 0 }\n ', '{ "wrong type" }', '{ 0 } // swallow', '/* outside */ { 0 }', '{ 0 } fn injected()->Int{1}', '{ /* é😀 */ 0 }']) compareEdit({ ...req, change: { ...req.change, replacement } });
  compareEdit({ ...req, change: { ...req.change, expected_revision: '0'.repeat(64), replacement: '{0}' } });
  compareEdit({ ...req, change: { ...req.change, expected_body_hash: '0'.repeat(64), replacement: '{0}' } });
  compareEdit({ ...req, focus: 'missing', change: { ...req.change, replacement: '{0}' } });
}
for (const op of ['run', 'analyze', 'call', 'capabilities', 'context', 'focus', 'edit']) compareEdit({ op, source: '', change: null });
assert.deepEqual(JSON.parse(dispatch(JSON.stringify({ op: 'context', source: examples[0], focus: 'probe:0', budget: 4096 }))), JSON.parse(readFileSync('tests/fixtures/semantics5-context.json', 'utf8')));
console.log(`Guarded edits: ${editComparisons} exact serialized-byte comparisons with independent candidate/source/body hash and splice audits.`);
let reviewComparisons = 0;
function compareReview(request, retainedSuite) {
  const raw = typeof request === 'string' ? request : JSON.stringify(request);
  const native = spawnSync('./target/debug/wisp', ['--json'], { input: raw, encoding: 'utf8' });
  assert.equal(native.status, 0, native.stderr);
  const wasm = dispatch(raw); assert.equal(wasm, native.stdout.trimEnd()); reviewComparisons++;
  const r = JSON.parse(wasm), q = typeof request === 'string' ? JSON.parse(request) : request, review = r.review;
  if (!review) return r;
  assert.equal(review.approval, 'not_granted'); assert.equal(review.contract_version, 1);
  assert.deepEqual(r.probes, []); assert.equal(r.output, ''); assert.equal(r.usage, undefined);
  if (typeof q.source === 'string') assert.equal(review.baseline_revision, sha(Buffer.from(q.source)));
  if (typeof q.candidate === 'string') assert.equal(review.candidate_revision, sha(Buffer.from(q.candidate)));
  if (retainedSuite !== undefined || typeof request !== 'string') assert.equal(review.suite_hash, sha(Buffer.from(retainedSuite ?? JSON.stringify(q.suite))));
  if (review.phase === 'preflight') { assert.deepEqual(review.cases, []); assert.equal(review.new_execution, false); return r; }
  const count = { changed: 0, unchanged: 0, faulted: 0, unknown: 0, expectation_pass: 0, expectation_fail: 0, expectation_error: 0, expectation_unknown: 0 };
  let errors = false, unknown = false, mismatch = false;
  assert.equal(review.cases.length, q.suite.cases.length);
  for (const [i, row] of review.cases.entries()) {
    const b = row.before, a = row.after;
    assert.equal(row.id, q.suite.cases[i].id); assert.equal(row.index, i);
    assert.equal(b.document, 'baseline'); assert.equal(a.document, 'candidate');
    assert.equal(b.new_execution, true); assert.equal(a.new_execution, true);
    assert.equal(b.graph, undefined); assert.equal(a.graph, undefined);
    const incomplete = b.status === 'Unknown' || a.status === 'Unknown';
    const comparison = incomplete ? 'Unknown' : a.status === 'Error' ? 'Faulted' : b.status === 'Error' || !isDeepStrictEqual(b.result, a.result) || b.output !== a.output ? 'Changed' : 'Unchanged';
    const expectation = a.status === 'Error' ? 'Error' : a.status === 'Unknown' ? 'Unknown' : isDeepStrictEqual(a.result, row.expected.result) && a.output === row.expected.output ? 'Pass' : 'Fail';
    assert.equal(row.comparison, comparison); assert.equal(row.expectation, expectation);
    count[comparison.toLowerCase()]++; count[`expectation_${expectation.toLowerCase()}`]++;
    errors ||= a.status === 'Error'; unknown ||= incomplete; mismatch ||= expectation === 'Fail';
  }
  for (const [key, value] of Object.entries(count)) assert.equal(review.summary[key], value);
  assert.equal(review.summary.attempted_invocations, review.cases.length * 2);
  assert.equal(r.status, errors ? 'Error' : unknown ? 'Unknown' : mismatch ? 'Fail' : 'Pass');
  return r;
}
const reviewSuite = { version: 1, target: 'f', cases: [{ id: 'one', args: ['2'], expect: { result: { type: 'Int', value: '2' }, output: '' } }] };
const reviewSources = ['fn f(x:Int)->Int{x}', 'fn f(x:Int)->Int{x/0}', 'fn f(x:Int)->Int{f(x)}'];
const reviewRequest = (source = reviewSources[0], candidate = source, suite = reviewSuite) => ({ op: 'review', source, candidate, suite });
for (const source of reviewSources) for (const candidate of reviewSources) compareReview(reviewRequest(source, candidate));
for (const limits of [{ fuel: 0 }, { fuel: 10, cases: 0 }, { call_depth: 0 }, { output_bytes: 0 }]) compareReview({ ...reviewRequest(), limits });
for (const n of [0, 1, 16, 17]) compareReview(reviewRequest(undefined, undefined, { ...reviewSuite, cases: Array.from({ length: n }, (_, i) => ({ ...reviewSuite.cases[0], id: `c${i}` })) }));
const beforePolicy = readFileSync('examples/policies/reservations-before.wisp', 'utf8'), afterPolicy = readFileSync('examples/policies/reservations-after.wisp', 'utf8'), policySuite = JSON.parse(readFileSync('examples/policies/cases.json', 'utf8'));
for (const [source, candidate] of [[beforePolicy, afterPolicy], [afterPolicy, afterPolicy], [beforePolicy, beforePolicy]]) compareReview(reviewRequest(source, candidate, policySuite));
for (const value of ['-9223372036854775808', '9223372036854775807', '-0', '01', 2]) compareReview(reviewRequest(undefined, undefined, { ...reviewSuite, cases: [{ ...reviewSuite.cases[0], args: [value], expect: { result: { type: 'Int', value }, output: '' } }] }));
for (const field of ['args', 'expect']) {
  const suite = structuredClone(reviewSuite); suite.cases.push({ ...structuredClone(suite.cases[0]), id: 'invalid-last' });
  if (field === 'args') suite.cases[1].args = [2]; else suite.cases[1].expect.result.value = 2;
  compareReview(reviewRequest(reviewSources[1], reviewSources[0], suite));
}
for (const [source, candidate] of [['fn f(x:Int)->Int{bad}', reviewSources[0]], [reviewSources[0], '\n\nfn f(x:Int)->Int{bad}'], [reviewSources[0], 'fn f(y:Int)->Int{y}']]) compareReview(reviewRequest(source, candidate));
const suiteRaw = JSON.stringify(reviewSuite), rawRequest = suite => `{"op":"review","source":${JSON.stringify(reviewSources[0])},"candidate":${JSON.stringify(reviewSources[0])},"suite":${suite}}`;
for (const suite of ['null', '{}', '[]', suiteRaw.replace('"version":1', '"version":1,"ver\\u0073ion":1')]) compareReview(rawRequest(suite), suite);
for (const bytes of [65536, 65537]) { const suite = '{' + ' '.repeat(bytes - suiteRaw.length) + suiteRaw.slice(1); compareReview(rawRequest(suite), suite); }
const spacedArgs = '[ "2" ]', spacedSuite = suiteRaw.replace('["2"]', spacedArgs);
const spacedReview = compareReview(rawRequest(spacedSuite), spacedSuite);
assert.equal(spacedReview.review.cases[0].after.invocation.execution_key, JSON.parse(dispatch(`{"op":"call","source":${JSON.stringify(reviewSources[0])},"function":"f","args":${spacedArgs}}`)).invocation.execution_key);
for (const op of ['call', 'capabilities', 'run', 'edit', 'context']) for (const field of ['candidate', 'suite']) {
  const result = compareReview({ op, source: '', [field]: null }); assert.equal(result.diagnostics[0].code, 'E_REQUEST_INVALID');
}
console.log(`Policy review: ${reviewComparisons} exact serialized-byte comparisons with independent revisions/suite hashes/status and summary reconciliation (${sources.length * 4 + 4 + artifactComparisons + invocationComparisons + contextComparisons + editComparisons + reviewComparisons} total).`);
for (const op of ['run', 'call', 'capabilities', 'edit', 'analyze', 'review']) {
  const result = compareReview({ op, source: 'print(7);', function: null });
  assert.equal(result.diagnostics[0].code, 'E_REQUEST_INVALID');
  assert.equal(result.output, ''); assert.equal(result.revision, ''); assert.equal(result.usage, undefined);
}
console.log(`Legacy null-function rejection: 6 additional non-executing native/WASM comparisons (${sources.length * 4 + 4 + artifactComparisons + invocationComparisons + contextComparisons + editComparisons + reviewComparisons} total).`);
const objectArtifact = JSON.parse(readFileSync('tests/fixtures/semantics5-ghost.json', 'utf8'));
const objectGhost = objectArtifact.ghost;
const ghostArray = ['revision','predicate_key','dependency_key','input','witness_id'].map(key => objectGhost[key]);
const limitsArray = [65536,100000,32,128,8192,1048576,1000];
const objectInputs = [
  [['run','print(7);',null,null,null,null], 'E_REQUEST_INVALID'],
  [{op:'run',source:'print(7);',limits:limitsArray}, 'E_REQUEST_INVALID'],
  [{op:'replay',source:objectArtifact.source,ghost:ghostArray}, 'E_REQUEST_INVALID'],
  [{op:'inspect-artifact',source:'',artifact:['format','version','compiler','source','limits','ghost'].map(key=>objectArtifact[key])}, 'E_REQUEST_INVALID'],
  [{op:'inspect-artifact',source:'',artifact:{...objectArtifact,ghost:ghostArray}}, 'E_REQUEST_INVALID'],
  [{op:'inspect-artifact',source:'',artifact:{...objectArtifact,limits:limitsArray}}, 'E_ARTIFACT_INVALID'],
  [{op:'edit',source:reviewSources[0],focus:'f',change:['0'.repeat(64),'0'.repeat(64),'{x+1}']}, 'E_EDIT_REQUEST'],
];
const objectCase = structuredClone(reviewSuite.cases[0]);
const objectSuites = [[1,'f',[objectCase]], [1,'f',[['one',['2'],[['Int','2'],'']]]]];
for (const path of ['case','expect','result']) {
  const suite = structuredClone(reviewSuite);
  if(path==='case') suite.cases[0]=['one',['2'],objectCase.expect];
  else if(path==='expect') suite.cases[0].expect=[objectCase.expect.result,''];
  else suite.cases[0].expect.result=['Int','2'];
  objectSuites.push(suite);
}
for(const suite of objectSuites) objectInputs.push([reviewRequest(undefined,undefined,suite),'E_REVIEW_REQUEST']);
for(const [request,code] of objectInputs) {
  const report=compareReview(request);assert.equal(report.status,'Error');assert.equal(report.diagnostics[0].code,code);
  assert.equal(report.output,'');assert.equal(report.usage,undefined);
  if(report.review){assert.equal(report.review.new_execution,false);assert.deepEqual(report.review.cases,[]);}
}
console.log(`Object-only protocol: ${objectInputs.length} additional non-executing native/WASM comparisons (${sources.length * 4 + 4 + artifactComparisons + invocationComparisons + contextComparisons + editComparisons + reviewComparisons} total).`);
