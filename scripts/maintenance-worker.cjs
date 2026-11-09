// Trusted authored code only. Process bounds are not a sandbox.
'use strict';
const { readFileSync } = require('node:fs');
const convert = value => typeof value === 'string' && /^(0|-[1-9][0-9]*|[1-9][0-9]*)$/.test(value) ? BigInt(value) : typeof value === 'boolean' ? value : value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).map(([k,v])=>[k,convert(v)])) : (()=>{throw Error('Invalid argument');})();
try {
  const candidate=require(process.argv[2]);
  const reports=JSON.parse(readFileSync(0,'utf8')).map(test=>{
    try {
      if(!Object.hasOwn(candidate,test.target) || typeof candidate[test.target] !== 'function') throw Error('Missing target');
      const value=candidate[test.target](...test.args.map(convert));
      let result;
      if(typeof value==='boolean') result={type:'Bool',value};
      else {
        if(!value || Object.keys(value).sort().join(',')!=='accepted,added,free_after' || typeof value.accepted!=='boolean' || typeof value.added!=='bigint' || typeof value.free_after!=='bigint') throw Error('Expected exact Decision');
        if(String(value.added).length>20 || String(value.free_after).length>20) throw Error('Oversized integer');
        result={type:'Decision',value:{accepted:value.accepted,added:String(value.added),free_after:String(value.free_after)}};
      }
      return {status:'Complete',result};
    } catch(error) { return {status:'Error',error:String(error.message).slice(0,1000)}; }
  });
  process.stdout.write(JSON.stringify(reports));
} catch(error) { process.stderr.write(String(error.message).slice(0,1000));process.exitCode=1; }
