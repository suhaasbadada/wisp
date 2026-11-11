// Edits owner JSON only: Rust remains the sole policy/type implementation.
type Value = string | boolean | { [key: string]: Value };
interface Suite { version: 1; target: string; cases: { id: string; args: Value[]; expect: { result: { type: string; value: Value }; output: string } }[] }
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const keys = (value: unknown, names: string[]): value is Record<string, unknown> => object(value) && Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name));

export function setupScenarioEditor(suite: HTMLTextAreaElement) {
  const editor = document.createElement('div'); editor.id = 'scenario-editor';
  const details = document.createElement('details');
  const summary = document.createElement('summary'); summary.textContent = 'Advanced: edit or replace the complete case suite JSON';
  const label = document.querySelector<HTMLLabelElement>('label[for="review-suite"]')!;
  label.before(editor, details); details.append(summary, label, suite);
  let generation = 0;
  function refresh() {
    const current = ++generation;
    editor.replaceChildren();
    const heading = document.createElement('h3'); heading.textContent = '2. Saved scenarios and required decisions'; editor.append(heading);
    const note = document.createElement('p'); note.textContent = 'Inputs and requirements are yours. Changing them invalidates the review; requirements are never repaired automatically. Strings stay exact strings; Rust selects and validates policy types. Duplicate scenario copies existing inputs and requirements: edit them yourself. Finite cases are not approval.'; editor.append(note);
    try {
      if (new TextEncoder().encode(suite.value).length > 65536) throw new Error();
      const parsed: unknown = JSON.parse(suite.value);
      // Exact equality excludes duplicate members and normalization of imports.
      if (JSON.stringify(parsed, null, 2) !== suite.value) throw new Error();
      let count = 1;
      const text = (value: unknown): value is string => typeof value === 'string' && !value.includes('\r');
      const value = (item: unknown, depth = 0): boolean => {
        if (++count > 2048) throw new Error('UI field limit');
        if (text(item) || typeof item === 'boolean') return true;
        return object(item) && depth < 16 && Object.keys(item).length <= 32 && Object.values(item).every(child => value(child, depth + 1));
      };
      if (!keys(parsed, ['version', 'target', 'cases']) || parsed.version !== 1 || !text(parsed.target) || !Array.isArray(parsed.cases) || parsed.cases.length < 1 || parsed.cases.length > 16 || !parsed.cases.every(row => {
        count += 3;
        return keys(row, ['id', 'args', 'expect']) && text(row.id) && Array.isArray(row.args) && row.args.every(arg => value(arg)) &&
          keys(row.expect, ['result', 'output']) && text(row.expect.output) && keys(row.expect.result, ['type', 'value']) && text(row.expect.result.type) && value(row.expect.result.value);
      })) throw new Error();
      if (count > 2048) throw new Error('UI field limit');
      const data = parsed as unknown as Suite;
      let snapshot = suite.value;
      const fresh = () => {
        if (current !== generation) return false;
        if (suite.value !== snapshot) { refresh(); return false; }
        return true;
      };
      const save = () => {
        suite.value = JSON.stringify(data, null, 2);
        suite.dispatchEvent(new Event('input'));
        snapshot = suite.value;
      };
      function field(parent: HTMLElement, name: string, initial: string | boolean, update: (value: string | boolean) => void, multiline = false) {
        const label = document.createElement('label'); label.append(document.createTextNode(`${name} `));
        const input = multiline || (typeof initial === 'string' && initial.includes('\n')) ? document.createElement('textarea') : document.createElement('input');
        if (input instanceof HTMLInputElement) input.type = typeof initial === 'boolean' ? 'checkbox' : 'text';
        if (typeof initial === 'boolean' && input instanceof HTMLInputElement) input.checked = initial; else input.value = String(initial);
        input.addEventListener('input', () => {
          if (!fresh()) return;
          update(input instanceof HTMLInputElement && input.type === 'checkbox' ? input.checked : input.value);
          save();
        });
        label.append(input); parent.append(label);
      }
      function values(parent: HTMLElement, name: string, item: Value, update: (value: Value) => void, depth = 0) {
        if (typeof item === 'object') {
          const group = document.createElement('fieldset'); const legend = document.createElement('legend'); legend.textContent = name; group.append(legend); parent.append(group);
          for (const key of Object.keys(item)) values(group, depth === 0 && name === 'Required result' ? `Required: ${key}` : `${name}.${key}`, item[key], next => { item[key] = next; }, depth + 1);
        } else field(parent, name, item, next => update(next));
      }
      const root = document.createElement('div'); root.className = 'scenario-fields'; editor.append(root);
      field(root, 'Function target', data.target, next => { data.target = String(next); });
      for (const row of data.cases) {
        const card = document.createElement('details'); card.className = 'scenario-card';
        const title = document.createElement('summary'); title.textContent = row.id; card.append(title);
        const fields = document.createElement('div'); fields.className = 'scenario-fields'; card.append(fields);
        field(fields, 'Scenario ID', row.id, next => { row.id = String(next); title.textContent = row.id; });
        row.args.forEach((arg, index) => values(fields, `Argument ${index + 1}`, arg, next => { row.args[index] = next; }));
        field(fields, 'Required result type', row.expect.result.type, next => { row.expect.result.type = String(next); });
        values(fields, 'Required result', row.expect.result.value, next => { row.expect.result.value = next; });
        field(fields, 'Required output', row.expect.output, next => { row.expect.output = String(next); }, true);
        const controls = document.createElement('div'); controls.className = 'scenario-controls'; card.append(controls);
        const duplicate = document.createElement('button'); duplicate.textContent = 'Duplicate scenario'; duplicate.disabled = data.cases.length >= 16;
        duplicate.addEventListener('click', () => {
          if (!fresh() || data.cases.length >= 16) return;
          let index = 1; while (data.cases.some(item => item.id === `case-${index}`)) index++;
          const copy = structuredClone(row); copy.id = `case-${index}`; data.cases.push(copy); save(); refresh();
        });
        const remove = document.createElement('button'); remove.textContent = 'Remove scenario'; remove.disabled = data.cases.length <= 1;
        remove.addEventListener('click', () => {
          if (!fresh() || data.cases.length <= 1) return;
          data.cases.splice(data.cases.indexOf(row), 1); save(); refresh();
        });
        controls.append(duplicate, remove); editor.append(card);
      }
    } catch (error) {
      const message = document.createElement('p'); message.textContent = error instanceof Error && error.message === 'UI field limit'
        ? 'UI field limit (2048) exceeded, not a policy validity judgment. Use the complete JSON editor below; Rust validates the suite.'
        : 'Custom or incomplete suite: use the complete JSON editor below. Forms require exact pretty-printed JSON, known fields, 1–16 cases, string/Bool/record values, LF text, at most 16 record levels and 32 fields per record, within 64 KiB. These UI limits are not a semantic validity judgment. Rust validates it when you review.';
      editor.append(message); details.open = true;
    }
  }
  return refresh;
}
