// `@dzgrid/dom/range`, the paint (docs/behaviors/range-selection.md 4, 11, 14–16; step11a-plan.md « Paint »): the
// tint and the logical edges on the mounted cells at each paint — pooled, scrolled and recycled cells right, pinned
// segments, right to left, spans by their origin, details and fillers never tinted, edges on the first and last data
// rows, the tree's pinned parents tinted without aria-selected (S11-Q3), the editor's cell left alone; 100 000 rows
// and a million with scaled scrolling against the oracle.
import { describe, it, expect, afterEach } from 'vitest';
import { dataKey, type CellRange, type RowKey } from '@dzgrid/core';
import { rangeBox } from '@dzgrid/core/range';
import { definePart } from '../src/part.js';
import { detail } from '../src/detail.js';
import { tree } from '../src/tree.js';
import { spans } from '../src/spans.js';
import { edit } from '../src/edit.js';
import { editors } from '../src/editors.js';
import { EN } from '../src/locales/en.js';
import { EN_RANGE } from '../src/locales/en-range.js';
import { EN_DETAIL } from '../src/locales/en-detail.js';
import { EN_TREE } from '../src/locales/en-tree.js';
import { EN_EDIT } from '../src/locales/en-edit.js';
import { EN_EDITORS } from '../src/locales/en-editors.js';
import { cells, cleanup, ids, join, k, rmake, rowsOf, WIDE, type R , treeGrid } from './support-range.js';

afterEach(cleanup);

const R_ = (a: [string, string], f: [string, string]): CellRange => ({ anchor: { row: k(a[0]), column: a[1] }, focus: { row: k(f[0]), column: f[1] } });

/**
 * The oracle: for every mounted body cell, what it should carry — its row's display index and its column's place among
 * the visible ones against the block's box (from the corners by hand), data rows only, edges on the box's first / last
 * column and first / last data row.
 */
function expected(t: ReturnType<typeof rmake>, r: CellRange | null): Map<HTMLElement, string> {
  const out = new Map<HTMLElement, string>();
  const d = t.g.kernel.rows.displayed;
  const cols = t.ctx.columns.visible().map((c) => c.id);
  const b = r && rangeBox(r, d, cols);
  let first = -1;
  let last = -1;
  if (b) for (let i = b.top; i <= b.bottom; i++) if (d.nodeAt(d.index(i)!).kind === 'data') (first = first < 0 ? i : first), (last = i);
  for (const [key, v] of t.ctx.rowRenderer.mounted) {
    const i = d.indexOf(key);
    for (const [col, c] of v.cells) {
      const ci = cols.indexOf(col);
      const on = !!b && i >= b.top && i <= b.bottom && ci >= b.start && ci <= b.end && d.nodeAt(d.index(i)!).kind === 'data';
      out.set(c.el, on ? `range${ci === b!.start ? ' s' : ''}${ci === b!.end ? ' e' : ''}${i === first ? ' t' : ''}${i === last ? ' b' : ''} sel` : '');
    }
  }
  return out;
}
const seen = (c: HTMLElement): string => {
  const x = (n: string) => c.classList.contains(`dzg-cell--${n}`);
  return x('range') ? `range${x('rs') ? ' s' : ''}${x('re') ? ' e' : ''}${x('rt') ? ' t' : ''}${x('rb') ? ' b' : ''}${c.getAttribute('aria-selected') === 'true' ? ' sel' : ''}` : x('rs') || x('re') || x('rt') || x('rb') || c.hasAttribute('aria-selected') ? 'stale' : '';
};
const agree = (t: ReturnType<typeof rmake>) => {
  const want = expected(t, t.api().get());
  const bad: string[] = [];
  for (const [el, w] of want) if (seen(el) !== w) bad.push(`${el.dataset['col']}@${t.ctx.rowRenderer.keyOf(el.closest('.dzg-row')!)}: ${seen(el)} ≠ ${w}`);
  // No cell anywhere in the body outside the mounted rows carries a mark.
  for (const el of t.host.querySelectorAll<HTMLElement>('.dzg-layer .dzg-cell')) if (!want.has(el) && seen(el) !== '') bad.push(`unmounted ${el.dataset['col']}`);
  return bad;
};

