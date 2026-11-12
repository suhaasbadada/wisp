import { readableReview } from './readable-review';
import type { ReadableReviewSnapshot } from './readable-review';
import { fixedPackage } from './fixed-package';

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
  return fixedPackage(entries);
}
