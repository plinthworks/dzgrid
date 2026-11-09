// The chevron's column and the indent, row by row (1.2.0, « étape 7 »; tree-view.md « row by row », spans.md « Across
// levels »; owner 2026-11-01): each row's toggle and indent in the column `tree({ column })` names for it, the indent
// by `tree({ indent })`, a bad answer falling back with one warning; ← / → on a node in its own column, left to right
// and right to left; the merged block of another column across the node, shrinking when it folds. Behaviour only
// (jsdom); the layout is checked in Chrome on a local page. Expectations by hand.
import { describe, it, expect, afterEach } from 'vitest';
import type { ColumnDef, Problem } from '@dzgrid/core';
import { cleanup, click, tmake, type T, type TMake } from './support-tree.js';
import { spans } from '../src/spans.js';
import type { TreeFeatureOptions } from '../src/tree.js';
import { csvExport } from '../src/export.js';
import { EN_EXPORT } from '../src/locales/en-export.js';
import { BUNDLES } from './support-tree.js';
import { read } from './support-export.js';

afterEach(cleanup);

type L = T & { grp: string };
/**
 * R (top level, always open) › line 4, 5, 6, node 7 (› 7.1, 7.2), 8; R2 (top level, closed) › line 10.
 * « grp » reads TITI on lines 5 to 8, TOTO on line 4.
 */
const ROWS: L[] = [
  { id: 'R', parent: null, name: 'table 1', n: 0, grp: 'head' },
  { id: 'l4', parent: 'R', name: 'line 4', n: 1, grp: 'TOTO' },
  { id: 'l5', parent: 'R', name: 'line 5', n: 2, grp: 'TITI' },
  { id: 'l6', parent: 'R', name: 'line 6', n: 3, grp: 'TITI' },
  { id: 'l7', parent: 'R', name: 'node 7', n: 4, grp: 'TITI' },
  { id: 'l71', parent: 'l7', name: 'line 7.1', n: 5, grp: 'TITI' },
  { id: 'l72', parent: 'l7', name: 'line 7.2', n: 6, grp: 'TITI' },
  { id: 'l8', parent: 'R', name: 'line 8', n: 7, grp: 'TITI' },
  { id: 'R2', parent: null, name: 'table 2', n: 8, grp: 'head 2' },
  { id: 'l10', parent: 'R2', name: 'line 10', n: 9, grp: 'TITI' },
];
const COLS: ColumnDef<T, any>[] = [
  { id: 'grp', header: 'Group', value: (r: T) => (r as L).grp, merge: true, width: 120 },
  { id: 'name', header: 'Label', width: 160 },
  { id: 'n', header: 'N', type: 'number', width: 100 },
];
/** The heads carry their chevron in « grp », every line in « name ». */
const byKind = (r: T) => (r.parent === null ? 'grp' : 'name');

function make(tr: Partial<TreeFeatureOptions<T>> = {}, o: Partial<TMake> = {}) {
  const t = tmake({ rows: ROWS, block: 600, tree: { column: byKind, fixedOpen: (r) => r.id === 'R', ...tr }, features: [spans({ acrossLevels: true })], ...o, settings: { columns: COLS, ...o.settings } });
  t.expand(['l7']);
  return t;
}
const problems = (t: ReturnType<typeof make>) => t.events.filter((e) => e.type === 'problems').flatMap((e) => (e as unknown as { problems: Problem[] }).problems);
const said = (t: ReturnType<typeof make>, path: string) => problems(t).filter((p) => p.path === path).map((p) => [p.code, p.detail]);
const tog = (t: ReturnType<typeof make>, id: string, col: string) => t.cell(id, col)?.querySelector<HTMLElement>(':scope > .dzg-toggle') ?? null;
const pad = (px: number) => `calc(var(--dzg-cell-padding-inline, 0.5rem) * var(--dzg-density, 1) + ${px}px)`;
const padOf = (c: HTMLElement | null) => c?.style.getPropertyValue('padding-inline-start') ?? null;

