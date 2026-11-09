import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRunner, sha256 } from './evaluate.mjs';
import { tsContext, sourceFile, executeCases, validResult } from './maintenance.mjs';
const HELP=`Maintenance tools (trusted authored sources only; bounded, NOT sandboxed)
  ts-context FILE FOCUS [--budget N]  Checker-resolved calls, spans, closure, full bodies/types; full-source fallback
  ts-check FILE                     Real strict tsc (ES2022 bigint); no test acceptance implied
  ts-public FILE                    Seven frozen public regressions, groups 0..3 and 4..6
  ts-replay FILE SNAPSHOT            Verify and execute historical source, then old input against current
No mandatory sequence. Full source and your own tests are unrestricted.
Wisp: target/debug/wisp check|run FILE; focus FILE FUNCTION --budget N;
context FILE --probe N --budget N; inspect ARTIFACT; replay FILE --artifact ARTIFACT.
See evaluation/maintenance/public/README.md for transport/setup and limits.
`;
export function main(args=process.argv.slice(2)) {
  try {
    if(args.length===1 && ['--help','-h'].includes(args[0])) {process.stdout.write(HELP);return 0;}
    const [command,file,...rest]=args;
    if(!file) throw Error(HELP);
    const runner=createRunner();let result;
    if(command==='ts-context') {
      if(!rest[0] || !(rest.length===1 || rest.length===3 && rest[1]==='--budget' && /^\d+$/.test(rest[2])))throw Error('Invalid context arguments');
      result=tsContext(file,rest[0],rest.length===3?Number(rest[2]):65536);
    } else if(command==='ts-check' && !rest.length) {
      executeCases('typescript',sourceFile(file),[],runner);result={status:'Ready',new_execution:false,note:'Real strict compilation only; no module initialization or function execution.'};
    } else if(command==='ts-public' && !rest.length) {
      const cases=JSON.parse(readFileSync(new URL('../evaluation/maintenance/public/public-regressions.json',import.meta.url),'utf8'));
      const reports=executeCases('typescript',sourceFile(file),cases,runner);
      result={groups:[[0,1,2,3],[4,5,6]].map(indices=>({cases:indices.length,passed:indices.filter(i=>validResult(reports[i],cases[i].expected)).length})),reports,passed:reports.every((r,i)=>validResult(r,cases[i].expected))};
    } else if(command==='ts-replay' && rest.length===1) {
      const snapshot=JSON.parse(readFileSync(rest[0],'utf8'));
      if(snapshot.version!==1 || sha256(snapshot.historical_source)!==snapshot.historical_source_sha256)throw Error('Snapshot hash mismatch');
      const historical=executeCases('typescript',snapshot.historical_source,[snapshot.case],runner)[0];
      if(JSON.stringify(historical)!==JSON.stringify(snapshot.historical_report))throw Error('Historical reproduction mismatch');
      const current=executeCases('typescript',sourceFile(file),[snapshot.case],runner)[0];
      result={historical_reproduction:historical,current_replay:current,current_old_input_passed:validResult(current,snapshot.case.expected),new_execution:true,note:'Old input alone does not establish fresh-suite acceptance.'};
    } else throw Error('Invalid command or arguments; use --help');
    process.stdout.write(JSON.stringify({...result,metrics:runner.metrics},null,2)+'\n');
    return result.passed===false?1:0;
  } catch(error) {process.stderr.write(String(error.message).slice(0,2000)+'\n');return 1;}
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href)process.exitCode=main();
