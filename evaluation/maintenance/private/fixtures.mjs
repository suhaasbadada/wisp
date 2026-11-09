// Author fixtures. Instructional holdout, NOT technical isolation.
export const samples = [
  [[1,0,0,4,10],[0,4,0,10],[true,1,0]],
  [[1,1,0,4,10],[1,3,0,10],[true,0,0]],
  [[2,0,2,4,10],[0,1,1,10],[false,1,0]],
  [[2,0,2,4,10],[0,1,1,11],[true,1,0]],
  [[2,1,0,4,10],[3,2,0,10],[true,1,0]],
  [[2,1,0,4,10],[4,5,0,10],[false,2,1]],
  [[1,1,0,4,10],[1,0,0,10],[true,0,0]],
];
const fields = {Depot:['capacity','occupied','reserved','pack','now'],Order:['staged','request','hold_slots','hold_until'],Decision:['accepted','added','free_after']};
const functions = [
 ['ceil_slots','units: Int, pack: Int','Int','if units == 0 { 0 } else { (units - 1) / pack + 1 }'],
 ['staged_slots','order: Order, depot: Depot','Int','ceil_slots(order.staged, depot.pack)'],
 ['added_slots','order: Order, depot: Depot','Int','ceil_slots(order.request, depot.pack)'],
 ['hold_live','order: Order, depot: Depot','Bool','order.hold_until > depot.now'],
 ['credit_slots','order: Order, depot: Depot','Int','if order.hold_until >= depot.now { order.hold_slots } else { 0 }'],
 ['free_slots','order: Order, depot: Depot','Int','depot.capacity - depot.occupied - depot.reserved + credit_slots(order, depot)'],
 ['fits','needed: Int, available: Int','Bool','needed <= available'],
 ['decision','needed: Int, available: Int','Decision','if fits(needed, available) { Decision { accepted: true, added: needed, free_after: available - needed } } else { Decision { accepted: false, added: needed, free_after: available } }'],
 ['reserve','order: Order, depot: Depot','Decision','decision(added_slots(order, depot), free_slots(order, depot))'],
 ['display_capacity','depot: Depot','Int','let unassigned = depot.capacity - depot.occupied - depot.reserved; if unassigned > 0 { unassigned - 1 } else { 0 }'],
 ['display_warning','order: Order, depot: Depot','Bool','staged_slots(order, depot) > display_capacity(depot)'],
];
function literal(type, values, arm) {
  return `${arm === 'wisp' ? 'new ' + type + ' ' : ''}{ ${fields[type].map((f,i)=>`${f}: ${typeof values[i] === 'boolean' ? values[i] : values[i] + (arm === 'wisp' ? '' : 'n')}`).join(', ')} }`;
}
function tsBody(body, type) {
  body = body.replaceAll('Decision {','{').replace(/\b(\d+)\b/g,'$1n');
  if (body.startsWith('let unassigned')) return body.replace('; if unassigned > 0n { unassigned - 1n } else { 0n }','; return unassigned > 0n ? unassigned - 1n : 0n;');
  if (body.startsWith('if ')) {
    const m = /^if (.*?) \{ (.*?) \} else \{ (.*?) \}$/.exec(body);
    return `return ${m[1]} ? (${m[2]}) : (${m[3]});`;
  }
  return `return ${body};`;
}
export function fixture(arm, variant='baseline') {
  const w = arm === 'wisp';
  let text = '// Warehouse admission: immutable snapshot records and pallet arithmetic.\n';
  for (const [type, fs] of Object.entries(fields)) text += w ? `record ${type} { ${fs.map(f=>`${f}: ${f==='accepted'?'Bool':'Int'}`).join(', ')} }\n` : `export interface ${type} { ${fs.map(f=>`readonly ${f}: ${f==='accepted'?'boolean':'bigint'}`).join('; ')} }\n`;
  text += '\n// Admission calculations consume a single depot snapshot.\n';
  for (const [name,args,type,original] of functions) {
    let body = original;
    if (name === 'added_slots' && variant === 'historical') body += ' + 1';
    if (name === 'added_slots' && ['reference','packing'].includes(variant)) body = 'ceil_slots(order.staged + order.request, depot.pack) - staged_slots(order, depot)';
    if (name === 'credit_slots' && ['reference','expiry'].includes(variant)) body = 'if hold_live(order, depot) { order.hold_slots } else { 0 }';
    if(name === 'display_capacity') text += '\n// Dashboard information deliberately keeps one unassigned pallet in reserve.\n';
    text += w ? `fn ${name}(${args}) -> ${type} { ${body.replaceAll('Decision {','new Decision {')} }\n` : `export function ${name}(${args.replaceAll('Int','bigint')}): ${type==='Int'?'bigint':type==='Bool'?'boolean':type} { ${tsBody(body,type)} }\n`;
  }
  text += '\n// Public regression examples; retain these unchanged.\n';
  for (const [name,type,column] of [['sample_depot','Depot',0],['sample_order','Order',1],['sample_expected','Decision',2]]) {
    const values = samples.map(s=>literal(type,s[column],arm));
    const body = w ? values.slice(0,-1).map((v,i)=>`if n == ${i} { ${v} } else { `).join('') + values.at(-1) + ' }'.repeat(6) : 'return ' + values.slice(0,-1).map((v,i)=>`n === ${i}n ? (${v}) : `).join('') + values.at(-1) + ';';
    text += w ? `fn ${name}(n: Int) -> ${type} { ${body} }\n` : `export function ${name}(n: bigint): ${type} { ${body} }\n`;
  }
  text += w ? 'fn sample_ok(n: Int) -> Bool { reserve(sample_order(n), sample_depot(n)) == sample_expected(n) }\nprobe n in 0..=3 { sample_ok(n) }\nprobe n in 4..=6 { sample_ok(n) }\n' : 'export function sample_ok(n: bigint): boolean { const actual = reserve(sample_order(n), sample_depot(n)); const expected = sample_expected(n); return actual.accepted === expected.accepted && actual.added === expected.added && actual.free_after === expected.free_after; }\n';
  return text;
}
