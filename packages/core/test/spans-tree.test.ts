import { describe, it, expect } from 'vitest';
import { clientRows, createColumnModel, createKernel, dataKey, localeCtx, type ColumnDef } from '@dzgrid/core';
import { buildSpanMap, type SpanInput } from '@dzgrid/core/spans';
import { treeShape, type TreeOptions } from '@dzgrid/core/tree';
import { cellsOf, shape } from './support/spans.js';

/**
 * Merged cells inside a tree (1.1.0, step 15; docs/behaviors/spans.md « In a tree », owner Q15-1/Q15-2): siblings
 * only (rows and columns); the tree column merges leaves only (`treeColumn`); a column span touching the tree column
 * is refused (`invalid-span`, detail `tree`) and drawn unmerged; a gap (`apart`) cuts a run. Expectations by hand.
 */
type R = { id: string; p?: string | null; name: string; g: string; n: number; path?: string[] };
const k = (id: string) => dataKey(id)!;

// Roots A, B, C; A holds a1, a2, a3. Every name and label equal: only the tree decides what merges.
const ROWS: R[] = [
  { id: 'A', name: 'same', g: 'x', n: 1 },
  { id: 'a1', p: 'A', name: 'same', g: 'y', n: 1 },
  { id: 'a2', p: 'A', name: 'same', g: 'y', n: 1 },
  { id: 'a3', p: 'A', name: 'same', g: 'y', n: 1 },
  { id: 'B', name: 'same', g: 'x', n: 1 },
  { id: 'C', name: 'same', g: 'x', n: 1 },
];

function grid(defs: ColumnDef<R>[], o: { rows?: R[]; tree?: Partial<TreeOptions<R>>; open?: string[] } = {}) {
  const columns = createColumnModel<R>(defs);
  const model = clientRows<R>({ rows: o.rows ?? ROWS, getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'en-US' }), shape: treeShape<R>({ parentId: (r) => r.p, ...o.tree }) });
  const kernel = createKernel<R>({ rows: model, columns });
  if (o.open) kernel.dispatch({ type: 'rows.expand', rows: o.open.map(k), expanded: true }, 'user');
  const input = (more: Partial<SpanInput<R>> = {}): SpanInput<R> => ({ rows: model.displayed, columns, ctx: localeCtx({ locale: 'en-US' }), ...more });
  return { columns, model, kernel, input };
}

const NAME: ColumnDef<R> = { id: 'name', merge: true };
const G: ColumnDef<R> = { id: 'g', merge: true };
const N: ColumnDef<R> = { id: 'n' };

describe('siblings only', () => {
  it('A closed: the roots A, B, C are siblings and merge (label column)', () => {
    const t = grid([{ id: 'name' }, G, N]);
    expect(cellsOf(buildSpanMap(t.input()), 3, 3)).toEqual([{ row: 0, col: 1, rows: 3, cols: 1 }]);
  });

  it('A open: A alone (its children follow), a1–a3 merge, B and C merge; a parent never with its child', () => {
    const t = grid([{ id: 'name' }, G, N], { open: ['A'] });
    expect(cellsOf(buildSpanMap(t.input()), 6, 3)).toEqual([{ row: 1, col: 1, rows: 3, cols: 1 }, { row: 4, col: 1, rows: 2, cols: 1 }]);
  });

  it('opening splits the run, closing joins it again (computed on the rows shown)', () => {
    const t = grid([{ id: 'name' }, G, N]);
    const m1 = buildSpanMap(t.input());
    t.kernel.dispatch({ type: 'rows.expand', rows: [k('A')], expanded: true }, 'user');
    const m2 = buildSpanMap(t.input(), m1);
    expect(m2).not.toBe(m1);
    expect(cellsOf(m2, 6, 3).filter((s) => s.col === 1)).toEqual([{ row: 1, col: 1, rows: 3, cols: 1 }, { row: 4, col: 1, rows: 2, cols: 1 }]);
    t.kernel.dispatch({ type: 'rows.expand', rows: [k('A')], expanded: false }, 'user');
    expect(cellsOf(buildSpanMap(t.input(), m2), 3, 3)).toEqual([{ row: 0, col: 1, rows: 3, cols: 1 }]);
  });

  it('an open parent ends a run of its siblings, never starts one', () => {
    // B first (sorted by n), then A open with its children.
    const rows = ROWS.map((r) => (r.id === 'B' ? { ...r, n: 0 } : r));
    const t = grid([{ id: 'name' }, G, { id: 'n', type: 'number' }], { rows, open: ['A'] });
    t.kernel.dispatch({ type: 'query.set', query: { sort: [{ column: 'n', dir: 'asc' }], filter: {}, quick: '' } as never }, 'user');
    const d = t.model.displayed;
    expect(Array.from({ length: d.count }, (_, i) => String(d.keyAt(d.index(i)!)).replace(/^d:\d+:/, ''))).toEqual(['B', 'A', 'a1', 'a2', 'a3', 'C']);
    expect(cellsOf(buildSpanMap(t.input()), 6, 3).filter((s) => s.col === 1)).toEqual([{ row: 0, col: 1, rows: 2, cols: 1 }, { row: 2, col: 1, rows: 3, cols: 1 }]);
  });

  it('a filler (path tree) is not data: it merges with nothing', () => {
    const rows: R[] = [
      { id: 'X', path: ['X'], name: 'same', g: 'x', n: 1 },
      { id: 'r1', path: ['G', 'r1'], name: 'same', g: 'x', n: 1 },
      { id: 'Y', path: ['Y'], name: 'same', g: 'x', n: 1 },
    ];
    const t = grid([{ id: 'name' }, G], { rows, tree: { parentId: undefined, path: (r) => r.path! }, open: [] });
    // X, the filler G (closed), Y: X and Y are siblings but the filler between them cuts.
    expect(t.model.displayed.count).toBe(3);
    expect(cellsOf(buildSpanMap(t.input()), 3, 2)).toEqual([]);
  });
});

