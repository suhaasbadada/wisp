/** Transport coordinates only: native UTF-8 bytes to textarea UTF-16 units.
 * Reject non-scalar strings rather than accepting TextEncoder's replacement.
 * Lines count LF, not visual columns. No language interpretation occurs here.
 */
export function diagnosticLocation(source: string, span: unknown): { start: number; end: number; line: number } | undefined {
  if (!span || typeof span !== 'object') return;
  const { start, end } = span as { start: number; end: number };
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || source.length > 65536) return;
  let bytes = 0; let units = 0; let line = 1;
  let first: number | undefined; let last: number | undefined; let firstLine = 1;
  for (const scalar of source) {
    if (bytes === start) { first = units; firstLine = line; }
    if (bytes === end) last = units;
    const cp = scalar.codePointAt(0)!;
    if (cp >= 0xd800 && cp <= 0xdfff) return;
    bytes += cp <= 0x7f ? 1 : cp <= 0x7ff ? 2 : cp <= 0xffff ? 3 : 4;
    units += scalar.length;
    if (scalar === '\n') line++;
  }
  if (bytes > 65536) return;
  if (bytes === start) { first = units; firstLine = line; }
  if (bytes === end) last = units;
  if (first === undefined || last === undefined) return;
  return { start: first, end: last, line: firstLine };
}