describe('tree({ column: (row) => id }): each row its own tree column', () => {
  it('the toggle and the indent go in that row’s column, nowhere else', () => {
    const t = make();
    // R2 (closed head): its toggle in « grp »; node 7 (open): in « name »; a line: a leaf's place in « name ».
    expect(tog(t, 'R2', 'grp')?.hasAttribute('data-leaf')).toBe(false);
    expect(tog(t, 'R2', 'name')).toBeNull();
    expect(tog(t, 'l7', 'name')!.hasAttribute('data-open')).toBe(true);
    expect(tog(t, 'l4', 'name')!.hasAttribute('data-leaf')).toBe(true);
    expect(tog(t, 'l4', 'grp')).toBeNull();
    // R, always open: no toggle, but its column carries the indent (level 0).
    expect(tog(t, 'R', 'grp')).toBeNull();
    expect(padOf(t.cell('R', 'grp'))).toBe(pad(0));
    expect(padOf(t.cell('l71', 'name'))).toBe(pad(32));
    expect([padOf(t.cell('l4', 'grp')), padOf(t.cell('R', 'name'))]).toEqual(['', '']);
    // The edit field's place follows (--dzg-tree-pad on the cell that carries the chevron).
    expect(t.cell('l71', 'name')!.style.getPropertyValue('--dzg-tree-pad')).toBe(pad(32));
    expect(t.cell('R2', 'grp')!.style.getPropertyValue('--dzg-tree-pad')).toBe(pad(0));
    expect(t.cell('R2', 'name')!.style.getPropertyValue('--dzg-tree-pad')).toBe('');
    // Levels for screen readers unchanged.
    expect(['R', 'l7', 'l71'].map((id) => t.row(id)!.getAttribute('aria-level'))).toEqual(['1', '2', '3']);
    expect(said(t, 'tree.column')).toEqual([]);
  });

  it('a click on node 7’s toggle (in « name ») folds it; on R2’s (in « grp ») opens it', () => {
    const t = make();
    click(tog(t, 'l7', 'name')!);
    expect(t.shown()).toEqual(['R', 'l4', 'l5', 'l6', 'l7', 'l8', 'R2']);
    click(tog(t, 'R2', 'grp')!);
    expect(t.shown()).toEqual(['R', 'l4', 'l5', 'l6', 'l7', 'l8', 'R2', 'l10']);
  });

  it('an unknown, hidden or thrown answer: the default column (the first visible), told once', () => {
    // `null as never`: a bad answer the type forbids, as plain JavaScript could give it.
    const t = make({ column: (r) => (r.id === 'l4' ? 'nope' : r.id === 'l5' ? 'n' : r.id === 'l6' ? (null as never) : r.id === 'l8' ? (() => { throw new Error('x'); })() : byKind(r)) }, {
      settings: { columns: COLS.map((c) => (c.id === 'n' ? { ...c, hidden: true } : c)) },
    });
    for (const id of ['l4', 'l5', 'l6', 'l8']) expect([id, !!tog(t, id, 'name')]).toEqual([id, false]);
    // Line 5's tall cell in « grp » runs to 7.2 (5, 6: leaves of one level in their own column; 7, 7.1, 7.2 not theirs)
    // and stops before line 8 (another level, in its own column): one toggle there, line 5's.
    for (const id of ['l4', 'l5', 'l8']) expect([id, !!tog(t, id, 'grp')]).toEqual([id, true]);
    expect([t.cell('l6', 'grp'), t.cell('l5', 'grp')!.getAttribute('aria-rowspan')]).toEqual([null, '5']);
    t.expand(['l7'], false);
    t.expand(['l7']);
    expect(said(t, 'tree.column')).toEqual([['invalid-setting', undefined]]);
  });

  it('no function: one column as before (the first visible)', () => {
    const t = make({ column: undefined });
    expect(tog(t, 'l7', 'grp')).not.toBeNull();
    expect(tog(t, 'l7', 'name')).toBeNull();
  });
});

describe('opt-in (owner 2026-11-01): spans() without acrossLevels keeps 1.1.0', () => {
  it('a tree with spans draws byte for byte the same with spans() and spans({ acrossLevels: false })', () => {
    const html = (f: ReturnType<typeof spans>) => {
      const t = tmake({ rows: ROWS, block: 600, tree: { column: 'name' }, features: [f], settings: { columns: COLS } });
      t.expand(['R', 'l7']);
      const out = t.host.querySelector('.dzg-layer')!.outerHTML;
      cleanup();
      return out;
    };
    const plain = html(spans());
    expect(html(spans({ acrossLevels: false }))).toBe(plain);
    expect(html(spans({ acrossLevels: true }))).not.toBe(plain);
  });

  it('without it the « grp » block stops at node 7’s children: 5, 6, 7 | 7.1, 7.2 | 8', () => {
    const t = make({}, { features: [spans()] });
    expect(['l5', 'l71', 'l8'].map((id) => t.cell(id, 'grp')?.getAttribute('aria-rowspan') ?? null)).toEqual(['3', '2', null]);
  });
});

