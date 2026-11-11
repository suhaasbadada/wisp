import { readableReview } from './readable-review';
import type { ReadableReviewSnapshot } from './readable-review';

const block = 512;
const limit = 16 * 1024 * 1024;
const encoder = new TextEncoder();

const readme = `Wisp browser-to-terminal review package

This package contains full policy sources, case data and native review evidence.
Read the file contents before using or sharing them. Extract only into a new,
empty folder, never over existing sensitive files. Nothing auto-executes.

Use a TRUSTED installed Wisp compiler matching the compiler identity recorded
in review.json (also displayed in review.html). That identity is plain data,
not an installation instruction or executable command. No compiler is included.

From the new folder, these fixed commands make fresh attempts:

wisp review baseline.wisp candidate.wisp --suite cases.json
wisp check candidate.wisp

Review exit codes: 0 Pass; 1 Fail or Error; 3 Unknown; 2 host/usage failure.
A fresh attempt is not approval or authentication of the saved history.
The saved review is historical evidence, not current acceptance. Native Pass
covers finite cases only, not proof. Approval: not_granted; applied: false.
There is no Apply action and no policy-generated shell command.

Files: baseline.wisp and candidate.wisp are exact submitted UTF-8 sources;
cases.json is the exact raw submitted suite; review.json is the complete native
report; workspace.json is the browser-review-v1 workspace/evidence bundle;
review.html is the complete readable, offline review (not a filtered view).
Archive metadata is fixed for reproducibility, not timestamp authentication.
`;

/** Small private USTAR serializer, not a language implementation. */
function header(name: string, size: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(block);
  const text = (offset: number, value: string) => bytes.set(encoder.encode(value), offset);
  const octal = (offset: number, width: number, value: number) => {
    const digits = value.toString(8);
    if (!Number.isSafeInteger(value) || value < 0 || digits.length >= width) throw new Error('Package limit');
    text(offset, digits.padStart(width - 1, '0') + '\0');
  };
  // Names come only from the fixed list below, never from policy/report data.
  text(0, name);
  octal(100, 8, 0o600); octal(108, 8, 0); octal(116, 8, 0);
  octal(124, 12, size); octal(136, 12, 0);
  bytes.fill(32, 148, 156);
  text(156, '0'); text(257, 'ustar\0'); text(263, '00');
  const checksum = bytes.reduce((sum, byte) => sum + byte, 0);
  text(148, checksum.toString(8).padStart(6, '0') + '\0 ');
  return bytes;
}

/** Package an accepted snapshot without executing, filtering or mutating it.
 * Callers own the current/nonhistorical gate. The final archive is capped before
 * aggregate Blob allocation; generating HTML/encoding entries still allocates.
 */
export function reviewPackage(snapshot: Readonly<ReadableReviewSnapshot>, document: Document): Blob {
  const entries = [
    ['baseline.wisp', snapshot.baseline],
    ['candidate.wisp', snapshot.candidate],
    ['cases.json', snapshot.suite],
    ['review.json', JSON.stringify(snapshot.report, null, 2)],
    ['workspace.json', JSON.stringify({
      format: 'wisp-browser-review-v1', approval: 'not_granted', applied: false,
      baseline: snapshot.baseline, candidate: snapshot.candidate, suite_json: snapshot.suite, report: snapshot.report
    }, null, 2)],
    ['review.html', readableReview(snapshot, document)],
    ['README.txt', readme]
  ] as const;
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
