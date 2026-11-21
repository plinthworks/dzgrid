// Full-row editing (1.15.0, docs/behaviors/edit-row.md): `editors({ row: rowEditor })` opens every editable cell of a
// row at once; Enter keeps the row as one gesture, Escape gives it up. Written before the code; expectations by hand.
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { ColumnDef } from '@dzgrid/core';
import type { RowRule } from '@dzgrid/core/edit';
import { rowEditor } from '../src/editors-row.js';
import { editBatch } from '../src/edit-batch.js';
import { EN_FORMS } from '../src/locales/en-forms.js';
import { BASE, EDIT, EDITORS, ECOLS, cleanup, join, k, rowsOf, tick, type R } from './support-editors.js';
import { readers } from './support-saves.js';
import { holding } from './support-saves.js';
import { ed, layout } from './support-editors.js';

afterEach(cleanup);

type B = R & { ok?: boolean | null };
const COLS: ColumnDef<B, any>[] = [...(ECOLS as ColumnDef<B, any>[]), { id: 'ok', header: 'Checked', type: 'boolean', width: 60, editable: true }];

const grid = (o: { validateRow?: RowRule<R>; batch?: boolean; rows?: B[]; columns?: ColumnDef<B, any>[]; tab?: 'grid'; texts?: boolean } = {}) => {
  const h = holding();
  const b = editBatch<R>();
  const t = ed({
    save: h.save, columns: (o.columns ?? COLS) as never, rows: (o.rows ?? rowsOf(40)) as never, // rows of the extended shape
    options: { row: rowEditor, ...(o.validateRow && { validateRow: o.validateRow }), ...(o.tab && { tab: o.tab }) },
    ...(o.batch && { features: (e, x) => [e, x, b] }),
    settings: { messages: o.texts === false ? join(BASE.en, EDIT.en, EDITORS.en) : join(BASE.en, EDIT.en, EDITORS.en, EN_FORMS) } as never, // the bundles joined
  });
  const r = readers(t);
  const fields = (id = 'r1') => [...(t.row(id)?.querySelectorAll<HTMLElement>('[data-dzg-owner=editor]') ?? [])].map((f) => f.closest<HTMLElement>('.dzg-cell')!.dataset['col']);
  const fieldOf = (col: string, id = 'r1') => t.cell(id, col)?.querySelector<HTMLInputElement>('[data-dzg-owner=editor]') ?? null;
  const focused = () => (document.activeElement as HTMLElement).closest<HTMLElement>('.dzg-cell')?.dataset['col'];
  const set = (col: string, text: string, id = 'r1') => {
    const f = fieldOf(col, id)!;
    f.value = text;
    f.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const press = (key: string, init: KeyboardEventInit = {}) => t.key(key, init);
  return { ...t, ...h, ...r, b, fields, fieldOf, focused, set, press };
};

describe('opening the row (edit-row.md 2–3, 11, 13)', () => {
  it('F2 opens every editable cell of the row, the focus in the cell started from, the row marked and said', () => {
    const t = grid();
    t.at('r1', 'n');
    t.press('F2');
    expect(t.fields()).toEqual(['name', 'n', 'q', 'ok']);
    expect(t.focused()).toBe('n');
    expect(t.fieldOf('n')!.value).toBe('1');
    expect(t.fieldOf('name')!.value).toBe('Name 1');
    expect(t.fieldOf('name')!.getAttribute('aria-label')).toBe('Name, Name 1');
    expect(t.cell('r1', 'ok')!.querySelector('input')!.type).toBe('checkbox');
    expect(t.row('r1')!.hasAttribute('data-dzg-row-editing')).toBe(true);
    expect(t.polite()).toContain('Editing row Name 1, 4 fields');
    expect(t.of('editingStarted')).toMatchObject([{ key: k('r1'), column: 'n', start: 'f2' }]);
    expect(t.cell('r1', 's')!.querySelector('[data-dzg-owner=editor]')).toBeNull();
  });

  it('a character typed opens the row with it in the started field; a double click opens it too', () => {
    const t = grid();
    t.at('r2', 'q');
    t.press('7');
    expect(t.fieldOf('q', 'r2')!.value).toBe('7');
    expect(t.fields('r2')).toEqual(['name', 'n', 'q', 'ok']);
    t.press('Escape');
    t.cell('r3', 'name')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(t.fields('r3')).toEqual(['name', 'n', 'q', 'ok']);
    expect(t.focused()).toBe('name');
  });

  it('Enter on a yes/no cell opens the row (its checkbox) instead of toggling it', () => {
    const t = grid();
    t.at('r1', 'ok');
    t.press('Enter');
    expect(t.fields()).toEqual(['name', 'n', 'q', 'ok']);
    expect(t.held).toEqual([]);
  });
});

describe('moving inside the row (edit-row.md 4)', () => {
  it('Tab and Shift+Tab go from field to field in the columns order; nothing is kept', () => {
    const t = grid();
    t.at('r1', 'name');
    t.press('F2');
    t.set('name', 'Uno');
    t.press('Tab');
    expect(t.focused()).toBe('n');
    t.press('Tab');
    expect(t.focused()).toBe('q');
    t.press('Tab', { shiftKey: true });
    expect(t.focused()).toBe('n');
    expect(t.held).toEqual([]);
    expect(t.fieldOf('name')!.value).toBe('Uno');
  });

  it('Tab past the last field keeps the row and opens the next one on its first field', () => {
    const t = grid();
    t.at('r1', 'ok');
    t.press('F2');
    t.set('n', '11');
    t.press('Tab');
    expect(t.sent()).toEqual(['r1/n=11']);
    expect(t.fields('r1')).toEqual([]);
    expect(t.fields('r2')).toEqual(['name', 'n', 'q', 'ok']);
    expect(t.focused()).toBe('name');
  });

  it("with tab: 'grid', Tab past the last field keeps the row and leaves the key to the browser", () => {
    const t = grid({ tab: 'grid' });
    t.at('r1', 'ok');
    t.press('F2');
    t.set('n', '11');
    const ev = t.press('Tab');
    expect(ev.defaultPrevented).toBe(false);
    expect(t.sent()).toEqual(['r1/n=11']);
  });
});

describe('keeping and giving up (edit-row.md 5–8)', () => {
  it('Enter keeps the whole row as one request (origin row) with the changed cells only; the cell focused', () => {
    const t = grid();
    t.at('r1', 'n');
    t.press('F2');
    t.set('n', '11');
    t.set('q', '12');
    t.press('Enter');
    expect(t.held).toHaveLength(1);
    expect(t.held[0]!.req.origin).toBe('row');
    expect(t.sent()).toEqual(['r1/n=11,r1/q=12']);
    expect(t.fields()).toEqual([]);
    expect(t.row('r1')!.hasAttribute('data-dzg-row-editing')).toBe(false);
    expect(document.activeElement).toBe(t.cell('r1', 'n'));
    expect(t.of('editingStopped')).toMatchObject([{ kept: true, via: 'enter' }]);
    // One gesture: one undo gives both back.
    t.api.undo();
    expect([t.value('r1', 'n'), t.value('r1', 'q')]).toEqual(['1', '37']);
  });

  it('a row kept unchanged sends nothing', () => {
    const t = grid();
    t.at('r1', 'n');
    t.press('F2');
    t.press('Enter');
    expect(t.held).toEqual([]);
    expect(t.of('editingStopped')).toMatchObject([{ kept: true }]);
  });

  it('a yes/no checkbox toggled by Space is kept with the row', () => {
    const t = grid();
    t.at('r1', 'ok');
    t.press('F2');
    const box = t.cell('r1', 'ok')!.querySelector('input')!;
    box.click();
    t.press('Enter');
    expect(t.sent()).toEqual(['r1/ok=true']);
  });

  it('Escape gives the whole row up: nothing kept, the values back, said', () => {
    const t = grid();
    t.at('r1', 'n');
    t.press('F2');
    t.set('n', '11');
    t.press('Escape');
    expect(t.held).toEqual([]);
    expect(t.value('r1', 'n')).toBe('1');
    expect(t.fields()).toEqual([]);
    expect(t.polite()).toContain('Row not changed');
    expect(t.of('editingStopped')).toMatchObject([{ kept: false, via: 'escape' }]);
  });

  it('a blur (the focus out of every field) keeps the row', async () => {
    const t = grid();
    t.at('r1', 'n');
    t.press('F2');
    t.set('q', '50');
    document.body.appendChild(document.createElement('button')).focus();
    await tick();
    expect(t.sent()).toEqual(['r1/q=50']);
    expect(t.fields()).toEqual([]);
  });

  it('with editBatch(): the row kept is one gesture of pending changes, nothing sent', () => {
    const t = grid({ batch: true });
    t.at('r1', 'n');
    t.press('F2');
    t.set('n', '11');
    t.set('name', 'Uno');
    t.press('Enter');
    expect(t.held).toEqual([]);
    expect(t.b.api(t.g)!.pending().map((p) => p.column)).toEqual(['name', 'n']);
  });
});

describe('checks before keeping (edit-row.md 9)', () => {
  it('a refused field keeps nothing: it is invalid, focused, the bubble and the sentence; the row stays open', () => {
    layout();
    const t = grid();
    t.at('r1', 'q');
    t.press('F2');
    t.set('n', '-1');
    t.set('q', '5');
    t.press('Enter');
    expect(t.held).toEqual([]);
    expect(t.fieldOf('n')!.getAttribute('aria-invalid')).toBe('true');
    expect(t.fieldOf('q')!.hasAttribute('aria-invalid')).toBe(false);
    expect(t.focused()).toBe('n');
    expect([...document.querySelectorAll<HTMLElement>('.dzg-bubble')].filter((b) => !b.hidden).map((b) => b.textContent)).toEqual([expect.stringMatching(/./)]);
    expect(t.loud().at(-1)).toMatch(/^Stock: value refused, /);
    expect(t.fields()).toEqual(['name', 'n', 'q', 'ok']);
    // Corrected: kept.
    t.set('n', '2');
    t.press('Enter');
    expect(t.sent()).toEqual(['r1/n=2,r1/q=5']);
  });

  it('validateRow sees every value as it would be kept; its refusal on its column keeps nothing', () => {
    const rule = vi.fn<RowRule<R>>((v) => ((v['n'] as number) > (v['q'] as number) ? { column: 'q', code: 'min' } : null));
    const t = grid({ validateRow: rule });
    t.at('r1', 'n');
    t.press('F2');
    t.set('n', '90');
    t.press('Enter');
    expect(rule.mock.calls[0]![0]).toMatchObject({ name: 'Name 1', n: 90, q: 37 });
    expect(t.held).toEqual([]);
    expect(t.focused()).toBe('q');
    expect(t.fieldOf('q')!.getAttribute('aria-invalid')).toBe('true');
    t.set('q', '95');
    t.press('Enter');
    expect(t.sent()).toEqual(['r1/n=90,r1/q=95']);
  });

  it('a value already wrong in the data, left unchanged, never blocks the row', () => {
    const rows = rowsOf(5).map((r) => (r.id === 'r1' ? { ...r, n: -5 } : r));
    const t = grid({ rows });
    t.at('r1', 'name');
    t.press('F2');
    t.set('name', 'Uno');
    t.press('Enter');
    expect(t.sent()).toEqual(['r1/name=Uno']);
  });

  it('a blur with a refused field drops what was typed and says it', async () => {
    const t = grid();
    t.at('r1', 'n');
    t.press('F2');
    t.set('n', '-1');
    document.body.appendChild(document.createElement('button')).focus();
    await tick();
    expect(t.held).toEqual([]);
    expect(t.fields()).toEqual([]);
    expect(t.loud().at(-1)).toBe('Stock: value refused, change cancelled');
  });
});

describe('set up', () => {
  it('without its texts the editors refuse to start, naming them', () => {
    expect(() => grid({ texts: false })).toThrow(/editors: missing edit\.rowEditing, edit\.rowCancelled/);
  });
});
