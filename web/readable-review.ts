import type { ReviewReport } from './review';

export interface ReadableReviewSnapshot {
  readonly baseline: string;
  readonly candidate: string;
  readonly suite: string;
  readonly report: ReviewReport;
}

// Trusted constant only. Policy data is always inserted with textContent, never
// parsed as markup. The saved document has no scripts or external resources.
const stylesheet = `
body { font: 16px/1.5 system-ui, sans-serif; color: #18232b; background: white; margin: 2rem auto; padding: 0 1rem; max-width: 100rem; }
h1, h2 { line-height: 1.2; } .warning { border: 2px solid #835500; padding: 1rem; }
pre, td, dd { white-space: pre-wrap; overflow-wrap: anywhere; } pre { font-size: .9rem; }
dt { font-weight: bold; } dd { margin: 0 0 .5rem; }
.table-scroll { overflow-x: auto; } table { border-collapse: collapse; width: 100%; min-width: 58rem; }
th, td { text-align: left; vertical-align: top; border: 1px solid #80909b; padding: .6rem; }
caption { text-align: left; font-weight: bold; margin-bottom: .5rem; } details { margin: 1rem 0; } summary { font-weight: bold; }
@media print { body { margin: 0; max-width: none; font-size: 10pt; } .table-scroll { overflow: visible; } table { min-width: 0; } th, td { padding: .25rem; } details { break-inside: avoid; } }
`;

const json = (value: unknown) => JSON.stringify(value, null, 2) ?? 'unavailable';
function required(value: unknown): string {
  const data = value as { result?: { type?: string; value?: unknown }; output?: unknown } | undefined;
  return `Result (${data?.result?.type ?? 'unavailable'}): ${json(data?.result?.value)}\nOutput: ${typeof data?.output === 'string' ? JSON.stringify(data.output) : 'unavailable'}`;
}

