/** UI-only comparison of complete native transport values. No policy semantics. */
type RecordValue = Record<string, unknown>;
interface CaseValues { before: { status: string }; after: { status: string }; expected: unknown }
interface Difference { path: string; before: string; proposed: string }
export interface ValueDifferenceView { rows: Difference[]; limited: boolean; unavailable?: string }
const record = (value: unknown): value is RecordValue => value !== null && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const own = (value: RecordValue, key: string) => Object.hasOwn(value, key);
const pointer = (key: string) => key.replaceAll('~', '~0').replaceAll('/', '~1');
const scalarText = (text: string) => {
  for (const character of text) { const point = character.codePointAt(0)!; if (point >= 0xd800 && point <= 0xdfff) return false; }
  return true;
};

// Scalar slicing and JSON quoting preserve Int decimal text, Unicode, NUL and
// empty/newline output across the offline HTML round trip.
function scalar(value: string | boolean | null): { text: string; limited: boolean } {
  if (typeof value !== 'string') return { text: JSON.stringify(value), limited: false };
  let prefix = ''; let count = 0;
  for (const character of value) {
    if (count++ === 512) return { text: `${JSON.stringify(prefix)} [truncated: 512 Unicode scalars; full native JSON retained]`, limited: true };
    prefix += character;
  }
  return { text: JSON.stringify(prefix), limited: false };
}

/** Fails closed for unsupported shapes, even when both sides look identical. */
export function transportDifferences(before: unknown, proposed: unknown): ValueDifferenceView {
  const rows: Difference[] = []; let nodes = 0; let limited = false;
  let textBytes = 0; const encoder = new TextEncoder();
  const empty = Symbol('empty record');
  const present = Symbol('present record');
  const fail = (message: string): never => { throw new Error(message); };
  const flatten = (input: unknown) => {
    if (!record(input) || !own(input, 'result') || !own(input, 'output') || typeof input.output !== 'string' || !record(input.result) || !own(input.result, 'type') || typeof input.result.type !== 'string' || !own(input.result, 'value') || Object.keys(input.result).length !== 2) fail('Unsupported result/output transport shape.');
    const data = input as RecordValue & { result: RecordValue; output: string };
    const leaves = new Map<string, string | boolean | null | typeof empty | typeof present>();
    const walk = (value: unknown, path: string, depth: number): void => {
      if (++nodes > 2048) fail('UI limit: 2048 visited nodes per comparison.');
      if (path.length > 8192) fail('UI limit: field path exceeds 8192 UTF-16 units.');
      if (typeof value === 'string' && !scalarText(value)) fail('Unsupported non-scalar Unicode transport string.');
      if (typeof value === 'string' || typeof value === 'boolean' || value === null) { leaves.set(path, value); return; }
      if (!record(value)) fail('Unsupported transport value (numbers, arrays and non-JSON shapes are not compared).');
      if (depth > 16) fail('UI limit: 16 record levels.');
      const keys = Object.keys(value as RecordValue);
      if (keys.length > 32) fail('UI limit: 32 fields per record.');
      // Keep record presence so a scalar-to-record change never falsely labels
      // the existing parent path absent. Bounded leaf paths follow the marker.
      leaves.set(path, keys.length ? present : empty);
      for (const key of keys) {
        if (!scalarText(key)) fail('Unsupported non-scalar Unicode field name.');
        walk((value as RecordValue)[key], `${path}/${pointer(key)}`, depth + 1);
      }
    };
    walk(data.result.type, '/result/type', 1);
    walk(data.result.value, '/result/value', 1);
    walk(data.output, '/output', 1);
    return leaves;
  };
  try {
    const left = flatten(before); const right = flatten(proposed);
    const paths = new Set([...left.keys(), ...right.keys()]);
    const display = (values: typeof left, path: string) => {
      if (!values.has(path)) return 'absent';
      const value = values.get(path)!;
      if (value === empty) return 'present empty record {}';
      if (value === present) return 'present record (bounded leaf paths below)';
      const cell = scalar(value); limited ||= cell.limited; return cell.text;
    };
    for (const path of paths) {
      if (left.has(path) === right.has(path) && left.get(path) === right.get(path)) continue;
      if (rows.length === 64) { limited = true; continue; }
      const difference = { path: JSON.stringify(path), before: display(left, path), proposed: display(right, path) };
      const bytes = [difference.path, difference.before, difference.proposed].reduce((total, text) => total + encoder.encode(text).length, 0);
      // Two comparisons share one <=256 KiB panel; leave room for labels and
      // notices. Shape validation above completes even when rows are omitted.
      if (textBytes + bytes > 120 * 1024) { limited = true; break; }
      textBytes += bytes; rows.push(difference);
    }
    return { rows, limited };
  } catch (error) {
    return { rows: [], limited: true, unavailable: error instanceof Error ? error.message : 'Unsupported transport value.' };
  }
}

