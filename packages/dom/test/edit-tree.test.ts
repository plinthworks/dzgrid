// Phase 5 step 8, editing in a tree (step08-plan.md « Behaviour » 8–11; owner Q13, O7, S2-O4, S8-O4; tree-keys.md,
// editing.md): `tree({ structure })` locks the columns that feed the tree (read-only, `aria-readonly`, the core's
// `edit-structure` told once), a path tree's own column by default and again when it changes; the field starts after
// the indent and the chevron (a variable and one rule, mirrored right to left); Left and Right in the field are its
// caret's, `*` there is typed; the chevron clicked while editing keeps the text then toggles; fillers and loading
// rows never edit; the edited name is the one said; the pinned copy of an edited parent shows the edit; an undo on a
// row under a closed parent leaves the focus where it is.
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { ColumnDef, GridEvent } from '@dzgrid/core';
import { tree, type TreeFeatureOptions } from '../src/tree.js';
import { readFileSync } from 'node:fs';
import { lazyChildren } from '../src/tree-lazy.js';
import { EN_TREE } from '../src/locales/en-tree.js';
import { AR_TREE } from '../src/locales/ar-tree.js';
import { BASE, EDIT, EDITORS, cleanup, ed, join, k, tick } from './support-editors.js';

afterEach(cleanup);

type N = { id: string; pid: string | null; name: string; n: number; s: string; q: number; path?: string[]; kids?: boolean };
const ROWS = (): N[] => [
  { id: 'S0', pid: null, name: 'Service 0', n: 0, s: '', q: 0, path: ['Service 0'] },
  { id: 'P1', pid: 'S0', name: 'Patient 1', n: 1, s: '', q: 1, path: ['Service 0', 'Patient 1'] },
  { id: 'V1', pid: 'P1', name: 'Visit 1', n: 2, s: '', q: 2, path: ['Service 0', 'Patient 1', 'Visit 1'] },
  { id: 'V2', pid: 'P1', name: 'Visit 2', n: 3, s: '', q: 3, path: ['Service 0', 'Patient 1', 'Visit 2'] },
  { id: 'P2', pid: 'S0', name: 'Patient 2', n: 4, s: '', q: 4, path: ['Service 0', 'Patient 2'] },
  { id: 'S1', pid: null, name: 'Service 1', n: 5, s: '', q: 5, path: ['Service 1'] },
  { id: 'P3', pid: 'S1', name: 'Patient 3', n: 6, s: '', q: 6, path: ['Service 1', 'Patient 3'] },
];
const COLS: ColumnDef<N, any>[] = [
  { id: 'name', header: 'Name', width: 200, editable: true },
  { id: 'n', header: 'Stock', type: 'number', width: 100, editable: true },
  { id: 'pid', header: 'Parent', width: 100, editable: true },
  { id: 'q', header: 'Price', type: 'number', width: 100, editable: true },
];

function tr(o: Partial<TreeFeatureOptions<N>> = { parentId: (r) => r.pid }, more: { lang?: 'en' | 'ar'; rows?: N[]; columns?: ColumnDef<N, any>[] } = {}) {
  const lang = more.lang ?? 'en';
  const t = ed({
    lang, rows: (more.rows ?? ROWS()) as never, columns: (more.columns ?? COLS) as never,
    settings: { messages: join(BASE[lang], EDIT[lang], EDITORS[lang], lang === 'ar' ? AR_TREE : EN_TREE) },
    features: (e, x) => [tree<N>(o as TreeFeatureOptions<N>) as never, e, x],
  });
  t.g.kernel.dispatch({ type: 'rows.expandAll', expanded: true }, 'api');
  t.events.splice(0, t.events.length, ...t.events.filter((e) => e.type === 'problems'));
  return t;
}
const told = (t: ReturnType<typeof ed>) => t.events.filter((e): e is Extract<GridEvent<never>, { type: 'problems' }> => e.type === 'problems').flatMap((e) => e.problems).filter((p) => p.code === 'edit-structure').map((p) => p.path);
const editable = (t: ReturnType<typeof ed>, id: string, col: string) => t.g.kernel.editable(k(id), col);

