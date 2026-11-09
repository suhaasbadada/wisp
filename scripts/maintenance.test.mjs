import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fixture } from '../evaluation/maintenance/private/fixtures.mjs';
import { oracle } from '../evaluation/maintenance/private/cases.mjs';
import { createRunner, LIMITS } from './evaluate.mjs';
import { structure, validResult, executeCases, sourceFile, tsContext, studyCases, gradeCandidate, HOME } from './maintenance.mjs';
const temporary = fn => {const dir=mkdtempSync(join(tmpdir(),'maintenance-test-'));try{return fn(dir);}finally{rmSync(dir,{recursive:true,force:true});}};
test('independent placement oracle, public expectations, 547 invocations',()=>{
  const cases=studyCases();assert.equal(cases.length,547);
  assert.deepEqual(cases.slice(0,7),JSON.parse(readFileSync(join(HOME,'public/public-regressions.json'),'utf8')));
  assert.throws(()=>oracle({staged:1n,request:0n,hold_slots:0n,hold_until:0n},{capacity:0n,occupied:0n,reserved:0n,pack:1n,now:0n}));
  assert.equal(cases[1].expected.value.added,'0');assert.equal(cases[2].expected.value.accepted,false);
});
for(const arm of ['typescript','wisp'])test(`${arm}: exact parsed 0/1/2/3-body guard, immutable samples and outer bytes`,()=>{
  const base=fixture(arm),one=fixture(arm,'packing'),two=fixture(arm,'reference');
  assert.throws(()=>structure(arm,base,base));
  assert.equal(structure(arm,base,one).length,1);
  assert.equal(structure(arm,base,two).length,2);
  const third=two.replace('needed <= available','needed < available');
  assert.throws(()=>structure(arm,base,third));
  assert.throws(()=>structure(arm,base,' '+two));
  assert.throws(()=>structure(arm,base,two.replace('sample_ok(n:', 'sample_ok(m:')));
  if(arm==='wisp')assert.throws(()=>structure(arm,base,two.replace('sample_ok(n)', 'sample_ok(n + 0)')));
  assert.throws(()=>structure(arm,base,two.replace('sample_expected(n)',arm==='wisp'?'sample_expected(n + 0)':'sample_expected(n + 0n)')));
  assert.throws(()=>structure(arm,base,base.replace('n == 0','n == 1').replace('n === 0n','n === 1n')));
  assert.throws(()=>structure(arm,base,two.replace('ceil_slots(units:', 'ceil_slots(other:')));
});
test('UTF-16 TS offsets and UTF-8 Wisp offsets preserve emoji/trivia',()=>{
  for(const arm of ['typescript','wisp']) {
    const base='// 🚚 é\n'+fixture(arm),next='// 🚚 é\n'+fixture(arm,'reference');
    assert.equal(structure(arm,base,next).length,2);
  }
});
test('Decision requires Complete, exact keys, Bool and canonical signed i64 strings',()=>{
  const expected=studyCases()[0].expected,report={status:'Complete',result:expected};assert(validResult(report,expected));
  for(const status of ['Unknown','Error','Ready','Pass'])assert(!validResult({...report,status},expected));
  for(const value of [{...expected.value,extra:0},{...expected.value,added:1},{...expected.value,added:'01'},{...expected.value,accepted:'true'},{...expected.value,added:String(2n**63n)}])assert(!validResult({status:'Complete',result:{type:'Decision',value}},expected));
});
test('checker context follows real calls, dead branches, cycles; excludes dashboard; reports unresolved and byte budget',()=>temporary(dir=>{
  const path=join(dir,'case.ts');
  writeFileSync(path,'// 🚚\ninterface R { value: bigint }\nfunction leaf(x: R): bigint { return x.value; }\nfunction loop(x: R): bigint { return false ? loop(x) : leaf(x); }\nfunction focus(x: R): bigint { return false ? loop(x) : missing(x); }\nfunction decoy(x: R): bigint { return leaf(x); }\n');
  const context=tsContext(path,'focus');
  assert.deepEqual(context.closure,['focus','loop','leaf']);assert.deepEqual(context.scope_omissions,['decoy']);
  assert.equal(context.unresolved_calls.length,1);assert.equal(context.unresolved_calls[0].text,'missing');
  assert(context.chunks.every(c=>c.included));assert(context.chunks[0].span.start_byte>context.chunks[0].span.start_utf16);
  assert.equal(tsContext(path,'focus',0).text,'');assert(tsContext(path,'focus',0).chunks.every(c=>!c.included));
  assert.throws(()=>tsContext(path,'absent'));assert.throws(()=>tsContext(path,'focus',65537));
}));
test('strict tsc, no host escape/import, batch typed records and bounded errors',()=>{
  const cases=studyCases().slice(0,7);
  for(const arm of ['typescript','wisp']) {
    const reports=executeCases(arm,fixture(arm,'reference'),cases);
    assert(reports.every((r,i)=>validResult(r,cases[i].expected)));
  }
  assert.throws(()=>executeCases('typescript',fixture('typescript').replace('return units == 0n','console.log("bad"); return units == 0n'),cases));
  assert.throws(()=>executeCases('typescript',fixture('typescript')+'\nimport fs from "node:fs";',cases));
  assert.throws(()=>executeCases('typescript',fixture('typescript').replace('units: bigint','units: number'),cases));
});
test('source cap, fatal UTF-8, runtime timeout, output cap, grader never false-passes',()=>temporary(dir=>{
  const path=join(dir,'candidate.ts');writeFileSync(path,Buffer.alloc(65537));assert.throws(()=>sourceFile(path));
  writeFileSync(path,Buffer.from([255]));assert.throws(()=>sourceFile(path));
  assert.equal(gradeCandidate('typescript',path).passed,false);
  assert.throws(()=>createRunner({...LIMITS,command_timeout_ms:100}).run(process.execPath,['-e','while(true){}']));
  assert.throws(()=>createRunner({...LIMITS,command_output_bytes:100}).run(process.execPath,['-e','process.stdout.write("x".repeat(100000))']));
}));
test('actual worker errors stay errors, not Decision acceptance',()=>{
  const source=fixture('typescript','reference').replace('return decision(added_slots(order, depot), free_slots(order, depot));','throw "intentional";');
  const report=executeCases('typescript',source,[studyCases()[0]])[0];assert.equal(report.status,'Error');assert(!validResult(report,studyCases()[0].expected));
});
test('a correct alternative single-body target is eligible (no hardcoded answer targets)',()=>temporary(dir=>{
  for(const arm of ['wisp','typescript']) {
    const w=arm==='wisp';
    const expression=`decision(ceil_slots(order.staged + order.request, depot.pack) - staged_slots(order, depot), depot.capacity - depot.occupied - depot.reserved + ${w?'if hold_live(order, depot) { order.hold_slots } else { 0 }':'(hold_live(order, depot) ? order.hold_slots : 0n)'})`;
    const source=fixture(arm).replace('decision(added_slots(order, depot), free_slots(order, depot))',expression);
    const path=join(dir,w?'alternate.wisp':'alternate.ts');writeFileSync(path,source);
    const grade=gradeCandidate(arm,path);assert.equal(grade.passed,true,JSON.stringify(grade));assert.deepEqual(grade.changed_functions,['reserve']);
  }
}));
test('historical sources differ by exactly one authored expression and archive source remains exact',()=>{
  for(const arm of ['wisp','typescript']) {
    const ext=arm==='wisp'?'wisp':'ts';
    const base=readFileSync(join(HOME,'public',`starter.${ext}`),'utf8');
    const historical=readFileSync(join(HOME,'historical',`historical.${ext}`),'utf8');
    assert.equal(base,fixture(arm));assert.equal(historical,fixture(arm,'historical'));
    assert.deepEqual(structure(arm,base,historical).map(c=>c.name),['added_slots']);
  }
});
