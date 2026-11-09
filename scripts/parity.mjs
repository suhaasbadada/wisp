import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
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
console.log(`Record artifact integration: 4 additional exact comparisons passed (${sources.length * 4 + 4 + artifactComparisons} total).`);
