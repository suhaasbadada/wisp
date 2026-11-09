// Acceptance cases and independent mathematical oracles. Freeze before trials.
export function acceptanceCases() {
  const cases = [];
  const add = (task, name, args, value, type = 'Int', target) => cases.push({ task, name, args, expected: { type, value: typeof value === 'bigint' ? String(value) : value }, ...(target ? { target } : {}) });
  for (const weight of [0, 1, 499, 500, 999, 1000, 1001, 1002, 1499, 1500, 1501, 1999, 2000, 2001, 5000, 99999, 100000]) {
    for (const remote of [false, true]) {
      // Count actual intervals, independently of the implementation's division expression.
      let price = weight === 0 ? 0n : 500n;
      for (let boundary = 1000; boundary < weight; boundary += 500) price += 120n;
      if (remote && weight !== 0) price += 175n;
      add('shipping', `weight-${weight}-remote-${remote}`, [String(weight), remote], price);
    }
  }
  for (const quantity of [0, 1, 2, 5, 100]) {
    for (const unit of [0, 1, 101, 999999, 1000000]) {
      for (const discount of [0, 1, 3333, 5000, 9999, 10000]) {
        for (const returned of [-100, 0, 1, 2, 6, 200]) {
          const sale = { quantity: String(quantity), unit_cents: String(unit), discount_bps: String(discount) };
          const count = Math.max(0, Math.min(quantity, returned));
          const numerator = BigInt(count) * BigInt(unit) * BigInt(10000 - discount);
          add('refund', `q${quantity}-u${unit}-d${discount}-r${returned}`, [sale, String(returned)], numerator / 10000n);
        }
        const sale = { quantity: String(quantity), unit_cents: String(unit), discount_bps: String(discount) };
        add('refund', `unit-net-q${quantity}-u${unit}-d${discount}`, [sale], BigInt(unit) * BigInt(10000 - discount) / 10000n, 'Int', 'unit_net');
      }
    }
  }
  const max = 9223372036854775807n, min = -9223372036854775808n;
  const states = [
    [0n, 0n, 0n], [0n, 0n, 20n], [5n, 5n, 20n], [20n, 0n, 20n],
    [21n, 0n, 20n], [0n, 21n, 20n], [-1n, 0n, 20n], [0n, -1n, 20n], [0n, 0n, -1n],
    [0n, 0n, max], [max, 0n, max], [max - 1n, 1n, max], [max, max, max],
    [min, 0n, max], [max, min, max], [min, max, min], [0n, 0n, min]
  ];
  for (const [used, reserved, limit] of states) {
    for (const requested of [min, -1n, 0n, 1n, 9n, 10n, 11n, 20n, max]) {
      const usage = { used: String(used), reserved: String(reserved), limit: String(limit) };
      // BigInt oracle intentionally computes a mathematical sum wider than i64.
      const allowed = [used, reserved, limit, requested].every(n => n >= 0n) && used + reserved + requested <= limit;
      add('quota', `used${used}-reserved${reserved}-limit${limit}-request${requested}`, [usage, String(requested)], allowed, 'Bool');
    }
  }
  return cases;
}