describe('tree({ structure }): the columns that feed the tree are read-only (Q13, O7)', () => {
  it('parentId with structure [pid]: Parent read-only (aria-readonly, F2 nothing), told once; the others editable', () => {
    const t = tr({ parentId: (r) => r.pid, structure: ['pid'] });
    expect(editable(t, 'P1', 'pid')).toBe(false);
    expect(t.cell('P1', 'pid')!.getAttribute('aria-readonly')).toBe('true');
    t.at('P1', 'pid');
    t.key('F2');
    expect(t.field()).toBeNull();
    expect([editable(t, 'P1', 'name'), editable(t, 'P1', 'n')]).toEqual([true, true]);
    t.g.kernel.dispatch({ type: 'rows.expand', rows: [k('S1')], expanded: false }, 'api');
    expect(told(t)).toEqual(['columns.pid.editable']);
  });

  it('parentId without structure: nothing locked (the tree column edits)', () => {
    const t = tr();
    expect([editable(t, 'P1', 'name'), editable(t, 'P1', 'pid')]).toEqual([true, true]);
    expect(told(t)).toEqual([]);
  });

  it('a path tree: its own column locked by default (its labels are the path); structure [] unlocks it', () => {
    const t = tr({ path: (r) => r.path! });
    expect(editable(t, 'P1', 'name')).toBe(false);
    expect(t.cell('P1', 'name')!.getAttribute('aria-readonly')).toBe('true');
    expect(editable(t, 'P1', 'n')).toBe(true);
    expect(told(t)).toEqual(['columns.name.editable']);
    cleanup();
    const u = tr({ path: (r) => r.path!, structure: [] });
    expect(editable(u, 'P1', 'name')).toBe(true);
    expect(told(u)).toEqual([]);
  });

  it('a path tree whose tree column changes (the first visible one hidden): the new one locked, the old one freed, said again only when it changes', () => {
    const t = tr({ path: (r) => r.path! });
    t.g.kernel.dispatch({ type: 'column.state', patch: [{ id: 'name', hidden: true }] }, 'api');
    expect(editable(t, 'P1', 'n')).toBe(false);
    expect(t.cell('P1', 'n')!.getAttribute('aria-readonly')).toBe('true');
    t.g.kernel.dispatch({ type: 'column.state', patch: [{ id: 'name', hidden: false }] }, 'api');
    expect([editable(t, 'P1', 'name'), editable(t, 'P1', 'n')]).toEqual([false, true]);
    expect(t.cell('P1', 'n')!.getAttribute('aria-readonly')).toBeNull();
    expect(told(t)).toEqual(['columns.name.editable', 'columns.n.editable', 'columns.name.editable']);
  });

  it('a path tree with an explicit column: that one locked', () => {
    const t = tr({ path: (r) => r.path!, column: 'q' });
    expect([editable(t, 'P1', 'q'), editable(t, 'P1', 'name')]).toEqual([false, true]);
  });
});

