export function slabs(extra: bigint): bigint { return extra / 500n; }
export function quote(weight: bigint, remote: boolean): bigint {
  if (weight === 0n) return 0n;
  const extra = weight > 1000n ? slabs(weight - 1000n + 499n) * 120n : 0n;
  return 500n + extra + (remote ? 175n : 0n);
}