describe('the tree column: leaves only (treeColumn)', () => {
  it('without treeColumn, the tree column merges like any (A, B, C)', () => {
    const t = grid([NAME, { id: 'g' }]);
    expect(cellsOf(buildSpanMap(t.input()), 3, 2)).toEqual([{ row: 0, col: 0, rows: 3, cols: 1 }]);
  });

  it('A closed (a parent): A keeps its own cell, B and C merge', () => {
    const t = grid([NAME, { id: 'g' }]);
    const m = buildSpanMap(t.input({ treeColumn: 'name' }));
    expect(cellsOf(m, 3, 2)).toEqual([{ row: 1, col: 0, rows: 2, cols: 1 }]);
    expect(m.problems).toEqual([]);
  });

  it('A open: A alone, a1–a3 (leaves) merge, B and C merge', () => {
    const t = grid([NAME, { id: 'g' }], { open: ['A'] });
    expect(cellsOf(buildSpanMap(t.input({ treeColumn: 'name' })), 6, 2)).toEqual([{ row: 1, col: 0, rows: 3, cols: 1 }, { row: 4, col: 0, rows: 2, cols: 1 }]);
  });

  it('a leaf right before a parent never continues into it; the other columns are not touched', () => {
    // C holds c1: B (leaf) then C (parent) in the tree column stay apart; in g they merge.
    const rows = [...ROWS, { id: 'c1', p: 'C', name: 'same', g: 'z', n: 1 }];
    const t = grid([NAME, G], { rows });
    expect(cellsOf(buildSpanMap(t.input({ treeColumn: 'name' })), 3, 2)).toEqual([{ row: 0, col: 1, rows: 3, cols: 1 }]);
  });

  it('a rowSpan over a parent in the tree column is cut at it, told once (span-clipped, rows)', () => {
    const t = grid([{ id: 'name', rowSpan: (c) => (c.index === 1 ? 3 : c.index === 0 ? 2 : 1) }, { id: 'g' }]);
    // A (0) is a parent: 2 cut to 1; B (1) over C (2) reaches past the rows: 3 cut to 2 (the end of the rows, as today).
    const m = buildSpanMap(t.input({ treeColumn: 'name' }));
    expect(cellsOf(m, 3, 2)).toEqual([{ row: 1, col: 0, rows: 2, cols: 1 }]);
    expect(shape(m)).toEqual([{ code: 'span-clipped', severity: 'warning', path: 'columns.name', detail: 'rows' }]);
  });

  it('a lazy parent not loaded (children -1) counts as a parent', () => {
    const t = grid([NAME, { id: 'g' }]);
    const d = t.model.displayed;
    // The same rows, A answering « not known yet ».
    const lazy = Object.assign(Object.create(d), { childrenAt: (i: number) => (i === 0 ? -1 : (d as never as { childrenAt(i: number): number }).childrenAt(i as never)) });
    expect(cellsOf(buildSpanMap({ ...t.input({ treeColumn: 'name' }), rows: lazy }), 3, 2)).toEqual([{ row: 1, col: 0, rows: 2, cols: 1 }]);
  });
});