/** Shared static DOM for accepted live reports and self-contained HTML. */
export function renderValueChanges(document: Document, row: CaseValues): HTMLElement {
  const panel = document.createElement('div'); panel.className = 'value-changes';
  // Budget all generated text before append; rows leave 16 KiB for the two
  // panels' fixed labels/notices and bounded native status descriptions.
  let remaining = 256 * 1024;
  const encoder = new TextEncoder();
  const element = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) => {
    const node = document.createElement(tag);
    if (text !== undefined) {
      const bytes = encoder.encode(text).length;
      if (bytes > remaining) throw new Error('text budget');
      remaining -= bytes; node.textContent = text;
    }
    return node;
  };
  panel.append(element('p', 'Exact transport-value differences, not causal explanations, native verdicts, policy repair or approval.'));
  for (const requirements of [false, true]) {
    const details = document.createElement('details'); details.className = requirements ? 'requirement-differences' : 'observed-value-changes';
    const appendFixed = (tag: 'summary' | 'p', text: string) => { details.append(element(tag, text)); };
    appendFixed('summary', requirements ? 'Requirement differences' : 'Observed value changes');
    const unavailable = row.after.status !== 'Complete' || (!requirements && row.before.status !== 'Complete');
    const view: ValueDifferenceView = unavailable ? { rows: [], limited: false, unavailable: requirements
      ? `Unavailable: proposed native status ${scalar(row.after.status).text}; complete candidate observation required.`
      : `Unavailable: before native status ${scalar(row.before.status).text}; proposed native status ${scalar(row.after.status).text}; both complete observations required.` }
      : transportDifferences(requirements ? row.expected : row.before, row.after);
    if (view.unavailable) appendFixed('p', view.unavailable + ' No field values inferred. Full native evidence retained separately.');
    else if (!view.rows.length) appendFixed('p', 'No supported transport differences. Not a claim of universal native equivalence.');
    else {
      // An accessible table without nested HTML tr/td keeps the existing outer
      // decision table's row/cell navigation and selectors unambiguous.
      const table = document.createElement('div'); table.setAttribute('role', 'table');
      const head = document.createElement('div'); head.setAttribute('role', 'row'); table.append(head);
      for (const label of ['Literal JSON pointer path (JSON quoted)', requirements ? 'Owner-required' : 'Before', 'Proposed']) { const th = element('span', label); th.setAttribute('role', 'columnheader'); head.append(th); }
      for (const difference of view.rows) {
        const tr = document.createElement('div'); tr.setAttribute('role', 'row');
        const texts = [difference.path, difference.before, difference.proposed];
        if (texts.reduce((bytes, text) => bytes + encoder.encode(text).length, 0) > remaining - 16384) { view.limited = true; break; }
        try {
          // Detached row: budget failure cannot append a partial row.
          for (const text of texts) { const cell = element('span', text); cell.setAttribute('role', 'cell'); tr.append(cell); }
        } catch { view.limited = true; break; }
        table.append(tr);
      }
      details.append(table);
    }
    if (view.limited) appendFixed('p', 'UI limited / unsupported view; not guaranteed complete. At most 64 difference rows and 120 KiB row text per comparison; scalar prefixes at most 512 Unicode scalars. Panel text at most 256 KiB. Full native JSON retained.');
    panel.append(details);
  }
  return panel;
}
