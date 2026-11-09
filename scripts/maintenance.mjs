/** Maintenance study infrastructure; finite acceptance only, trusted sources only. */
import { readFileSync, statSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import ts from 'typescript';
import { ROOT, LIMITS, createRunner, sha256 } from './evaluate.mjs';
import { studyCases } from '../evaluation/maintenance/private/cases.mjs';
export { studyCases };
export const HOME=join(ROOT,'evaluation/maintenance');
export function sourceFile(path) {
  const stat=statSync(path);
  if(!stat.isFile() || stat.size>LIMITS.source_bytes) throw Error('Source cap or file type');
  const bytes=readFileSync(path);
  if(bytes.length>LIMITS.source_bytes) throw Error('Source cap');
  const source=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  if(!Buffer.from(source).equals(bytes)) throw Error('Noncanonical UTF-8');
  return source;
}
export const native=(run,request)=>JSON.parse(run(join(ROOT,'target/debug/wisp'),['--json'],JSON.stringify(request)));
const ready = report => {if(report.status!=='Ready') throw Error(`Compiler not Ready: ${JSON.stringify(report.diagnostics).slice(0,1200)}`);return report;};
export function checkNoHost(file) {
  const program=ts.createProgram([file],{strict:true,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,noEmit:true});
  const tree=program.getSourceFile(file),checker=program.getTypeChecker();
  const visit=node=>{
    if(ts.isImportDeclaration(node) || ts.isImportEqualsDeclaration(node) || ts.isExportDeclaration(node) || ts.isElementAccessExpression(node) || ts.isNewExpression(node) || node.kind===ts.SyntaxKind.ImportKeyword) throw Error('No imports, dynamic property access, dependencies or host construction');
    if(ts.isCallExpression(node)) {
      const declaration=checker.getResolvedSignature(node)?.declaration;
      if(!declaration || declaration.getSourceFile()!==tree || !ts.isFunctionDeclaration(declaration)) throw Error('Calls must resolve to authored named functions, not host APIs');
    }
    if(ts.isPropertyAccessExpression(node)) {
      const declarations=checker.getSymbolAtLocation(node.name)?.declarations;
      if(!declarations?.length || declarations.some(d=>d.getSourceFile()!==tree))throw Error('Property must resolve to an authored record field');
    }
    if(ts.isIdentifier(node)) {
      const declarations=checker.getSymbolAtLocation(node)?.declarations;
      if(declarations?.some(d=>d.getSourceFile()!==tree))throw Error('External/host symbol forbidden');
    }
    ts.forEachChild(node,visit);
  };visit(tree);
}
export function tsFunctions(source) {
  const tree=ts.createSourceFile('candidate.ts',source,ts.ScriptTarget.ES2022,true);
  if(tree.parseDiagnostics.length) throw Error('Syntax error');
  return tree.statements.filter(ts.isFunctionDeclaration).map(fn=>{
    if(!fn.name || !fn.body) throw Error('Function declaration missing body');
    return {name:fn.name.text,signature:source.slice(fn.getStart(tree),fn.body.getStart(tree)),start:fn.body.getStart(tree),end:fn.body.end};
  });
}
export function compareBodies(baseline,candidate,before,after,bytes=false) {
  const slice=(s,a,b)=>bytes?Buffer.from(s).subarray(a,b).toString('utf8'):s.slice(a,b);
  if(before.length!==after.length || !before.length) throw Error('Function set changed');
  const changes=[];
  for(let i=0;i<before.length;i++) {
    const a=before[i],b=after[i];
    if(a.name!==b.name || a.signature!==b.signature) throw Error('Signature changed');
    if(slice(baseline,a.start,a.end)!==slice(candidate,b.start,b.end)) {
      if(a.name.startsWith('sample_')) throw Error('Protected public function');
      changes.push({...a,replacement:slice(candidate,b.start,b.end)});
    }
  }
  if(changes.length<1 || changes.length>2) throw Error('Change one or two existing bodies');
  let reconstructed='',cursor=0;
  for(const change of changes) {reconstructed+=slice(baseline,cursor,change.start)+change.replacement;cursor=change.end;}
  reconstructed+=slice(baseline,cursor);
  if(reconstructed!==candidate) throw Error('Bytes outside bodies changed');
  return changes;
}
export function structure(arm,baseline,candidate,run=createRunner().run) {
  if(arm==='typescript') return compareBodies(baseline,candidate,tsFunctions(baseline),tsFunctions(candidate));
  if(arm!=='wisp') throw Error('Unknown arm');
  const analyze=s=>ready(native(run,{op:'analyze',source:s}));
  const functions=r=>r.graph.functions.map(f=>({name:f.name,signature:f.signature,start:f.body_span.start,end:f.body_span.end}));
  let current=baseline,report=analyze(current);
  const changes=compareBodies(baseline,candidate,functions(report),functions(analyze(candidate)),true);
  for(const change of changes) {
    const metadata=report.graph.functions.find(f=>f.name===change.name);
    const edit=ready(native(run,{op:'edit',source:current,focus:change.name,change:{expected_revision:report.revision,expected_body_hash:metadata.body_hash,replacement:change.replacement}}));
    current=edit.edit.source;report=analyze(current);
  }
  if(current!==candidate) throw Error('Sequential core edits did not reproduce candidate');
  return changes;
}
export function validResult(report,expected) {
  if(report?.status!=='Complete') return false;
  const r=report.result;
  if(!r || Object.keys(r).sort().join(',')!=='type,value' || r.type!==expected.type) return false;
  if(r.type==='Bool') return typeof r.value==='boolean' && r.value===expected.value;
  const v=r.value;
  return r.type==='Decision' && v && Object.keys(v).sort().join(',')==='accepted,added,free_after' && typeof v.accepted==='boolean' && ['added','free_after'].every(k=>typeof v[k]==='string' && /^(0|-[1-9][0-9]*|[1-9][0-9]*)$/.test(v[k]) && BigInt(v[k])>=-(2n**63n) && BigInt(v[k])<2n**63n) && Object.keys(v).every(k=>v[k]===expected.value[k]);
}
export function executeCases(arm,source,cases,runner=createRunner()) {
  if(arm==='wisp') {
    ready(native(runner.run,{op:'analyze',source}));
    return cases.map(test=>{try{return native(runner.run,{op:'call',source,function:test.target,args:test.args});}catch(e){return {status:'Error',error:String(e.message).slice(0,1000)};}});
  }
  if(arm!=='typescript') throw Error('Unknown arm');
  const temp=mkdtempSync(join(tmpdir(),'wisp-maintenance-'));
  try {
    const file=join(temp,'candidate.ts');writeFileSync(file,source,{flag:'wx'});
    checkNoHost(file);
    // Explicit CommonJS output + .cjs load avoids ambient ESM/package confusion.
    runner.run(process.execPath,[join(ROOT,'node_modules/typescript/bin/tsc'),'--strict','--target','ES2022','--module','commonjs','--noEmitOnError','--skipLibCheck','--outDir',join(temp,'out'),file],'',temp);
    if(!cases.length) return []; // Compilation means no module initialization or execution.
    const compiled=join(temp,'candidate.cjs');writeFileSync(compiled,readFileSync(join(temp,'out/candidate.js')),{flag:'wx'});
    const reports=JSON.parse(runner.run(process.execPath,[join(ROOT,'scripts/maintenance-worker.cjs'),compiled],JSON.stringify(cases),temp));
    if(!Array.isArray(reports) || reports.length!==cases.length) throw Error('Incomplete batch');
    return reports;
  } finally {rmSync(temp,{recursive:true,force:true});}
}
export function gradeCandidate(arm,path) {
  const runner=createRunner();
  const cases=studyCases();
  const result={arm,path:resolve(path),structural_check:false,compile_check:null,cases_total:cases.length,cases_executed:0,cases_passed:0,failures:[]};
  try {
    const source=sourceFile(path);result.source_sha256=sha256(source);
    const baseline=sourceFile(join(HOME,'public',`starter.${arm==='wisp'?'wisp':'ts'}`));
    result.changed_functions=structure(arm,baseline,source,runner.run).map(c=>c.name);result.structural_check=true;
    result.compile_check=false;
    const reports=executeCases(arm,source,cases,runner);result.compile_check=true;
    reports.forEach((report,i)=>{
      result.cases_executed++;
      if(report.usage) {
        result.native_usage ??= {reports:0,fuel_sum:0,max_logical_allocation_bytes:0};
        result.native_usage.reports++;
        result.native_usage.fuel_sum+=report.usage.fuel;
        result.native_usage.max_logical_allocation_bytes=Math.max(result.native_usage.max_logical_allocation_bytes,report.usage.logical_allocation_bytes);
      }
      if(validResult(report,cases[i].expected))result.cases_passed++;
      else if(result.failures.length<20)result.failures.push({case:cases[i].name,expected:cases[i].expected,actual:report});
    });
  } catch(error) {result.failures.push({error:String(error.message).slice(0,1500)});}
  result.passed=result.structural_check && result.compile_check===true && result.cases_passed===cases.length;
  return {...result,...runner.metrics};
}

/** TypeScript checker-resolved syntactic closure; not semantic completeness. */
export function tsContext(path,focus,budget=65536) {
  const source=sourceFile(path);
  if(!Number.isSafeInteger(budget) || budget<0 || budget>65536) throw Error('Budget must be 0..65536');
  const absolute=resolve(path);
  const program=ts.createProgram([absolute],{strict:true,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,noEmit:true});
  const tree=program.getSourceFile(absolute),checker=program.getTypeChecker();
  const functions=tree.statements.filter(ts.isFunctionDeclaration).filter(f=>f.name && f.body);
  const byName=new Map(functions.map(f=>[f.name.text,f]));
  if(!byName.has(focus)) throw Error('Unknown focus');
  const edges=[],unresolved=[];
  const span=node=>({start_utf16:node.getStart(tree),end_utf16:node.end,start_byte:Buffer.byteLength(source.slice(0,node.getStart(tree))),end_byte:Buffer.byteLength(source.slice(0,node.end))});
  for(const fn of functions) {
    const visit=node=>{
      if(ts.isCallExpression(node)) {
        const signature=checker.getResolvedSignature(node),declaration=signature?.declaration;
        const target=declaration && functions.includes(declaration)?declaration.name.text:null;
        const item={from:fn.name.text,to:target,text:node.expression.getText(tree),span:span(node)};
        if(target)edges.push(item);else unresolved.push(item);
      }
      ts.forEachChild(node,visit);
    };visit(fn.body);
  }
  const closure=new Set(),visit=name=>{if(closure.has(name))return;closure.add(name);for(const e of edges.filter(e=>e.from===name))visit(e.to);};visit(focus);
  const eligible=[...tree.statements.filter(n=>ts.isInterfaceDeclaration(n)||ts.isTypeAliasDeclaration(n)),...functions.filter(f=>closure.has(f.name.text))];
  let text='',stopped=false;
  const chunks=eligible.map(node=>{
    const value=node.getText(tree),framed=value+'\n\n',size=Buffer.byteLength(framed);
    const included=!stopped && Buffer.byteLength(text)+size<=budget;
    if(included)text+=framed;else stopped=true;
    return {name:node.name?.text,span:span(node),sha256:sha256(value),bytes:size,included,omission:included?null:'budget',source:included?value:undefined};
  });
  return {source_sha256:sha256(source),source_bytes:Buffer.byteLength(source),offset_units:'UTF-16 and UTF-8 explicitly labelled',focus,budget,text,chunks,functions:tsFunctions(source),direct_calls:edges,unresolved_calls:unresolved,closure:[...closure],scope_omissions:functions.filter(f=>!closure.has(f.name.text)).map(f=>f.name.text),diagnostics:ts.getPreEmitDiagnostics(program).map(d=>ts.flattenDiagnosticMessageText(d.messageText,'\n')).slice(0,20),full_source_fallback:source,limitations:'Checker-resolved syntactic calls include dead branches; metadata is not proof or context completeness. Full source and own tests unrestricted.'};
}
