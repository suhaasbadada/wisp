import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { REQUIRED_FROZEN, verifyStudyFrozen } from './maintenance-study.mjs';
import { sha256 } from './evaluate.mjs';

test('historical documents may evolve without hiding any changed grading or case input', () => {
  const root=mkdtempSync(join(tmpdir(),'wisp-study-snapshot-'));
  const put=(path,data)=>{mkdirSync(dirname(join(root,path)),{recursive:true});writeFileSync(join(root,path),data);};
  try {
    const files={};
    for(const path of [...REQUIRED_FROZEN,'Docs/CLI.md']){const value=`historical ${path}`;put(path,value);files[path]=sha256(value);}
    put('evaluation/maintenance/frozen.json',JSON.stringify({version:1,files}));
    const path='Docs/CLI.md',snapshot=`evaluation/maintenance/historical-inputs/${path}`;
    const original=readFileSync(join(root,path));
    put(snapshot,original);put(path,'Updated product documentation');
    verifyStudyFrozen(root);
    put(snapshot,'Changed historical documentation');
    assert.throws(()=>verifyStudyFrozen(root),/hash mismatch/);
    put(snapshot,original);
    const grader='scripts/maintenance.mjs';
    put(`evaluation/maintenance/historical-inputs/${grader}`,readFileSync(join(root,grader)));
    put(grader,'Changed execution semantics');
    assert.throws(()=>verifyStudyFrozen(root),/hash mismatch/);
  } finally {rmSync(root,{recursive:true,force:true});}
});