describe('range paint: tint and logical edges', () => {
  it('tints the block\'s cells, the edges on its outside only: start, end, top, bottom', () => {
    const t = rmake();
    expect(t.api().set(R_(['r1', 'n'], ['r3', 's']))).toBe(true);
    expect(t.ranged()).toEqual(cells(ids(1, 3), ['n', 's']));
    expect([t.edges('r1', 'n'), t.edges('r1', 's'), t.edges('r2', 'n'), t.edges('r2', 's'), t.edges('r3', 'n'), t.edges('r3', 's')]).toEqual(['st', 'et', 's', 'e', 'sb', 'eb']);
    expect(t.edges('r0', 'n')).toBe('');
    expect(t.edges('r2', 'name')).toBe('');
    expect(agree(t)).toEqual([]);
  });

  it('right to left: the same logical classes (start is the first column read, whatever its side)', () => {
    const t = rmake({ lang: 'ar' });
    t.api().set(R_(['r3', 's'], ['r1', 'n']));
    expect([t.edges('r1', 'n'), t.edges('r3', 's')]).toEqual(['st', 'eb']);
  });

  it('corners in any order give the same box; a single row block has top and bottom on its cells', () => {
    const t = rmake();
    t.api().set(R_(['r2', 'q'], ['r2', 'name']));
    expect(t.ranged()).toEqual(cells(['r2'], ['name', 'n', 's', 'q']));
    expect(t.edges('r2', 'name')).toBe('stb');
    expect(t.edges('r2', 'q')).toBe('etb');
  });

  it('pooled and scrolled cells are always right: far away nothing is tinted, recycled cells are undone; back, the block again', () => {
    const t = rmake({ rows: rowsOf(2000) });
    t.api().set(R_(['r1', 'name'], ['r6', 'q']));
    expect(agree(t)).toEqual([]);
    t.scroll(32 * 1000);
    expect(t.ranged()).toEqual([]);
    expect(agree(t)).toEqual([]);
    t.scroll(0);
    expect(t.ranged()).toEqual(cells(ids(1, 6), ['name', 'n', 's', 'q']));
    expect(agree(t)).toEqual([]);
  });

  it('pinned start and end columns: each segment\'s cells, the edges in the right segments', () => {
    const columns = WIDE.map((c, i) => (i === 0 ? { ...c, pinned: 'start' as const } : i === 9 ? { ...c, pinned: 'end' as const } : c));
    for (const lang of ['en', 'ar'] as const) {
      const t = rmake({ columns, lang });
      t.api().set(R_(['r1', 'c0'], ['r2', 'c2']));
      expect(t.cell('r1', 'c0')!.closest('.dzg-seg-start')).not.toBeNull();
      expect(t.edges('r1', 'c0'), lang).toBe('st');
      expect(t.edges('r2', 'c2'), lang).toBe('eb');
      t.api().set(R_(['r1', 'c8'], ['r1', 'c9']));
      t.g.api.ensureVisible(k('r1'), 'c8');
      t.g.api.refresh();
      expect(t.cell('r1', 'c9')!.closest('.dzg-seg-end')).not.toBeNull();
      expect(t.edges('r1', 'c9'), lang).toBe('etb');
      expect(agree(t)).toEqual([]);
    }
  });

  it('spans: a cell spanning columns is tinted by its own row and first column (v1, RS 16)', () => {
    const columns = [{ id: 'name', header: 'Name', width: 120, colSpan: (c: { key: RowKey }) => (c.key === k('r2') ? 2 : 1) }, { id: 'n', header: 'N', type: 'number' as const, width: 80 }, { id: 's', header: 'S', width: 80 }];
    const t = rmake({ columns, features: (r) => [spans(), r] });
    t.api().set(R_(['r1', 'n'], ['r3', 's']));
    // r2's name covers n: no element for r2/n; the spanning cell starts outside the block, so it is not tinted.
    expect(t.cell('r2', 'n')).toBeNull();
    expect(t.ranged()).toEqual(['r1/n', 'r1/s', 'r2/s', 'r3/n', 'r3/s']);
    t.api().set(R_(['r1', 'name'], ['r3', 'n']));
    expect(t.cell('r2', 'name')!.classList.contains('dzg-cell--range')).toBe(true);
  });

  it('details are never tinted; the top and bottom edges go on the first and last DATA rows of the box', () => {
    const part = definePart('detail', { mount: (host) => ((host.textContent = 'panel'), {}) });
    const t = rmake({ messages: join(EN, EN_RANGE, EN_DETAIL), features: (r) => [detail<R>({ part, height: 64 }), r] });
    const d = () => t.g.kernel.rows.displayed;
    t.g.kernel.dispatch({ type: 'rows.expand', rows: [k('r1'), k('r3')], expanded: true }, 'api');
    expect(d().keyAt(d().index(2)!)).toBe(`x:${k('r1')}`);
    // From the detail under r1 to the detail under r3: data rows r2 and r3.
    t.api().set({ anchor: { row: `x:${k('r1')}` as RowKey, column: 'n' }, focus: { row: `x:${k('r3')}` as RowKey, column: 'n' } });
    expect(t.ranged()).toEqual(['r2/n', 'r3/n']);
    expect(t.edges('r2', 'n')).toBe('set');
    expect(t.edges('r3', 'n')).toBe('seb');
    for (const dc of t.host.querySelectorAll('.dzg-dcell')) {
      expect(dc.classList.contains('dzg-cell--range')).toBe(false);
      expect(dc.hasAttribute('aria-selected')).toBe(false);
    }
    expect(agree(t)).toEqual([]);
  });

  it('a path tree\'s fillers are never tinted nor aria-selected; the edges go on the data rows around them', () => {
    const rows: R[] = rowsOf(6).map((r, i) => ({ ...r, s: i < 3 ? 'A' : 'B' }));
    const t = rmake({ rows, messages: join(EN, EN_RANGE, EN_TREE), features: (r) => [tree<R>({ path: (x) => [x.s, x.id] }), r] });
    t.g.kernel.dispatch({ type: 'rows.expandAll', expanded: true }, 'api');
    const d = t.g.kernel.rows.displayed;
    const keys = Array.from({ length: d.count }, (_, i) => d.keyAt(d.index(i)!));
    const fillers = keys.filter((x) => String(x).startsWith('g:'));
    expect(fillers.length).toBe(2);
    t.api().set({ anchor: { row: keys[1]!, column: 'name' }, focus: { row: keys.at(-1)!, column: 'n' } });
    for (const f of fillers) {
      const cells = [...t.ctx.rowRenderer.mounted.get(f)!.cells.values()].map((c) => c.el);
      expect(cells.length).toBeGreaterThan(0);
      for (const c of cells) expect([c.classList.contains('dzg-cell--range'), c.hasAttribute('aria-selected')]).toEqual([false, false]);
    }
    expect(agree(t)).toEqual([]);
  });

  it('trees: a block across levels takes the rows shown; the pinned parents\' copies are tinted, never aria-selected (S11-Q3)', () => {
    const rows: R[] = [{ ...rowsOf(1)[0]!, id: 'S', parent: null }, ...rowsOf(60).map((r) => ({ ...r, parent: 'S' }))];
    const t = rmake({ rows, messages: join(EN, EN_RANGE, EN_TREE), features: (r) => [r, tree<R>({ parentId: (x) => x.parent ?? null })] });
    t.g.kernel.dispatch({ type: 'rows.expand', rows: [k('S')], expanded: true }, 'api');
    t.api().set(R_(['S', 'name'], ['r40', 'n']));
    t.scroll(32 * 20);
    t.g.api.refresh();
    const copy = t.host.querySelector<HTMLElement>('.dzg-sticky .dzg-row .dzg-cell[data-col="name"]')!;
    expect(copy).not.toBeNull();
    expect(copy.classList.contains('dzg-cell--range')).toBe(true);
    expect(copy.hasAttribute('aria-selected')).toBe(false);
    expect(agree(t)).toEqual([]);
    // Outside the block, the copy is plain again.
    t.api().set(R_(['r30', 'name'], ['r40', 'n']));
    expect(t.host.querySelector<HTMLElement>('.dzg-sticky .dzg-cell[data-col="name"]')!.classList.contains('dzg-cell--range')).toBe(false);
  });

  it('the cell an editor is open in keeps what it had (retained-row contract 5): neither tinted nor undone while it edits', () => {
    const columns = [{ id: 'name', header: 'Name', width: 120, editable: true }, { id: 'n', header: 'N', type: 'number' as const, width: 80, editable: true }];
    const t = rmake({ columns, messages: join(EN, EN_RANGE, EN_EDIT, EN_EDITORS), features: (r) => [edit(), editors(), r] });
    t.focus('r1');
    t.press('ArrowDown', { shiftKey: true });
    t.press('ArrowDown', { shiftKey: true });
    t.focus('r3');
    t.api().set(R_(['r1', 'name'], ['r3', 'n']));
    t.press('F2');
    const ed = t.cell('r3')!;
    expect(t.host.querySelector('.dzg-field')).not.toBeNull();
    const before = ed.className;
    expect(t.edges('r3', 'name')).toBe('sb');
    // The block grows past it: the editor's cell keeps its bottom edge while it edits.
    t.api().set(R_(['r1', 'name'], ['r5', 'n']));
    expect(ed.className).toBe(before);
    expect(t.edges('r5', 'name')).toBe('sb');
    t.api().set(R_(['r5', 'name'], ['r6', 'n']));
    expect(ed.className).toBe(before);
    expect(t.cell('r1')!.classList.contains('dzg-cell--range')).toBe(false);
  });
});

