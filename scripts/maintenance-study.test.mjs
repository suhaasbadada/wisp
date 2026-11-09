import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, symlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { ROOT, sha256 } from './evaluate.mjs';
import { REQUIRED_FROZEN, verifyStudyFrozen, trialOrder, assessDecision, verifySubmissionLock, runStudy, main } from './maintenance-study.mjs';

const BASE='evaluation/maintenance';
const PROTOCOL=JSON.parse(readFileSync(join(ROOT,BASE,'protocol.json'),'utf8'));
const DECISION={historical_input:'0',historical_failure_reproduced:true,current_old_input_passed:true,old_replay_is_full_acceptance:false,fresh_public_suite_passed:true,explanation:'Historical input replay is narrower than fresh suite acceptance.'};
function temporary(fn) {const root=mkdtempSync(join(tmpdir(),'maintenance-study-test-'));try{return fn(root);}finally{rmSync(root,{recursive:true,force:true});}}
function put(root,path,value) {mkdirSync(dirname(join(root,path)),{recursive:true});writeFileSync(join(root,path),typeof value==='string'?value:JSON.stringify(value));}
function setup(root) {
  const files={};
  for(const path of REQUIRED_FROZEN) {put(root,path,path===`${BASE}/protocol.json`?PROTOCOL:`author fixture: ${path}\n`);files[path]=sha256(readFileSync(join(root,path)));}
  put(root,`${BASE}/frozen.json`,{version:1,files});
  put(root,'target/debug/wisp','unit-test binary placeholder; never executed');
  const order=trialOrder(PROTOCOL);
  const trials=order.map(id=>{
    const arm=id.startsWith('wisp')?'wisp':'typescript';
    const paths={source:`${BASE}/submissions/${id}/candidate.${arm==='wisp'?'wisp':'ts'}`,decision:`${BASE}/submissions/${id}/decision.json`,evidence:`${BASE}/submissions/${id}/evidence.md`};
    const trial={id,arm,...paths,configured_agent:'bob',verified_model:null,token_usage:null,dispatch_window_ms:null};
    for(const [key,path] of Object.entries(paths)) {put(root,path,key==='decision'?DECISION:`unit fixture ${id} ${key}`);trial[`${key}_sha256`]=sha256(readFileSync(join(root,path)));}
    return trial;
  });
  put(root,`${BASE}/submission-lock.json`,{version:1,order,trials});
  return {version:1,order,trials};
}
function runner(observe=()=>{}) {return {metrics:{command_count:0,response_bytes:0,elapsed_ms:0},run(command,args,input,cwd){observe(command,args,input,cwd);if(args[0]==='rev-parse')return 'f'.repeat(40)+'\n';if(args[0]==='status')return '?? new-study-files\n';return JSON.stringify({status:'Ready',compiler:'unit-test-compiler'});}};}
function goodGrade(arm,path) {return {arm,path,source_sha256:sha256(readFileSync(path)),structural_check:true,compile_check:true,cases_total:547,cases_executed:547,cases_passed:547,failures:[],passed:true};}
function writeLock(root,lock) {put(root,`${BASE}/submission-lock.json`,lock);}
function relock(root,lock,id,key,value) {const trial=lock.trials.find(t=>t.id===id);put(root,trial[key],value);trial[`${key}_sha256`]=sha256(readFileSync(join(root,trial[key])));writeLock(root,lock);}

