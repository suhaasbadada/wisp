import assert from 'node:assert/strict';
import { samples } from './fixtures.mjs';
const names = {Depot:['capacity','occupied','reserved','pack','now'],Order:['staged','request','hold_slots','hold_until']};
const object = (type, values) => Object.fromEntries(names[type].map((k,i)=>[k,BigInt(values[i])]));
const containers = (units,size) => { let count=0n; while(count*size<units) count++; return count; };
export function oracle(order,depot) {
  const {capacity,occupied,reserved,pack,now}=depot;
  const {staged,request,hold_slots,hold_until}=order;
  assert(capacity>=0n && capacity<=1000000n && occupied>=0n && occupied<=capacity && reserved>=0n && reserved<=capacity-occupied && pack>=1n && pack<=100n && now>=0n && now<=1000000n);
  assert(staged>=0n && staged<=occupied*pack && request>=0n && request<=1000000n && hold_slots>=0n && hold_slots<=1000000n && hold_until>=0n && hold_until<=1000000n);
  const live=hold_until-now>=1n;
  assert(!live || hold_slots<=reserved);
  const existing=containers(staged,pack);
  let added=0n; while((existing+added)*pack<staged+request) added++;
  const other=live?reserved-hold_slots:reserved;
  const free=capacity-occupied-other;
  const accepted=occupied+other+added<=capacity;
  return {type:'Decision',value:{accepted,added:String(added),free_after:String(accepted?free-added:free)}};
}
const encode = value => Object.fromEntries(Object.entries(value).map(([k,v])=>[k,String(v)]));
export function studyCases() {
  const cases=[];
  const add=(order,depot,name)=>cases.push({name,target:'reserve',args:[encode(order),encode(depot)],expected:oracle(order,depot)});
  samples.forEach(([d,o],i)=>add(object('Order',o),object('Depot',d),`public-${i}`));
  for(const p of [2n,4n,7n]) for(const staged of [0n,p-1n,p,p+1n]) for(const request of [0n,1n,p-1n,p,p+1n]) for(const slack of [0n,1n,2n]) for(const deadline of [9n,10n,11n]) {
    const occupied=containers(staged,p);
    add({staged,request,hold_slots:1n,hold_until:deadline},{capacity:occupied+2n+slack,occupied,reserved:2n,pack:p,now:10n},`grid-${cases.length-7}`);
  }
  return cases;
}