describe('range paint: many rows', () => {
  it('100 000 rows: a block of 40 000, then scrolled through: every mounted cell agrees with the oracle', () => {
    const t = rmake({ rows: rowsOf(100_000) });
    t.api().set(R_(['r30000', 'n'], ['r70000', 's']));
    for (const top of [0, 32 * 29_995, 32 * 50_000, 32 * 69_998, 32 * 99_990]) {
      t.scroll(top);
      expect(agree(t), String(top)).toEqual([]);
    }
  });

  it('a million rows, scaled scrolling: Ctrl+Shift+End from the first cell, then the middle: the mounted cells agree with the oracle', () => {
    const t = rmake({ rows: rowsOf(1_000_000), maxPhysical: 200_000 });
    t.focus('r0', 'n');
    t.press('End', { shiftKey: true, ctrlKey: true });
    expect(t.block()).toBe('r0/n:r999999/q');
    expect(agree(t)).toEqual([]);
    const mid = t.ctx.scroll.mapper!.maxLogical / 2;
    (t.g as unknown as { scroll: { scrollTo(l: number): void } }).scroll.scrollTo(mid);
    expect(t.ctx.scroll.logicalTop).toBe(mid);
    expect(t.ranged().length).toBeGreaterThan(20);
    expect(agree(t)).toEqual([]);
    void dataKey;
  });
});

