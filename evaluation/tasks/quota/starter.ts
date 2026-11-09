export interface Usage { used: bigint; reserved: bigint; limit: bigint }
export function can_reserve(usage: Usage, requested: bigint): boolean {
  return requested >= 0n && requested < usage.limit - usage.used;
}