describe('the field in the tree column (behaviour 9–10)', () => {
  it('the cell carries its indent in --dzg-tree-pad; edit.css puts the field after the chevron (logical side)', () => {
    const t = tr();
    const pad = (px: number) => `calc(var(--dzg-cell-padding-inline, 0.5rem) + ${px}px)`;
    expect(t.cell('S0')!.style.getPropertyValue('--dzg-tree-pad')).toBe(pad(0));
    expect(t.cell('V1')!.style.getPropertyValue('--dzg-tree-pad')).toBe(pad(32));
    expect(t.cell('V1', 'n')!.style.getPropertyValue('--dzg-tree-pad')).toBe('');
    const css = readFileSync(`${process.cwd()}/packages/theme/edit.css`, 'utf8').replace(/\s+/g, ' ');
    expect(css).toContain('.dzg-toggle ~ [data-dzg-owner] { --dzg-tree-at: calc(var(--dzg-tree-pad, var(--dzg-cell-padding-inline, 0.5rem)) + var(--dzg-target-min, 24px)); inset-inline-start: var(--dzg-tree-at); }');
    // A field whose own direction is not its cell's (dir=auto): the room at its other end.
    expect(css).toContain(':dir(rtl) > .dzg-toggle ~ :dir(ltr), :dir(ltr) > .dzg-toggle ~ :dir(rtl) { inset-inline: 0 var(--dzg-tree-at); }');
    // Given back plain when the column is no longer the tree's; the new tree column carries it.
    t.g.kernel.dispatch({ type: 'column.state', patch: [{ id: 'name', hidden: true }] }, 'api');
    expect(t.cell('V1', 'n')!.style.getPropertyValue('--dzg-tree-pad')).toBe(pad(32));
    t.g.kernel.dispatch({ type: 'column.state', patch: [{ id: 'name', hidden: false }] }, 'api');
    expect(t.cell('V1', 'n')!.style.getPropertyValue('--dzg-tree-pad')).toBe('');
  });

  it('the chevron stays in the cell while the field is open, before it', () => {
    const t = tr();
    t.at('P1', 'name');
    t.key('F2');
    const c = t.cell('P1', 'name')!;
    expect(c.firstElementChild!.classList.contains('dzg-toggle')).toBe(true);
    expect(c.lastElementChild).toBe(t.field());
  });

  for (const lang of ['en', 'ar'] as const) {
    it(`Left and Right in the field are the caret's: nothing opens or closes (${lang})`, () => {
      const t = tr(undefined, { lang });
      t.at('P1', 'name');
      t.key('F2');
      const f = t.field()!;
      for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowLeft']) expect(t.key(key, {}, f).defaultPrevented, key).toBe(false);
      expect(t.of('rowExpanded')).toEqual([]);
      expect(t.row('P1')!.getAttribute('aria-expanded')).toBe('true');
      expect(t.field()).toBe(f);
    });
  }

  it('a widget a part drew in the tree column: its arrows are its own, the row never opens or closes', () => {
    const t = tr();
    const b = t.cell('P1', 'name')!.appendChild(document.createElement('button'));
    t.at('P1', 'name');
    b.focus();
    for (const key of ['ArrowLeft', 'ArrowRight']) t.key(key, {}, b);
    expect(t.of('rowExpanded')).toEqual([]);
    expect(t.row('P1')!.getAttribute('aria-expanded')).toBe('true');
  });

  it('`*`: typed in the field; on the tree column cell it opens the siblings (no field); on another editable column it starts an edit', () => {
    const t = tr();
    t.g.kernel.dispatch({ type: 'rows.expandAll', expanded: false }, 'api');
    t.at('S0', 'name');
    expect(t.key('*').defaultPrevented).toBe(true);
    expect(t.field()).toBeNull();
    expect([t.row('S0')!.getAttribute('aria-expanded'), t.row('S1')!.getAttribute('aria-expanded')]).toEqual(['true', 'true']);
    t.at('P1', 'n');
    t.key('*');
    expect(t.field()?.value).toBe('*');
    t.key('Escape', {}, t.field()!);
    t.at('P1', 'name');
    t.key('F2');
    const n = t.of('rowExpanded').length;
    const ev = t.key('*', {}, t.field()!);
    expect(ev.defaultPrevented).toBe(false);
    // P1 and P2 stay as they were (closed): the field's `*` opens nothing.
    expect(t.row('P1')!.getAttribute('aria-expanded')).toBe('false');
    expect(t.of('rowExpanded')).toHaveLength(n);
  });

  it('the chevron clicked while editing: the text kept (a blur keeps it, Q5), then the row toggles', async () => {
    const t = tr();
    t.at('P1', 'name');
    t.key('F2');
    t.type('Patient One');
    const toggle = t.cell('P1', 'name')!.querySelector<HTMLElement>('.dzg-toggle')!;
    // The browser's pointer down moves the focus off the field (to the cell), then the click.
    t.cell('P1', 'name')!.focus();
    toggle.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await tick();
    expect(t.field()).toBeNull();
    expect(t.of('cellEdited').map((e) => e.value)).toEqual(['Patient One']);
    expect(t.row('P1')!.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('fillers and loading rows never edit (D11)', () => {
  it('a path tree\'s filler: F2, a character, a double click, Delete, Backspace: nothing; Tab steps over it', () => {
    // « Service 2 » exists only as a level of P9's path: a filler.
    const rows = [...ROWS(), { id: 'P9', pid: null, name: 'Patient 9', n: 9, s: '', q: 9, path: ['Service 2', 'Patient 9'] }];
    const t = tr({ path: (r) => r.path!, structure: [] }, { rows });
    const d = t.g.kernel.rows.displayed;
    const filler = d.keyAt(d.index(d.indexOf(k('P9')) - 1)!);
    expect(String(filler).startsWith('d:')).toBe(false);
    t.g.api.focusCell(filler, 'n');
    const c = document.activeElement as HTMLElement;
    expect(c.getAttribute('aria-readonly')).toBe('true');
    for (const key of ['F2', '5', 'Delete', 'Backspace', 'Enter']) t.key(key);
    c.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(t.field()).toBeNull();
    expect(t.of('cellEdited')).toEqual([]);
    expect(t.api.commit([{ key: filler, column: 'n', input: { text: '5' } }]).refused[0]?.code).toBe('read-only');
    // Tab from the row above's last editable cell: over the filler, to P9.
    t.at('P3', 'q');
    t.key('F2');
    t.key('Tab', {}, t.field()!);
    expect(t.focusAt()).toBe('P9/name');
  });

  it('a loading row (a lazy parent opening): no field, nothing kept', () => {
    const rows = ROWS().map((r) => ({ ...r, kids: r.id === 'S1' }));
    const t = tr({ parentId: (r) => (r.id === 'P3' ? undefined : r.pid), lazy: lazyChildren<N>({ has: (r) => !!r.kids, load: () => new Promise(() => {}) }) }, { rows: rows.filter((r) => r.id !== 'P3') });
    t.g.kernel.dispatch({ type: 'rows.expand', rows: [k('S1')], expanded: true }, 'user');
    const d = t.g.kernel.rows.displayed;
    const i = d.indexOf(k('S1')) + 1;
    const loading = d.keyAt(d.index(i)!);
    expect((d as unknown as { nodeAt(i: number): { kind: string } }).nodeAt(i).kind).toBe('loading');
    t.g.api.focusCell(loading, 'n');
    for (const key of ['F2', '5', 'Delete']) t.key(key);
    (document.activeElement as HTMLElement).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(t.field()).toBeNull();
    expect(t.of('cellEdited')).toEqual([]);
  });
});

describe('what is said and shown of an edited row', () => {
  it('the edited name is the one said when the row closes (nameOf reads the edits)', async () => {
    const t = tr();
    const said: string[] = [];
    vi.spyOn(t.ctx.live, 'announce').mockImplementation((s: string) => void said.push(s));
    t.api.commit([{ key: k('P1'), column: 'name', input: { text: 'Patient One' } }]);
    t.at('P1', 'name');
    t.key('ArrowLeft');
    expect(said.at(-1)).toBe('Patient One collapsed');
  });

  it('a pinned parent\'s copy shows its edited name', () => {
    const rows: N[] = [{ id: 'S0', pid: null, name: 'Service 0', n: 0, s: '', q: 0 }, ...Array.from({ length: 60 }, (_, i): N => ({ id: `C${i}`, pid: 'S0', name: `Child ${i}`, n: i, s: '', q: i }))];
    const t = tr({ parentId: (r) => r.pid, sticky: 3 }, { rows });
    t.api.commit([{ key: k('S0'), column: 'name', input: { text: 'Ward A' } }]);
    t.scroll(20 * 32);
    const copy = t.host.querySelector<HTMLElement>('.dzg-sticky .dzg-cell[data-col="name"]')!;
    expect(copy.textContent).toBe('Ward A');
  });

  it('an undo onto a row under a closed parent (S8-O4): given back, said, the focus stays, nothing opens', async () => {
    const t = tr();
    const said: string[] = [];
    vi.spyOn(t.ctx.live, 'announce').mockImplementation((s: string) => void said.push(s));
    t.api.commit([{ key: k('V1'), column: 'n', input: { text: '50' } }]);
    t.g.kernel.dispatch({ type: 'rows.expand', rows: [k('P1')], expanded: false }, 'api');
    const at = t.at('S1', 'q');
    for (let i = 0; i < 6; i++) await Promise.resolve();
    said.length = 0;
    t.key('z', { code: 'KeyZ', ctrlKey: true });
    for (let i = 0; i < 6; i++) await Promise.resolve();
    expect(t.ctx.edit!.read(t.ctx.columns.get('n')! as never, t.g.kernel.rows.row(k('V1'))!.data, k('V1'))).toBe(2);
    expect(said).toEqual(['Undone: Stock']);
    expect(document.activeElement).toBe(at);
    expect(t.row('P1')!.getAttribute('aria-expanded')).toBe('false');
  });
});

// The test analyser's gaps (step-8 review).
describe('review gaps', () => {
  it('a children tree without structure: nothing locked', () => {
    type C = { id: string; name: string; n: number; kids?: C[] };
    const rows: C[] = [{ id: 'A', name: 'A', n: 1, kids: [{ id: 'B', name: 'B', n: 2 }] }];
    const t = tr({ children: (r: N) => (r as unknown as C).kids as never } as never, { rows: rows as never });
    expect(t.g.kernel.editable(k('A'), 'name')).toBe(true);
    expect(told(t)).toEqual([]);
  });

  it('--dzg-tree-pad follows the padding as rows change level (collapse, sort, a row re-parented by the host)', () => {
    const rows: N[] = [{ id: 'A', pid: null, name: 'A', n: 0, s: '', q: 0 }, { id: 'B', pid: 'A', name: 'B', n: 1, s: '', q: 0 }, { id: 'C', pid: 'B', name: 'C', n: 2, s: '', q: 0 }, { id: 'D', pid: null, name: 'D', n: 3, s: '', q: 0 }];
    const t = tr(undefined, { rows });
    const check = () => { for (const c of t.host.querySelectorAll<HTMLElement>('.dzg-cell[data-col="name"]')) expect(c.style.getPropertyValue('--dzg-tree-pad')).toBe(c.style.getPropertyValue('padding-inline-start')); };
    check();
    t.g.kernel.dispatch({ type: 'rows.expand', rows: [k('A')], expanded: false }, 'api');
    check();
    t.g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'n', dir: 'desc' }] }, 'api');
    check();
    t.g.kernel.dispatch({ type: 'rows.expandAll', expanded: true }, 'api');
    check();
    t.g.kernel.rows.applyTransaction({ update: [{ id: 'C', pid: null, name: 'C', n: 2, s: '', q: 0 } as never] });
    check();
    expect(t.cell('C', 'name')!.style.getPropertyValue('--dzg-tree-pad')).toBe('calc(var(--dzg-cell-padding-inline, 0.5rem) + 0px)');
  });

  it('a filler: kernel.editable false, api.commit refused read-only', () => {
    const rows = [{ id: 'V', pid: null, name: 'V', n: 1, s: '', q: 1, path: ['S', 'P', 'V'] }];
    const t = tr({ path: (r) => r.path!, structure: [] }, { rows });
    const d = t.g.kernel.rows.displayed;
    const filler = d.keyAt(d.index(0)!);
    expect(t.g.kernel.editable(filler, 'n')).toBe(false);
    expect(t.api.commit([{ key: filler, column: 'n', input: { text: '5' } }]).refused.map((r) => r.code)).toEqual(['read-only']);
  });
});