describe('range paint: review of step 11a', () => {
  it('the pinned copies are tinted at the very paint that draws them (the range paint runs after the tree\'s), with the block\'s edges', () => {
    const t = treeGrid();
    t.api().set(R_(['S', 'name'], ['r40', 'n']));
    t.scroll(32 * 20);
    const copy = t.host.querySelector<HTMLElement>('.dzg-sticky .dzg-row .dzg-cell[data-col="name"]')!;
    expect(copy.classList.contains('dzg-cell--range')).toBe(true);
    expect(['rs', 'rt'].every((x) => copy.classList.contains(`dzg-cell--${x}`))).toBe(true);
  });

  it('review 7: with no block any more, the editor\'s cell keeps its classes while it edits but is no longer aria-selected', () => {
    const columns = [{ id: 'name', header: 'Name', width: 120, editable: true }, { id: 'n', header: 'N', type: 'number' as const, width: 80, editable: true }];
    const t = rmake({ columns, messages: join(EN, EN_RANGE, EN_EDIT, EN_EDITORS), features: (r) => [edit(), editors(), r] });
    t.focus('r3');
    t.api().set(R_(['r1', 'name'], ['r3', 'n']));
    t.press('F2');
    const ed = t.cell('r3')!;
    expect(ed.getAttribute('aria-selected')).toBe('true');
    t.api().clear();
    expect(ed.classList.contains('dzg-cell--range')).toBe(true);
    expect(ed.hasAttribute('aria-selected')).toBe(false);
  });
});
