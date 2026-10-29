// The recipe « Detail columns that follow the master's » (docs/behaviors/master-detail.md, step 16c, owner Q16-4 A):
// the app keeps the outer grid's column state in a new `context`; each nested grid's settings reorder, hide and
// size the shared ids. Nothing in the grid: the test proves the recipe works as written. Expectations by hand.
import { describe, it, expect, afterEach } from 'vitest';
import { dataKey, type ColumnDef, type ColumnState } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import { detail, nestedGrid } from '../src/detail.js';
import { EN } from '../src/locales/en.js';
import { EN_DETAIL } from '../src/locales/en-detail.js';

type R = { id: string; a: string; b: string; c: string };
const COLS: ColumnDef<R, any>[] = [{ id: 'a', header: 'A', width: 100 }, { id: 'b', header: 'B', width: 100 }, { id: 'c', header: 'C', width: 100 }];
const MSG = { ...EN, text: { ...EN.text, ...EN_DETAIL.text } };
const grids: GridInstance<any>[] = [];
afterEach(() => { for (const g of grids.splice(0)) g.destroy(); document.body.innerHTML = ''; });
const geo = (block: number) => {
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block, inline: 600, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
  return geometry;
};

/** The app's ten lines (the sheet's recipe): the detail's columns in the outer grid's order, hidden and widths. */
const follow = <C extends { id: string }>(cols: readonly C[], ctx: unknown): C[] => {
  const st = (ctx as { columns?: readonly ColumnState[] } | undefined)?.columns;
  if (!st) return [...cols];
  const at = new Map(st.map((s, i) => [s.id, s.order ?? i]));
  return cols.filter((c) => !st.find((s) => s.id === c.id)?.hidden)
    .map((c) => { const s = st.find((x) => x.id === c.id); return s?.width ? { ...c, width: s.width } : c; })
    .sort((x, y) => (at.get(x.id) ?? 1e9) - (at.get(y.id) ?? 1e9));
};

describe('detail columns following the master (recipe)', () => {
  it('outer column moved, a new context: the inner grid follows in place, its focus kept', async () => {
    const inner: GridInstance<R>[] = [];
    const host = document.createElement('div');
    document.body.append(host);
    const rows: R[] = [{ id: 'm1', a: 'a1', b: 'b1', c: 'c1' }, { id: 'm2', a: 'a2', b: 'b2', c: 'c2' }];
    const g = createGrid<R>(host, {
      rows, getRowId: (r) => r.id, columns: COLS, messages: MSG,
      features: [detail<R>({ height: 120, part: nestedGrid<R>({
        env: () => ({ geometry: geo(100), sync: true }),
        settings: (c) => ({ rows: [{ id: 'v1', a: 'x', b: 'y', c: 'z' }], getRowId: (r) => r.id, columns: follow(COLS, c.context), messages: MSG }),
        onGrid: (grid) => void inner.push(grid as GridInstance<R>),
      }) })],
      // The app's side: a column change outside → a new context with the outer state (as a signal would, after the event).
      onEvent: (e) => void (e.type === 'columnsChanged' && queueMicrotask(() => g.update({ context: { columns: g.kernel.columns.state() } }))),
    }, { geometry: geo(400), sync: true });
    grids.push(g);
    g.kernel.dispatch({ type: 'rows.expand', rows: [dataKey('m1')!], expanded: true }, 'api');
    expect(inner).toHaveLength(1);
    const ig = inner[0]!;
    expect(ig.kernel.columns.visible().map((c) => c.id)).toEqual(['a', 'b', 'c']);
    ig.kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: dataKey('v1')!, column: 'b' } }, 'user');
    // The user moves C first and widens B in the outer grid.
    g.kernel.dispatch({ type: 'column.state', patch: [{ id: 'c', order: 0 }, { id: 'a', order: 1 }, { id: 'b', order: 2, width: 180 }] }, 'user');
    await Promise.resolve();
    expect(inner).toHaveLength(1);
    expect(ig.kernel.columns.visible().map((c) => c.id)).toEqual(['c', 'a', 'b']);
    expect(ig.kernel.columns.get('b')!.def.width).toBe(180);
    expect(ig.kernel.focus).toEqual({ kind: 'cell', row: dataKey('v1')!, column: 'b' });
    // Hidden outside: hidden inside.
    g.kernel.dispatch({ type: 'column.state', patch: [{ id: 'a', hidden: true }] }, 'user');
    await Promise.resolve();
    expect(ig.kernel.columns.visible().map((c) => c.id)).toEqual(['c', 'b']);
  });
});
