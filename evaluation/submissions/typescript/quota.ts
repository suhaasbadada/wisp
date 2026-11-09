export interface Usage { used: bigint; reserved: bigint; limit: bigint }
export function can_reserve(usage: Usage, requested: bigint): boolean {
  return usage.used >= 0n && usage.reserved >= 0n && usage.limit >= 0n && requested >= 0n
    && usage.used + usage.reserved + requested <= usage.limit;
}
