// Trusted self-authored submissions only. A bounded child process is not a sandbox.
// Compile with real strict tsc first; require once, execute the entire task batch.
'use strict';
const { readFileSync } = require('node:fs');
const convert = value => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string' && /^(0|-[1-9][0-9]*|[1-9][0-9]*)$/.test(value)) return BigInt(value);
  if (value && typeof value === 'object' && !Array.isArray(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, convert(item)]));
  throw new Error('Invalid canonical argument');
};
try {
  const { cases } = JSON.parse(readFileSync(0, 'utf8'));
  const candidate = require(process.argv[2]);
  const results = cases.map(test => {
    try {
      if (!Object.hasOwn(candidate, test.target) || typeof candidate[test.target] !== 'function') throw new Error('Missing exported target');
      const value = candidate[test.target](...test.args.map(convert));
      let result;
      if (typeof value === 'bigint') {
        const text = String(value);
        if (text.length > 100) throw new Error('Oversized scalar result');
        result = { type: 'Int', value: text };
      } else if (typeof value === 'boolean') result = { type: 'Bool', value };
      else throw new Error(`Expected bigint or boolean, received ${typeof value}`);
      return { status: 'Complete', result };
    } catch (error) { return { status: 'Error', error: String(error?.message ?? error).slice(0, 1000) }; }
  });
  process.stdout.write(JSON.stringify(results));
} catch (error) {
  process.stderr.write(String(error?.message ?? error).slice(0, 1000));
  process.exitCode = 1;
}