test('protocol order is reproducible, paired/counterbalanced, exact IDs and seeded',()=>{
  const pairs=[1,2,3].sort((a,b)=>sha256(`${PROTOCOL.seed}:pair:${a}`).localeCompare(sha256(`${PROTOCOL.seed}:pair:${b}`)));
  const firstWisp=parseInt(sha256(`${PROTOCOL.seed}:first-arm`).slice(0,2),16)%2===0;
  const expected=pairs.flatMap((n,i)=>((i%2===0)===firstWisp?['wisp','typescript']:['typescript','wisp']).map(a=>`${a}-${n}`));
  assert.deepEqual(trialOrder(PROTOCOL),expected);assert.deepEqual(trialOrder({...PROTOCOL,ids:[...PROTOCOL.ids].reverse()}),expected);
  for(let i=0;i<6;i+=2){assert.equal(expected[i].split('-')[1],expected[i+1].split('-')[1]);assert.notEqual(expected[i].split('-')[0],expected[i+1].split('-')[0]);}
  for(const bad of [{version:2},{order_version:1},{acceptance_invocations:0},{repetitions_per_arm:0},{ids:[]},{ids:['wisp-1','wisp-1',...PROTOCOL.ids.slice(2)]},{ids:[...PROTOCOL.ids.slice(0,5),'other-3']},{seed:''}])assert.throws(()=>trialOrder({...PROTOCOL,...bad}));
});
test('freeze verifies every required byte; refuses omitted, unsafe, foreign and invalid hash entries',()=>temporary(root=>{
  setup(root);const path=join(root,BASE,'frozen.json'),original=readFileSync(path);const manifest=JSON.parse(original);
  assert.equal(Object.keys(verifyStudyFrozen(root).files).length,REQUIRED_FROZEN.length);
  for(const [key,value] of [['../outside','a'.repeat(64)],['/etc/passwd','a'.repeat(64)],['scripts/../secret.json','a'.repeat(64)],['.env','a'.repeat(64)],['scripts/secret.json','a'.repeat(64)],['scripts\\evaluate.mjs','a'.repeat(64)],[REQUIRED_FROZEN[0],'invalid']]) {
    put(root,`${BASE}/frozen.json`,{...manifest,files:{...manifest.files,[key]:value}});assert.throws(()=>verifyStudyFrozen(root));
  }
  const missing={...manifest.files};delete missing[REQUIRED_FROZEN[0]];put(root,`${BASE}/frozen.json`,{...manifest,files:missing});assert.throws(()=>verifyStudyFrozen(root));
  writeFileSync(path,original);put(root,REQUIRED_FROZEN[0],'corrupt');assert.throws(()=>verifyStudyFrozen(root));
}));
test('root escape symlink and oversized frozen file fail before bytes are accepted',()=>temporary(root=>temporary(outside=>{
  setup(root);const path=REQUIRED_FROZEN[0];rmSync(join(root,path));put(outside,'untrusted','do not read');symlinkSync(join(outside,'untrusted'),join(root,path));assert.throws(()=>verifyStudyFrozen(root),/escapes/);
  rmSync(join(root,path));put(root,'do-not-read','private');symlinkSync(join(root,'do-not-read'),join(root,path));assert.throws(()=>verifyStudyFrozen(root),/Symlinks/);
  rmSync(join(root,path));put(root,path,'x'.repeat(5*1024*1024+1));assert.throws(()=>verifyStudyFrozen(root),/cap/);
})));
test('lock enforces six finals, paths/arms, hashes, telemetry and randomized order',()=>temporary(root=>{
  const original=setup(root);assert.equal(verifySubmissionLock(PROTOCOL,root).trials.length,6);
  const edits=[lock=>lock.order.reverse(),lock=>lock.trials.pop(),lock=>lock.trials[1]=lock.trials[0],lock=>lock.trials[0].arm='other',lock=>lock.trials[0].source='../secret',lock=>lock.trials[0].decision_sha256='bad',lock=>delete lock.trials[0].token_usage,lock=>lock.trials[0].dispatch_window_ms=-1,lock=>lock.trials[0].configured_agent='other'];
  for(const edit of edits) {const lock=structuredClone(original);edit(lock);writeLock(root,lock);assert.throws(()=>verifySubmissionLock(PROTOCOL,root));}
  writeLock(root,original);put(root,original.trials[0].evidence,'changed final');assert.throws(()=>verifySubmissionLock(PROTOCOL,root),/hash mismatch/);
}));
test('decision assessment is typed, exact and explicitly only self-report',()=>{
  assert.equal(assessDecision(DECISION).reported_history_assertions_match,true);
  for(const value of [null,[],{}, {...DECISION,extra:true},{...DECISION,historical_input:0},{...DECISION,historical_input:'1'},{...DECISION,explanation:' '},{...DECISION,explanation:false},{...DECISION,fresh_public_suite_passed:false},{...DECISION,current_old_input_passed:'true'},{...DECISION,old_replay_is_full_acceptance:true}])assert.equal(assessDecision(value).reported_history_assertions_match,false);
});
test('report gates actual full grades separately from assertions; records nulls and portable paths',()=>temporary(root=>{
  const lock=setup(root),calls=[];
  const report=runStudy({root,runner:runner(),grader:(arm,path)=>{calls.push(path);return goodGrade(arm,path);}});
  assert.equal(report.passed,true);assert.equal(report.grading_complete,true);assert.equal(calls.length,6);assert.deepEqual(report.order,lock.order);
  assert.deepEqual(report.accepted_counts.wisp,{functional:3,reported_assertions:3,both:3,total:3});
  assert(!JSON.stringify(report).includes(root));assert.equal(report.results[0].functional_grade.path,lock.trials[0].source);
  assert.equal(report.results[0].token_usage,null);assert.equal(report.results[0].verified_model,null);assert.equal(report.results[0].dispatch_window_ms,null);
  relock(root,lock,lock.order[0],'decision','{ malformed JSON');
  const malformed=runStudy({root,runner:runner(),grader:goodGrade});assert.equal(malformed.passed,false);assert.equal(malformed.results[0].functional_passed,true);assert.equal(malformed.results[0].reported_history_assertions_match,false);assert.equal(malformed.results.length,6);
}));
test('debug binary hashing has a separate cap from 5 MiB study artifacts',()=>temporary(root=>{
  setup(root);put(root,'target/debug/wisp','x'.repeat(5*1024*1024+1));
  const report=runStudy({root,runner:runner(),grader:goodGrade});
  assert.equal(report.passed,true);assert.equal(report.binary_sha256,sha256(readFileSync(join(root,'target/debug/wisp'))));
}));
test('Unknown, truncated counts, source mismatch and empty results never false-pass',()=>temporary(root=>{
  setup(root);
  for(const override of [{passed:false},{cases_executed:546},{cases_total:0},{cases_passed:546},{compile_check:null},{source_sha256:'0'.repeat(64)},{failures:[{status:'Unknown'}]}]) {
    const report=runStudy({root,runner:runner(),grader:(arm,path)=>({...goodGrade(arm,path),...override})});assert.equal(report.passed,false);assert(report.results.every(r=>!r.functional_passed));
  }
  rmSync(join(root,BASE,'submission-lock.json'));const empty=runStudy({root,runner:runner(),grader:goodGrade});assert.equal(empty.passed,false);assert.equal(empty.grading_complete,false);assert.equal(empty.results.length,0);
}));
test('explicit missing finals remain failures, not skipped successes',()=>temporary(root=>{
  const lock=setup(root),trial=lock.trials[0];
  trial.missing_submission=true;
  for(const key of ['source','decision','evidence']) {rmSync(join(root,trial[key]));trial[key]=null;trial[`${key}_sha256`]=null;}
  writeLock(root,lock);assert.equal(verifySubmissionLock(PROTOCOL,root).trials.length,6);
  let calls=0;const report=runStudy({root,runner:runner(),grader:(arm,path)=>{calls++;return goodGrade(arm,path);}});
  assert.equal(calls,5);assert.equal(report.results.length,6);assert.equal(report.passed,false);assert.equal(report.results[0].missing_submission,true);
}));
test('reverify freeze and all final hashes before/after each grade without refreshing locks',()=>temporary(root=>{
  let lock=setup(root),calls=0;
  let report=runStudy({root,runner:runner(),grader:(arm,path)=>{calls++;put(root,lock.trials.at(-1).decision,'tampered');return goodGrade(arm,path);}});
  assert.equal(report.passed,false);assert.equal(report.grading_complete,false);assert.equal(calls,1);assert.match(report.error,/hash mismatch/);
  lock=setup(root);calls=0;
  report=runStudy({root,runner:runner(),grader:(arm,path)=>{calls++;put(root,REQUIRED_FROZEN[0],'tampered');return goodGrade(arm,path);}});
  assert.equal(report.passed,false);assert.equal(calls,1);assert.match(report.error,/hash mismatch/);
}));
test('CLI snapshots Git before creating exclusive report; malformed usage 2, gate failure JSON 1',()=>temporary(root=>{
  setup(root);const out=join(root,'report.json');
  const options={root,grader:goodGrade,runner:runner(()=>assert.equal(existsSync(out),false))};
  assert.equal(main(['--out',out],options),0);const first=readFileSync(out);assert.equal(JSON.parse(first).dirty,true);
  assert.equal(main(['--out',out],options),2);assert.deepEqual(readFileSync(out),first);
  rmSync(join(root,BASE,'frozen.json'));const failed=join(root,'failed.json');assert.equal(main(['--out',failed],{root,grader:goodGrade,runner:runner()}),1);assert.equal(JSON.parse(readFileSync(failed)).passed,false);
  for(const args of [['--bad'],['--out'],['--out','x','--out','y']]) {
    const result=spawnSync(process.execPath,[join(ROOT,'scripts/maintenance-study.mjs'),...args],{encoding:'utf8',timeout:10000});assert.equal(result.status,2);
  }
}));
