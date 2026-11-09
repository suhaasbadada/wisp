export interface Sale { quantity: bigint; unit_cents: bigint; discount_bps: bigint }
export function unit_net(sale: Sale): bigint { return sale.unit_cents * (10000n - sale.discount_bps) / 10000n; }
export function refund(sale: Sale, returned: bigint): bigint {
  const count = returned <= 0n ? 0n : returned > sale.quantity ? sale.quantity : returned;
  return unit_net(sale) * count;
}
