/** Exact LF-terminated line tokens: no synthetic empty line after a final LF. */
function lines(source: string): string[] {
  return source.match(/[^\n]*\n|[^\n]+$/g) ?? [];
}

// Display escapes only; never used to compare or rewrite the saved sources.
function visible(text: string): string {
  return text.replace(/[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g,
    char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

/** Bounded presentation of saved source strings. No parsing or execution. */
export function renderSourceChanges(doc: Document, baseline: string, candidate: string): HTMLDetailsElement {
  const element = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) => {
    const node = doc.createElement(tag);
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const before = lines(baseline); const after = lines(candidate);
  let prefix = 0; let suffix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix++;
  while (suffix < before.length - prefix && suffix < after.length - prefix &&
    before[before.length - suffix - 1] === after[after.length - suffix - 1]) suffix++;
  const identical = baseline === candidate;
  const details = element('details'); details.id = 'review-source-changes'; details.className = 'source-changes';
  details.append(element('summary', 'Source changes — saved submitted inputs'));
  details.append(element('p', 'Text comparison, not semantic diff/preservation proof; one region, not minimal edit script. The middle may include unchanged interior lines. Up to three common context lines at each edge; at most 200 displayed lines per side (400 combined).'));
  details.append(element('p', identical
    ? 'No textual changes. This is not a semantic identity proof.'
    : '− Baseline middle / + Candidate middle; = common context. Labels describe text, not approval.'));
  details.append(element('p', 'Line tokens include their trailing LF; no extra line is invented after a terminal LF. Blank lines and LF/no-LF endings are labeled. Control characters are displayed as \\uXXXX escapes (including NUL as \\u0000); literal backslashes remain literal. Display is not a lossless encoding: full sources and exact JSON remain available in downloads. No trimming, sorting or whitespace repair.'));
  const grid = element('div'); grid.className = 'source-change-grid';
  for (const [label, source, tokens, sign] of [
    ['Baseline', baseline, before, '−'], ['Candidate', candidate, after, '+'],
  ] as const) {
    const side = element('section'); side.className = 'source-change-side'; side.dataset.side = label.toLowerCase();
    side.append(element('h4', label));
    side.append(element('p', `${new TextEncoder().encode(source).length} UTF-8 bytes · ${tokens.length} line tokens · Final LF: ${source.endsWith('\n') ? 'present' : source.length ? 'absent' : 'absent (empty source)'}`));
    if (identical) {
      side.append(element('p', source.length ? 'Identical text; no changed region to display.' : 'Empty source (0 lines).'));
      grid.append(side); continue;
    }
    const start = Math.max(0, prefix - 3);
    const end = Math.min(tokens.length, tokens.length - suffix + 3);
    const omitted = (from: number, to: number, reason: string) => {
      if (to <= from) return;
      const note = element('p', `Omitted ${to - from} lines (${from + 1}–${to}): ${reason}.`);
      note.className = 'source-omission'; side.append(note);
    };
    omitted(0, start, 'outside context window');
    const count = end - start;
    if (!tokens.length) side.append(element('p', 'Empty source (0 lines).'));
    else if (!count) side.append(element('p', 'No lines on this side of the region.'));
    for (let index = start; index < end; index++) {
      if (count > 200 && index === start + 100) {
        omitted(index, end - 100, '200-line display cap; unchanged interior may also be omitted');
        index = end - 100;
      }
      const token = tokens[index]; const lf = token.endsWith('\n');
      const body = lf ? token.slice(0, -1) : token;
      const context = index < prefix || index >= tokens.length - suffix;
      const row = element('div'); row.className = `source-line ${context ? 'source-context' : sign === '−' ? 'source-before' : 'source-after'}`;
      row.append(element('span', `${context ? '=' : sign} ${index + 1}`)); row.firstElementChild!.className = 'source-line-number';
      // Span inside pre survives HTML's initial-LF stripping when saved offline.
      const pre = element('pre'); const code = element('span', visible(body)); code.className = 'source-line-text'; pre.append(code);
      const ending = element('span', `${body.length ? '' : '[blank line] · '}${lf ? 'LF' : 'no LF'}`); ending.className = 'source-line-ending';
      row.append(pre, ending); side.append(row);
    }
    omitted(end, tokens.length, 'outside context window');
    grid.append(side);
  }
  details.append(grid);
  return details;
}
