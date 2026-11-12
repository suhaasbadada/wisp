/** Read-only JSON presentation coordinates, never language decoding or typing. */
export interface JsonInputRange { start: number; end: number }

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const cap = 65_536;
const unicode = (text: string) => decoder.decode(encoder.encode(text)) === text;

/** UTF-16 textarea offsets. Any ambiguity anywhere in the document fails closed. */
export function jsonInputLocation(raw: string, pointer: string): JsonInputRange | undefined {
  if (raw.length > cap || pointer.length > cap || encoder.encode(raw).length > cap
    || raw.includes('\r') || raw.startsWith('\uFEFF') || !unicode(raw)) return;
  const parts = pointer.split('/');
  if (parts.shift() !== '' || parts.shift() !== 'args' || parts.length > 17
    || parts.some(part => /~(?![01])/u.test(part))) return;
  const path = parts.map(part => part.replace(/~1/g, '/').replace(/~0/g, '~'));
  let cursor = 0;
  let found: JsonInputRange | undefined;
  const invalid = () => { throw new Error('Unlocatable JSON'); };
  const whitespace = () => { while (/[\x20\x09\x0a]/u.test(raw[cursor] ?? '')) cursor++; };
  const number = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;
  function string(): string {
    const start = cursor++;
    while (cursor < raw.length) {
      const char = raw[cursor++];
      if (char === '\\') cursor++;
      else if (char === '"') {
        const value: unknown = JSON.parse(raw.slice(start, cursor));
        if (typeof value !== 'string' || !unicode(value)) invalid();
        return value as string;
      }
    }
    return invalid();
  }
  function value(depth: number, matched: number | undefined): void {
    whitespace(); const start = cursor;
    const char = raw[cursor];
    if (char === '[' || char === '{') {
      if (depth >= 17) invalid();
      cursor++; whitespace();
      const object = char === '{'; const close = object ? '}' : ']';
      const keys = new Set<string>(); let index = 0;
      if (raw[cursor] !== close) {
        while (true) {
          let key = String(index++);
          if (object) {
            if (raw[cursor] !== '"') invalid();
            key = string();
            if (keys.has(key)) invalid();
            keys.add(key); whitespace();
            if (raw[cursor++] !== ':') invalid();
          }
          // Comparing counted indices as strings rejects noncanonical and huge
          // pointer indices without ever converting them through floating point.
          const child = matched !== undefined && path[matched] === key ? matched + 1 : undefined;
          value(depth + 1, child); whitespace();
          if (raw[cursor] === close) break;
          if (raw[cursor++] !== ',') invalid();
          whitespace();
        }
      }
      cursor++;
    } else if (char === '"') string();
    else if (char === 't' && raw.startsWith('true', cursor)) cursor += 4;
    else if (char === 'f' && raw.startsWith('false', cursor)) cursor += 5;
    else if (char === 'n' && raw.startsWith('null', cursor)) cursor += 4;
    else {
      number.lastIndex = cursor;
      if (!number.exec(raw)) invalid();
      cursor = number.lastIndex;
    }
    if (matched === path.length) found = { start, end: cursor };
  }
  try {
    whitespace(); if (raw[cursor] !== '[') return;
    value(0, 0); whitespace();
    return cursor === raw.length ? found : undefined;
  } catch { return; }
}
