import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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