describe('column spans and the tree column (owner input: refused, drawn unmerged)', () => {
  it('a colSpan starting on the tree column: invalid-span (tree), one cell', () => {
    const t = grid([{ id: 'name', colSpan: () => 2 }, { id: 'g' }, N]);
    const m = buildSpanMap(t.input({ treeColumn: 'name' }));
    expect(cellsOf(m, 3, 3)).toEqual([]);
    expect(shape(m)).toEqual([0, 1, 2].map((i) => ({ code: 'invalid-span', severity: 'error', path: `rows[${i}].name.colSpan`, detail: 'tree' })));
  });

  it('a colSpan covering the tree column from before it: refused; one after it: kept', () => {
    const t = grid([{ id: 'n', colSpan: (c) => (c.index === 0 ? 2 : 1) }, { id: 'name' }, { id: 'g', colSpan: () => 2 }, { id: 'x', value: () => 1 } as ColumnDef<R>]);
    const m = buildSpanMap(t.input({ treeColumn: 'name' }));
    expect(cellsOf(m, 3, 4)).toEqual([0, 1, 2].map((row) => ({ row, col: 2, rows: 1, cols: 2 })));
    expect(shape(m)).toEqual([{ code: 'invalid-span', severity: 'error', path: 'rows[0].n.colSpan', detail: 'tree' }]);
  });

  it('a two-by-two span touching the tree column is refused whole', () => {
    const t = grid([{ id: 'n', rowSpan: (c) => (c.index === 1 ? 2 : 1), colSpan: (c) => (c.index === 1 ? 2 : 1) }, { id: 'name' }]);
    const m = buildSpanMap(t.input({ treeColumn: 'name' }));
    expect(cellsOf(m, 3, 2)).toEqual([]);
    expect(shape(m)).toEqual([{ code: 'invalid-span', severity: 'error', path: 'rows[1].n.colSpan', detail: 'tree' }]);
  });

  it('without treeColumn the same span is kept (a flat grid unchanged)', () => {
    const t = grid([{ id: 'name', colSpan: () => 2 }, { id: 'g' }]);
    expect(cellsOf(buildSpanMap(t.input()), 3, 2)).toEqual([0, 1, 2].map((row) => ({ row, col: 0, rows: 1, cols: 2 })));
  });
});

describe('apart: a row that never continues a span from the row above (a gap)', () => {
  it('cuts merges and row spans in every column; a span may start on it', () => {
    const t = grid([{ id: 'name' }, G, { id: 'n', rowSpan: (c) => (c.index === 0 ? 3 : 1) }]);
    const apart = (r: number) => r === 1;
    const m = buildSpanMap(t.input({ apart }));
    // g: A | B, C (B may start a run); n: A's 3 rows cut at B (told), B alone.
    expect(cellsOf(m, 3, 3)).toEqual([{ row: 1, col: 1, rows: 2, cols: 1 }]);
    expect(shape(m)).toEqual([{ code: 'span-clipped', severity: 'warning', path: 'columns.n', detail: 'rows' }]);
  });

  it('works on a flat grid too; apart on row 0 changes nothing', () => {
    const t = grid([{ id: 'name' }, G]);
    expect(cellsOf(buildSpanMap(t.input({ apart: (r) => r === 0 })), 3, 2)).toEqual([{ row: 0, col: 1, rows: 3, cols: 1 }]);
  });
});

describe('memo', () => {
  it('the same apart and treeColumn keep the map; a new apart or another treeColumn builds again', () => {
    const t = grid([NAME, G]);
    const apart = () => false;
    const m1 = buildSpanMap(t.input({ apart, treeColumn: 'name' }));
    expect(buildSpanMap(t.input({ apart, treeColumn: 'name' }), m1)).toBe(m1);
    const m2 = buildSpanMap(t.input({ apart: () => false, treeColumn: 'name' }), m1);
    expect(m2).not.toBe(m1);
    const m3 = buildSpanMap(t.input({ apart, treeColumn: 'g' }), m2);
    expect(m3).not.toBe(m2);
    expect(buildSpanMap(t.input({ apart }), m3)).not.toBe(m3);
  });
});
