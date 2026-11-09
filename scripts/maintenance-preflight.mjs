import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { createRunner, sha256, ROOT } from './evaluate.mjs';
import { HOME, native, executeCases, validResult, gradeCandidate, studyCases, tsContext } from './maintenance.mjs';
import { fixture } from '../evaluation/maintenance/private/fixtures.mjs';
import { mutations as mutationSources } from '../evaluation/maintenance/private/mutations.mjs';
// Explicit init creates authored source fixtures exclusively; never overwrites.
export function initialize() {
  for(const dir of ['public','historical','private'])mkdirSync(join(HOME,dir),{recursive:true});
  for(const arm of ['wisp','typescript'])for(const variant of ['baseline','historical','reference','packing','expiry']) {
    const ext=arm==='wisp'?'wisp':'ts';
    const path=join(HOME,variant==='baseline'?'public':variant==='historical'?'historical':'private',variant==='baseline'?`starter.${ext}`:`${variant}.${ext}`);
    writeFileSync(path,fixture(arm,variant),{flag:'wx'});
  }
  writeFileSync(join(HOME,'public/public-regressions.json'),JSON.stringify(studyCases().slice(0,7),null,2)+'\n',{flag:'wx'});
  writeFileSync(join(HOME,'private/cases.json'),JSON.stringify(studyCases(),null,2)+'\n',{flag:'wx'});
}
export function preflight(out) {
  if(!out || existsSync(out))throw Error('Pass a NEW report path');
  const runner=createRunner();const run=runner.run;
  const cases=studyCases();assert.equal(cases.length,547);
  assert.deepEqual(JSON.parse(readFileSync(join(HOME,'private/cases.json'),'utf8')),cases);
  const load=(dir,name)=>readFileSync(join(HOME,dir,name),'utf8');
  const historical=load('historical','historical.wisp'),baseline=load('public','starter.wisp');
  const historyRun=native(run,{op:'run',source:historical});
  assert.equal(historyRun.probes[0].status,'Fail');
  const archive=native(run,{op:'archive',source:historical,ghost:historyRun.probes[0].ghost,limits:historyRun.limits});
  assert.equal(archive.status,'Ready');
  const artifactPath=join(HOME,'historical/wisp-artifact.json');
  if(!existsSync(artifactPath))writeFileSync(artifactPath,JSON.stringify(archive.artifact,null,2)+'\n',{flag:'wx'});
  else assert.deepEqual(JSON.parse(readFileSync(artifactPath,'utf8')),archive.artifact);
  const inspection=native(run,{op:'inspect-artifact',source:'',artifact:archive.artifact});assert.equal(inspection.status,'Ready');
  const replay=native(run,{op:'replay-artifact',source:baseline,artifact:archive.artifact});
  const fresh=native(run,{op:'run',source:baseline});
  assert.equal(historyRun.probes[0].failing_input,'0');
  assert.equal(replay.replay.status,'Pass');
  assert.equal(fresh.probes[0].failing_input,'1');
  assert.equal(fresh.probes[1].status,'Clear');
  assert.equal(fresh.probes[1].completed_cases,3);
  const references={},mutations={};
  for(const arm of ['wisp','typescript']) {
    const ext=arm==='wisp'?'wisp':'ts';
    references[arm]=gradeCandidate(arm,join(HOME,'private',`reference.${ext}`));assert.equal(references[arm].passed,true,JSON.stringify(references[arm]));
    mutations[arm]={};
    for(const variant of ['baseline','historical','packing','expiry']) {
      const source=load(variant==='baseline'?'public':variant==='historical'?'historical':'private',variant==='baseline'?`starter.${ext}`:`${variant}.${ext}`);
      const reports=executeCases(arm,source,cases,runner);
      const passed=reports.filter((r,i)=>validResult(r,cases[i].expected)).length;
      assert(passed<547);mutations[arm][variant]={passed,total:547};
    }
    if(arm==='wisp') {
      const checked=native(run,{op:'run',source:load('private','reference.wisp')});
      assert.deepEqual(checked.probes.map(p=>p.status),['Clear','Clear']);
      references.wisp.probes=checked;
    }
    for(const [name,source] of Object.entries(mutationSources(arm))) {
      const path=join(HOME,'private',`mutation-${name}.${ext}`);
      if(!existsSync(path))writeFileSync(path,source,{flag:'wx'});else assert.equal(readFileSync(path,'utf8'),source);
      const grade=gradeCandidate(arm,path);assert.equal(grade.passed,false,`${arm}/${name}`);
      mutations[arm][name]=grade;
    }
  }
  const oldSource=load('historical','historical.ts');
  const historicalReport=executeCases('typescript',oldSource,[cases[0]],runner)[0];
  assert.deepEqual(historicalReport.result.value,{accepted:false,added:'2',free_after:'1'});
  const currentReport=executeCases('typescript',load('public','starter.ts'),[cases[0]],runner)[0];assert(validResult(currentReport,cases[0].expected));
  const snapshot={version:1,historical_source:oldSource,historical_source_sha256:sha256(oldSource),case:cases[0],historical_report:historicalReport,current_baseline_replay:currentReport,versions:{node:process.version,typescript:ts.version},note:'Actual strict tsc + Node reproduction. Historical source is not current repair target.'};
  const snapshotPath=join(HOME,'historical/typescript-snapshot.json');
  if(!existsSync(snapshotPath))writeFileSync(snapshotPath,JSON.stringify(snapshot,null,2)+'\n',{flag:'wx'});else assert.deepEqual(JSON.parse(readFileSync(snapshotPath,'utf8')),snapshot);
  const context=tsContext(join(HOME,'public/starter.ts'),'sample_ok');
  assert(context.closure.includes('reserve'));assert(!context.closure.includes('display_capacity'));assert.equal(context.unresolved_calls.length,0);
  const tooling=Object.fromEntries([...readdirSync(join(ROOT,'scripts')).filter(n=>n.startsWith('maintenance') && /\.(mjs|cjs)$/.test(n)).map(n=>join('scripts',n)),...['fixtures.mjs','cases.mjs','mutations.mjs'].map(n=>join('evaluation/maintenance/private',n))].map(path=>[path,sha256(readFileSync(join(ROOT,path)))]));
  const report={phase:'PRETRIAL',note:'Infrastructure and authored-fixture acceptance only; no agent trials, production claim, superiority inference or proof. Metrics below cover the shared preflight runner only; each reference/mutation grade separately reports its own metrics. No peak RSS is exposed by spawnSync. Native reference probe usage is retained.',versions:{node:process.version,typescript:ts.version,compiler:historyRun.compiler},tooling,binary_sha256:sha256(readFileSync(join(ROOT,'target/debug/wisp'))),sources:Object.fromEntries(['wisp','typescript'].map(a=>{const ext=a==='wisp'?'wisp':'ts',source=load('public',`starter.${ext}`);return[a,{sha256:sha256(source),bytes:Buffer.byteLength(source)}];})),historical_run:historyRun,archive_report:archive,inspection,replay,fresh,references,mutations,typescript_snapshot:snapshot,context,metrics:runner.metrics};
  writeFileSync(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});return report;
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  if(process.argv[2]==='--init' && process.argv.length===3)initialize();
  else if(process.argv[2]==='--out' && process.argv.length===4)preflight(resolve(process.argv[3]));
  else throw Error('Usage: --init (once) OR --out NEW_REPORT');
}
