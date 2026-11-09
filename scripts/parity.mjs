import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import init, { dispatch } from '../web/pkg/wisp.js';

const build = spawnSync('cargo', ['build', '--quiet'], { stdio: 'inherit' });
assert.equal(build.status, 0);
await init({ module_or_path: readFileSync(new URL('../web/pkg/wisp_bg.wasm', import.meta.url)) });
const examples = ['snacks', 'snacks-repaired', 'inventory'].map(name => readFileSync(`examples/${name}.wisp`, 'utf8'));
const sources = [...examples, 'print(-9223372036854775808); print(-7 / 3);', 'print(9223372036854775807 + 1);', 'print(1 / 0);', 'fn recurse(n: Int) -> Int { recurse(n) } print(recurse(0));', 'print("<script>not HTML</script>");', 'print(true || (1 / 0 == 0));', 'probe n in 2..=1 { true }', 'print(@);'];
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
