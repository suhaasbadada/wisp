/** Parent-only lifecycle gate. Not a trial input, sandbox or efficiency benchmark. */
import { readFileSync, statSync, realpathSync, openSync, closeSync, writeFileSync } from 'node:fs';
import { join, resolve, relative, isAbsolute, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import ts from 'typescript';
import { ROOT, sha256, createRunner } from './evaluate.mjs';
import { gradeCandidate } from './maintenance.mjs';

const BASE='evaluation/maintenance';
const MAX_FILE=5*1024*1024;
const IDS=['wisp-1','wisp-2','wisp-3','typescript-1','typescript-2','typescript-3'];
const HASH=/^[a-f0-9]{64}$/;
export const REQUIRED_FROZEN=[
  `${BASE}/protocol.json`,`${BASE}/PROCEDURE.md`,
  ...['starter.ts','starter.wisp','task.md','README.md','public-regressions.json'].map(p=>`${BASE}/public/${p}`),
  ...['historical.ts','historical.wisp','typescript-snapshot.json','wisp-artifact.json'].map(p=>`${BASE}/historical/${p}`),
  ...['cases.mjs','cases.json','fixtures.mjs','mutations.mjs',...['reference','packing','expiry','mutation-dashboard','mutation-threshold','mutation-public0_specialcase','mutation-wrong_decision_fields'].flatMap(n=>[`${n}.ts`,`${n}.wisp`])].map(p=>`${BASE}/private/${p}`),
  ...['maintenance.mjs','maintenance-tools.mjs','maintenance-worker.cjs','maintenance-preflight.mjs','maintenance.test.mjs','maintenance-study.mjs','maintenance-study.test.mjs','evaluate.mjs'].map(p=>`scripts/${p}`),
];
const fail=message=>{throw Error(message);};
function safePath(path) {
  if(typeof path!=='string' || !path || isAbsolute(path) || path.includes('\\') || path.split('/').some(part=>!part || part==='.' || part==='..' || part.startsWith('.')) || /[\x00-\x1f\x7f]/.test(path))fail('Unsafe repository path');
  return path;
}
function fileBytes(root,path,cap=MAX_FILE) {
  safePath(path);
  const rootReal=realpathSync(root),absolute=join(rootReal,path);
  // Resolve before opening, but never read a symlink escaping the assigned root.
  const resolved=realpathSync(absolute),inside=relative(rootReal,resolved);
  if(!inside || inside==='..' || inside.startsWith('..'+sep) || isAbsolute(inside))fail('File escapes repository root');
  if(resolved!==absolute)fail('Symlinks are not valid frozen or final files');
  const stat=statSync(resolved);
  if(!stat.isFile() || stat.size>cap)fail('File type or byte cap rejected');
  const bytes=readFileSync(resolved);
  if(bytes.length>cap)fail('File byte cap rejected');
  return bytes;
}
function json(bytes,label) {
  try {return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
  catch {fail(`Malformed ${label} JSON/UTF-8`);}
}
const object=value=>value && typeof value==='object' && !Array.isArray(value);
function allowedFrozen(path) {
  return REQUIRED_FROZEN.includes(path) || path===`${BASE}/private/README.md` || /^evaluation\/maintenance\/private\/preflight-[0-9]+\.json$/.test(path) || /^Docs\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.md$/.test(path);
}
export function verifyStudyFrozen(root=ROOT) {
  const bytes=fileBytes(root,`${BASE}/frozen.json`),manifest=json(bytes,'freeze');
  if(!object(manifest) || manifest.version!==1 || !object(manifest.files))fail('Invalid freeze schema');
  for(const path of REQUIRED_FROZEN)if(!Object.hasOwn(manifest.files,path))fail(`Required frozen entry missing: ${path}`);
  for(const [path,hash] of Object.entries(manifest.files)) {
    safePath(path);
    if(!allowedFrozen(path) || typeof hash!=='string' || !HASH.test(hash))fail('Invalid frozen entry');
    if(sha256(fileBytes(root,path))!==hash)fail(`Frozen byte hash mismatch: ${path}`);
  }
  return {manifest_sha256:sha256(bytes),files:manifest.files};
}
export function trialOrder(protocol) {
  if(!object(protocol) || protocol.version!==1 || protocol.order_version!==2 || protocol.acceptance_invocations!==547 || protocol.repetitions_per_arm!==3 || typeof protocol.seed!=='string' || !protocol.seed || protocol.seed.length>1024 || !Array.isArray(protocol.ids) || protocol.ids.length!==6 || new Set(protocol.ids).size!==6 || IDS.some(id=>!protocol.ids.includes(id)))fail('Invalid study protocol/order');
  const pairs=[1,2,3].sort((a,b)=>sha256(`${protocol.seed}:pair:${a}`).localeCompare(sha256(`${protocol.seed}:pair:${b}`)));
  const firstWisp=parseInt(sha256(`${protocol.seed}:first-arm`).slice(0,2),16)%2===0;
  return pairs.flatMap((n,index)=>{
    const arms=(index%2===0)===firstWisp?['wisp','typescript']:['typescript','wisp'];
    return arms.map(arm=>`${arm}-${n}`);
  });
}
export function assessDecision(value) {
  const fields=['historical_input','historical_failure_reproduced','current_old_input_passed','old_replay_is_full_acceptance','fresh_public_suite_passed','explanation'];
  const schema=Boolean(object(value) && Object.keys(value).length===fields.length && fields.every(k=>Object.hasOwn(value,k)) && typeof value.historical_input==='string' && ['historical_failure_reproduced','current_old_input_passed','old_replay_is_full_acceptance','fresh_public_suite_passed'].every(k=>typeof value[k]==='boolean') && typeof value.explanation==='string' && value.explanation.trim().length>0);
  return {schema_valid:schema,reported_history_assertions_match:Boolean(schema && value.historical_input==='0' && value.historical_failure_reproduced===true && value.current_old_input_passed===true && value.old_replay_is_full_acceptance===false && value.fresh_public_suite_passed===true),scope:'Participant assertions only; not verified knowledge, behavior or authenticated tool telemetry.'};
}
function lockRead(root,protocol) {
  const bytes=fileBytes(root,`${BASE}/submission-lock.json`),lock=json(bytes,'submission lock'),order=trialOrder(protocol);
  if(!object(lock) || lock.version!==1 || !Array.isArray(lock.order) || JSON.stringify(lock.order)!==JSON.stringify(order) || !Array.isArray(lock.trials) || lock.trials.length!==6)fail('Invalid submission lock schema/order');
  const byID=new Map();
  for(const trial of lock.trials) {
    if(!object(trial) || !order.includes(trial.id) || byID.has(trial.id))fail('Invalid or duplicate locked trial');
    const arm=trial.id.startsWith('wisp-')?'wisp':'typescript';
    if(trial.arm!==arm || trial.configured_agent!=='bob' || (trial.missing_submission!==undefined && typeof trial.missing_submission!=='boolean'))fail('Locked arm/agent/missing flag mismatch');
    for(const key of ['verified_model','token_usage','dispatch_window_ms'])if(!Object.hasOwn(trial,key))fail('Missing recorded telemetry field');
    if(trial.dispatch_window_ms!==null && (typeof trial.dispatch_window_ms!=='number' || !Number.isFinite(trial.dispatch_window_ms) || trial.dispatch_window_ms<0))fail('Invalid dispatch window');
    const expected={source:`${BASE}/submissions/${trial.id}/candidate.${arm==='wisp'?'wisp':'ts'}`,decision:`${BASE}/submissions/${trial.id}/decision.json`,evidence:`${BASE}/submissions/${trial.id}/evidence.md`};
    for(const [key,path] of Object.entries(expected)) {
      const value=trial[key],hash=trial[`${key}_sha256`];
      if(trial.missing_submission===true && value===null && hash===null)continue;
      if(value!==path || typeof hash!=='string' || !HASH.test(hash))fail('Locked final path/hash mismatch');
      // A missing final is allowed only when explicitly recorded as missing.
      let data;
      try {data=fileBytes(root,path,key==='source'?65536:MAX_FILE);}
      catch(error) {if(trial.missing_submission===true && error.code==='ENOENT')continue;throw error;}
      if(sha256(data)!==hash)fail(`Locked final byte hash mismatch: ${path}`);
    }
    byID.set(trial.id,trial);
  }
  return {lock,order,byID,sha256:sha256(bytes)};
}
export function verifySubmissionLock(protocol,root=ROOT) {
  const verified=lockRead(root,protocol);
  return {version:1,order:verified.order,trials:verified.order.map(id=>verified.byID.get(id)),lock_sha256:verified.sha256};
}
function portable(value,root) {
  if(Array.isArray(value))return value.map(item=>portable(item,root));
  if(object(value))return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,portable(v,root)]));
  if(typeof value==='string') {
    const prefix=resolve(root);
    // Remove repository-local absolute paths even in bounded diagnostic strings.
    return value.split(prefix+sep).join('').split(prefix).join('.');
  }
  return value;
}
export function runStudy({root=ROOT,grader=gradeCandidate,runner=createRunner()}={}) {
  const start=performance.now();
  const report={version:1,phase:'LOCKED_FINAL_GRADING',grading_complete:false,passed:false,results:[],accepted_counts:{wisp:{functional:0,reported_assertions:0,both:0,total:0},typescript:{functional:0,reported_assertions:0,both:0,total:0}},scope:'Six repeated attempts on one synthetic scenario. No efficiency, causal superiority or exhaustive correctness claim. Dispatch windows are recorded host windows, not verified model latency; participant assertions are not telemetry.'};
  try {
    // Capture state before the CLI creates any report output.
    report.git_head=runner.run('git',['rev-parse','HEAD'],'',root).trim();
    report.dirty=runner.run('git',['status','--porcelain','--untracked-files=normal'],'',root).length>0;
    report.frozen=verifyStudyFrozen(root);
    const protocol=json(fileBytes(root,`${BASE}/protocol.json`),'protocol');
    const locked=verifySubmissionLock(protocol,root);
    report.order=locked.order;report.submission_lock_sha256=locked.lock_sha256;
    report.versions={node:process.version,typescript:ts.version};
    const compiler=JSON.parse(runner.run(join(root,'target/debug/wisp'),['--json'],JSON.stringify({op:'capabilities',source:''}),root));
    if(compiler.status!=='Ready')fail('Native discovery not Ready');report.versions.compiler=compiler.compiler;
    // Linux debug binaries can exceed the 5 MiB JSON/source artifact cap.
    report.binary_sha256=sha256(fileBytes(root,'target/debug/wisp',64*1024*1024));
    report.tooling_sha256=Object.fromEntries(['scripts/maintenance-study.mjs','scripts/maintenance.mjs','scripts/maintenance-tools.mjs','scripts/maintenance-worker.cjs','scripts/evaluate.mjs'].map(path=>[path,sha256(fileBytes(root,path))]));
    for(const trial of locked.trials) {
      const frozen=verifyStudyFrozen(root),currentLock=verifySubmissionLock(protocol,root);
      if(frozen.manifest_sha256!==report.frozen.manifest_sha256 || currentLock.lock_sha256!==locked.lock_sha256)fail('Freeze or submission lock changed during grading');
      const result={id:trial.id,arm:trial.arm,source:trial.source,source_sha256:trial.source_sha256,decision:trial.decision,decision_sha256:trial.decision_sha256,evidence:trial.evidence,evidence_sha256:trial.evidence_sha256,configured_agent:trial.configured_agent,verified_model:trial.verified_model,token_usage:trial.token_usage,dispatch_window_ms:trial.dispatch_window_ms,telemetry_scope:'Recorded lock fields; not independently authenticated.',missing_submission:trial.missing_submission===true,functional_passed:false,reported_history_assertions_match:false,passed:false};
      if(!result.missing_submission) {
        result.functional_grade=portable(grader(trial.arm,join(root,trial.source)),root);
        const grade=result.functional_grade;
        result.functional_passed=Boolean(grade.passed===true && grade.source_sha256===trial.source_sha256 && grade.structural_check===true && grade.compile_check===true && grade.cases_total===547 && grade.cases_executed===547 && grade.cases_passed===547 && Array.isArray(grade.failures) && grade.failures.length===0);
        try {result.decision_assessment=assessDecision(json(fileBytes(root,trial.decision),'participant decision'));}
        catch {result.decision_assessment={schema_valid:false,reported_history_assertions_match:false,error:'Malformed participant decision JSON/UTF-8'};}
        result.reported_history_assertions_match=result.decision_assessment.reported_history_assertions_match;
      } else result.failure='Final submission explicitly missing; retained as failure.';
      result.passed=result.functional_passed && result.reported_history_assertions_match;
      report.results.push(result);
      const count=report.accepted_counts[trial.arm];count.total++;count.functional+=Number(result.functional_passed);count.reported_assertions+=Number(result.reported_history_assertions_match);count.both+=Number(result.passed);
      // Detect mutations by an execution before accepting even the final cell.
      const afterFrozen=verifyStudyFrozen(root),afterLock=verifySubmissionLock(protocol,root);
      if(afterFrozen.manifest_sha256!==report.frozen.manifest_sha256 || afterLock.lock_sha256!==locked.lock_sha256)fail('Freeze or submission lock changed during grading');
    }
    report.grading_complete=report.results.length===6 && Object.values(report.accepted_counts).every(c=>c.total===3);
    report.passed=report.grading_complete && report.results.every(r=>r.passed);
  } catch(error) {report.passed=false;report.error=String(error.message).slice(0,1500);}
  report.parent_runner_metrics=runner.metrics;report.elapsed_ms=performance.now()-start;
  return portable(report,root);
}
export function main(args=process.argv.slice(2),options={}) {
  if(!(args.length===0 || args.length===2 && args[0]==='--out' && args[1] && !args[1].startsWith('--'))) {process.stderr.write('Usage: node scripts/maintenance-study.mjs [--out NEWFILE]\n');return 2;}
  // Exclusive reservation refuses collisions without changing an existing file.
  // Open only after runStudy snapshots Git state, before serializing output.
  if(args.length) {
    try {statSync(resolve(args[1]));process.stderr.write('Output must be a new file\n');return 2;}
    catch(error) {if(error.code!=='ENOENT'){process.stderr.write('Invalid output path\n');return 2;}}
  }
  const report=runStudy(options);let fd;
  try {
    if(args.length)fd=openSync(resolve(args[1]),'wx');
    const bytes=JSON.stringify(report,null,2)+'\n';
    if(fd!==undefined)writeFileSync(fd,bytes);else process.stdout.write(bytes);
    return report.passed?0:1;
  } catch {process.stderr.write('Unable to exclusively create/write report\n');return 2;}
  finally {if(fd!==undefined)closeSync(fd);}
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href)process.exitCode=main();
