const block = 512;
const limit = 16 * 1024 * 1024;
const encoder = new TextEncoder();
const names = new Set(['baseline.wisp', 'candidate.wisp', 'cases.json', 'review.json', 'workspace.json', 'review.html', 'README.txt', 'program.wisp', 'args.json', 'input-validation.json']);

/** Fixed regular USTAR entries only; no paths, links, scripts or host metadata. */
function header(name: string, size: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(block);
  const text = (offset: number, value: string) => bytes.set(encoder.encode(value), offset);
  const octal = (offset: number, width: number, value: number) => {
    const digits = value.toString(8);
    if (!Number.isSafeInteger(value) || value < 0 || digits.length >= width) throw new Error('Package limit');
    text(offset, digits.padStart(width - 1, '0') + '\0');
  };
  text(0, name);
  octal(100, 8, 0o600); octal(108, 8, 0); octal(116, 8, 0);
  octal(124, 12, size); octal(136, 12, 0);
  bytes.fill(32, 148, 156);
  text(156, '0'); text(257, 'ustar\0'); text(263, '00');
  const checksum = bytes.reduce((sum, byte) => sum + byte, 0);
  text(148, checksum.toString(8).padStart(6, '0') + '\0 ');
  return bytes;
}

/** Validate all names and cap the archive before aggregate Blob allocation. */
export function fixedPackage(entries: readonly (readonly [string, string])[]): Blob {
  const seen = new Set<string>();
  for (const [name] of entries) {
    if (!names.has(name) || seen.has(name)) throw new Error('Unsupported package filename');
    seen.add(name);
  }
  const segments: BlobPart[] = [];
  let total = block * 2;
  for (const [name, text] of entries) {
    const bytes = encoder.encode(text);
    const padding = (block - bytes.length % block) % block;
    total += block + bytes.length + padding;
    if (!Number.isSafeInteger(total) || total > limit) throw new Error('Package limit');
    segments.push(header(name, bytes.length), bytes, new Uint8Array(padding));
  }
  segments.push(new Uint8Array(block * 2));
  return new Blob(segments, { type: 'application/x-tar' });
}