/** Serialize accepted native evidence only; no execution, filtering or mutation. */
export function readableReview(snapshot: ReadableReviewSnapshot, document: Document): string {
  const doc = document.implementation.createHTMLDocument('Wisp policy review');
  const element = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) => {
    const node = doc.createElement(tag);
    if (text !== undefined) {
      // HTML parsing strips an initial LF directly inside <pre>. A child span
      // retains leading source/suite newlines after saving and reopening.
      const display = text.replaceAll('\0', '\\u0000');
      if (tag === 'pre') { const span = doc.createElement('span'); span.textContent = display; node.append(span); }
      else node.textContent = display;
    }
    return node;
  };
  const charset = element('meta'); charset.setAttribute('charset', 'utf-8');
  const csp = element('meta'); csp.httpEquiv = 'Content-Security-Policy';
  csp.content = "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";
  const viewport = element('meta'); viewport.name = 'viewport'; viewport.content = 'width=device-width, initial-scale=1';
  doc.head.prepend(charset, csp, viewport);
  doc.head.append(element('style', stylesheet));
  doc.documentElement.lang = 'en';
  const report = snapshot.report; const review = report.review;
  doc.body.append(element('h1', `Wisp policy review — native outcome: ${report.status}`));
  const warning = element('p', 'Sensitive policy data: this file contains full baseline and candidate policy sources, scenario inputs, owner requirements and native evidence. Share only with intended recipients. Historical snapshot, not current acceptance. Approval: not_granted; applied: false. Finite evidence is not proof, authorization, approval or permission to apply or deploy. Opening this file does not run policy code.');
  warning.className = 'warning'; doc.body.append(warning);
  doc.body.append(element('h2', 'Native identity'));
  const identities = element('dl');
  for (const [label, value] of [
    ['Compiler', report.compiler], ['Report revision', report.revision],
    ['Baseline revision', review?.baseline_revision], ['Candidate revision', review?.candidate_revision],
    ['Suite hash', review?.suite_hash], ['Query key', review?.query_key], ['Phase', review?.phase],
  ] as const) identities.append(element('dt', label), element('dd', value ?? 'unavailable'));
  doc.body.append(identities, element('h2', 'Native global counters'));
  const counters = element('dl');
  if (review?.summary) {
    for (const [name, value] of Object.entries(review.summary)) counters.append(element('dt', name), element('dd', String(value)));
    doc.body.append(counters);
  } else doc.body.append(element('p', 'No native counters available.'));

  const cases = review?.cases ?? [];
  doc.body.append(element('h2', 'All saved scenarios'));
  if (!cases.length) doc.body.append(element('p', 'Preflight: no case observations or case invocations. See native diagnostics below.'));
  else {
    let inputs: unknown[] = [];
    try {
      const parsed = JSON.parse(snapshot.suite);
      if (Array.isArray(parsed?.cases) && parsed.cases.length === cases.length) inputs = parsed.cases;
    } catch { /* Rejected or unmatched raw data is retained verbatim below. */ }
    const table = element('table'); table.createCaption().textContent = `All ${cases.length} native cases (including passed cases; no attention filter)`;
    const header = table.createTHead().insertRow();
    for (const text of ['Scenario / saved inputs', 'Before / baseline observed', 'Proposed / candidate observed', 'Owner-required result + output', 'Native status']) {
      const th = element('th', text); th.scope = 'col'; header.append(th);
    }
    const body = table.createTBody();
    const observation = (value: (typeof cases)[number]['before']) => `${value.status}\n${required({ result: value.result, output: value.output })}${value.diagnostics.length ? `\nNative diagnostics: ${json(value.diagnostics)}` : ''}`;
    for (const [index, row] of cases.entries()) {
      const saved = inputs[index] as { id?: unknown; args?: unknown } | undefined;
      const args = Number.isSafeInteger(row.index) && row.index === index && saved?.id === row.id && Array.isArray(saved.args) ? json(saved.args) : 'unavailable (saved suite count/index/id did not match)';
      const tr = body.insertRow();
      for (const text of [
        `${row.id}\nNative index: ${row.index}\nSaved inputs: ${args}`,
        observation(row.before), observation(row.after), required(row.expected),
        `Expectation: ${row.expectation}\nComparison: ${row.comparison}\nReason: ${row.comparison_reason}`,
      ]) tr.insertCell().textContent = text;
    }
    const scroll = element('div'); scroll.className = 'table-scroll'; scroll.append(table); doc.body.append(scroll);
  }
  doc.body.append(element('h2', 'Native diagnostics (document-owned)'));
  const diagnostics = element('ul');
  for (const diagnostic of report.diagnostics) {
    const li = element('li'); li.append(element('pre', json(diagnostic))); diagnostics.append(li);
  }
  doc.body.append(diagnostics);
  if (!report.diagnostics.length) doc.body.append(element('p', 'No report-level diagnostics. Observation diagnostics are retained above and in full native JSON.'));
  if (review?.diagnostic_document !== undefined) doc.body.append(element('pre', `Diagnostic document: ${json(review.diagnostic_document)}`));
  if (review?.cause !== undefined) doc.body.append(element('pre', `Native cause: ${json(review.cause)}`));
  doc.body.append(element('p', 'Source displays represent NUL characters as \\u0000 because HTML cannot retain them literally. The exact JSON input snapshot below preserves all input strings using JSON escapes.'));
  for (const [id, title, text] of [
    ['baseline-source', 'Full baseline source', snapshot.baseline],
    ['candidate-source', 'Full candidate source', snapshot.candidate],
    ['raw-suite', 'Full raw case suite JSON', snapshot.suite],
    ['native-report', 'Full native report JSON', json(report)],
    ['exact-inputs', 'Exact input snapshot JSON (escaped, lossless strings)', json({ baseline: snapshot.baseline, candidate: snapshot.candidate, suite_json: snapshot.suite })],
  ]) {
    const details = element('details'); const pre = element('pre', text); pre.id = id;
    details.append(element('summary', title), pre); doc.body.append(details);
  }
  return `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`;
}