describe('the merged block across a node (spans.md « Across levels »)', () => {
  it('the export builds the same map (spans: first writes TITI once over lines 5…8)', async () => {
    const got: { blob?: Blob }[] = [];
    const f = csvExport({ canExport: true, spans: 'first', tree: 'none', columns: ['name', 'grp'], deliver: (d) => void got.push(d), loadRun: () => import('../src/export/run/index.js') });
    // `as never`: the export's texts merged into the messages, which TMake's partial settings type does not name.
    const t = make({}, { features: [spans({ acrossLevels: true }), f], settings: { messages: { locale: 'en', text: { ...BUNDLES.en.text, ...EN_EXPORT.text } } } as never });
    // « name » first: the file's own tree column is its first written (csv-export.md). The whole tree (`all`: R2's line 10 too, after its head: another top-level row, never in the block).
    expect(await f.run('all')).toBe('done');
    expect((await read(got[0]!.blob!)).text).toBe(
      'Label,Group\r\ntable 1,head\r\nline 4,TOTO\r\nline 5,TITI\r\nline 6,\r\nnode 7,\r\nline 7.1,\r\nline 7.2,\r\nline 8,\r\ntable 2,head 2\r\nline 10,TITI\r\n',
    );
  });

  it('7 open: one cell over lines 5…8; folded: 5…8 without 7.1, 7.2; open again: whole', () => {
    const t = make();
    const span = () => t.cell('l5', 'grp')!.getAttribute('aria-rowspan');
    expect(span()).toBe('6');
    expect(['l6', 'l7', 'l71', 'l72', 'l8'].map((id) => t.cell(id, 'grp'))).toEqual([null, null, null, null, null]);
    expect(t.cell('l4', 'grp')!.hasAttribute('aria-rowspan')).toBe(false);
    t.expand(['l7'], false);
    expect(span()).toBe('4');
    t.expand(['l7']);
    expect(span()).toBe('6');
    // Each row keeps its own level under the tall cell.
    expect(['l5', 'l7', 'l71', 'l8'].map((id) => t.row(id)!.getAttribute('aria-level'))).toEqual(['2', '2', '3', '2']);
  });

  it('the toggle never goes into the tall cell of another column', () => {
    const t = make();
    expect(t.cell('l5', 'grp')!.querySelectorAll('.dzg-toggle').length).toBe(0);
  });
});

for (const lang of ['en', 'ar'] as const) {
  const back = lang === 'ar' ? 'ArrowRight' : 'ArrowLeft';
  const fwd = lang === 'ar' ? 'ArrowLeft' : 'ArrowRight';
  describe(`keys (${lang})`, () => {
    it('back / forward on node 7 in its column close and open it; in another column they move cell by cell', () => {
      const t = make({}, { lang });
      t.focus('l7', 'name');
      t.press(back);
      expect(t.shown()).not.toContain('l71');
      expect(t.where()).toBe('l7/name');
      t.press(fwd);
      expect(t.shown()).toContain('l71');
      // In « n » (not its tree column): back goes to « name », nothing folds.
      t.focus('l7', 'n');
      t.press(back);
      expect(t.where()).toBe('l7/name');
      expect(t.shown()).toContain('l71');
    });

    it('R2 opens from its own column « grp »; back on line 7.1 (a leaf) goes to its parent, same column', () => {
      const t = make({}, { lang });
      t.focus('R2', 'grp');
      t.press(fwd);
      expect(t.shown()).toContain('l10');
      t.focus('l71', 'name');
      t.press(back);
      expect(t.where()).toBe('l7/name');
    });

    it('the indent mirrors by itself: a logical padding', () => {
      const t = make({}, { lang });
      expect(padOf(t.cell('l71', 'name'))).toBe(pad(32));
      expect(t.cell('l71', 'name')!.style.getPropertyValue('padding-left') + t.cell('l71', 'name')!.style.getPropertyValue('padding-right')).toBe('');
    });
  });
}

describe('tree({ indent: (row, level) => px })', () => {
  it('per row, for display only; a bad answer gives level × 16, told once', () => {
    const t = make({
      // `'8' as never`: a string the type forbids, as plain JavaScript could give it.
      indent: (r, level) => (r.id === 'l71' ? 0 : r.id === 'l72' ? NaN : r.id === 'l8' ? -1 : r.id === 'l6' ? 1001 : r.id === 'l5' ? ('8' as never) : r.id === 'l4' ? (() => { throw new Error('x'); })() : level * 10),
    });
    expect(padOf(t.cell('l71', 'name'))).toBe(pad(0));
    expect(padOf(t.cell('l7', 'name'))).toBe(pad(10));
    expect(padOf(t.cell('R2', 'grp'))).toBe(pad(0));
    for (const id of ['l4', 'l5', 'l6', 'l8']) expect([id, padOf(t.cell(id, 'name'))]).toEqual([id, pad(16)]);
    expect(padOf(t.cell('l72', 'name'))).toBe(pad(32));
    expect(t.cell('l71', 'name')!.style.getPropertyValue('--dzg-tree-pad')).toBe(pad(0));
    // aria-level, keys and folding unchanged.
    expect(t.row('l71')!.getAttribute('aria-level')).toBe('3');
    t.expand(['l7'], false);
    t.expand(['l7']);
    expect(said(t, 'tree.indent')).toEqual([['invalid-setting', undefined]]);
  });

  it('1 000 is a size; a number keeps working as before', () => {
    const t = make({ indent: (r) => (r.id === 'l71' ? 1000 : 0) });
    expect(padOf(t.cell('l71', 'name'))).toBe(pad(1000));
    expect(said(t, 'tree.indent')).toEqual([]);
    const u = make({ indent: 20 });
    expect(padOf(u.cell('l71', 'name'))).toBe(pad(40));
  });
});
