import { describe, it, expect } from 'vitest';
import { clientRows, createColumnModel, createKernel, dataKey, localeCtx, type ColumnDef } from '@dzgrid/core';
import { buildSpanMap, type SpanInput } from '@dzgrid/core/spans';
import { treeShape } from '@dzgrid/core/tree';
import { cellsOf, shape } from './support/spans.js';

/**
 * Merges across a node and its children (1.2.0, « étape 7 »; spans.md « Across levels », owner 2026-11-01): outside a
 * row's tree column, two consecutive rows link when they are siblings or when neither is a top-level row; in a row's
 * own tree column, the step 15 rule (one level, leaves only). The tree column may be given per row (`treeColumn` as a
 * function of the row). Opt-in (`acrossLevels`, owner 2026-11-01): on here; off, the 1.1.0 rule. Expectations by hand.
 */
type R = { id: string; p: string | null; group: string; label: string; n: number };
const k = (id: string) => dataKey(id)!;

// Two tables, each led by a top-level row always open (R, R2). Under R: lines 4, 5, 6, the node 7 (7.1, 7.2), 8.
const ROWS: R[] = [
  { id: 'R', p: null, group: 'TITI', label: 'table 1', n: 0 },
  { id: 'l4', p: 'R', group: 'TOTO', label: 'line 4', n: 0 },
  { id: 'l5', p: 'R', group: 'TITI', label: 'line 5', n: 0 },
  { id: 'l6', p: 'R', group: 'TITI', label: 'line 6', n: 0 },
  { id: 'l7', p: 'R', group: 'TITI', label: 'node 7', n: 0 },
  { id: 'l71', p: 'l7', group: 'TITI', label: 'line 7.1', n: 0 },
  { id: 'l72', p: 'l7', group: 'TITI', label: 'line 7.2', n: 0 },
  { id: 'l8', p: 'R', group: 'TITI', label: 'line 8', n: 0 },
  { id: 'R2', p: null, group: 'TITI', label: 'table 2', n: 0 },
  { id: 'l10', p: 'R2', group: 'TITI', label: 'line 10', n: 0 },
];

function grid(defs: ColumnDef<R>[], o: { rows?: R[]; open?: string[] } = {}) {
  const columns = createColumnModel<R>(defs);
  const model = clientRows<R>({ rows: o.rows ?? ROWS, getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'en-US' }), shape: treeShape<R>({ parentId: (r) => r.p, fixedOpen: (r) => r.p === null }) });
  const kernel = createKernel<R>({ rows: model, columns });
  kernel.dispatch({ type: 'rows.expand', rows: (o.open ?? ['l7']).map(k), expanded: true }, 'user');
  const input = (more: Partial<SpanInput<R>> = {}): SpanInput<R> => ({ rows: model.displayed, columns, ctx: localeCtx({ locale: 'en-US' }), acrossLevels: true, ...more });
  return { model, kernel, input };
}

const GROUP: ColumnDef<R> = { id: 'group', merge: true };
const LABEL: ColumnDef<R> = { id: 'label' };
const N: ColumnDef<R> = { id: 'n' };
/** The tables' heads carry their chevron in « group », every line in « label ». */
const byKind = (r: R): string => (r.p === null ? 'group' : 'label');
const col0 = (cells: { col: number }[]) => cells.filter((c) => c.col === 0);

describe('across a node and its children, outside its tree column', () => {
  it('7 open: lines 5, 6, 7, 7.1, 7.2, 8 are one merged cell; line 4 (another value) and the table heads stay apart', () => {
    const t = grid([GROUP, LABEL, N]);
    const m = buildSpanMap(t.input({ treeColumn: byKind }));
    expect(cellsOf(m, 10, 3)).toEqual([{ row: 2, col: 0, rows: 6, cols: 1 }]);
    expect(m.problems).toEqual([]);
  });

  it('7 folded: the block shrinks to 5, 6, 7, 8', () => {
    const t = grid([GROUP, LABEL, N], { open: [] });
    expect(t.model.displayed.count).toBe(8);
    expect(cellsOf(buildSpanMap(t.input({ treeColumn: byKind })), 8, 3)).toEqual([{ row: 2, col: 0, rows: 4, cols: 1 }]);
  });

  it('a different value inside stops the block, as always', () => {
    const rows = ROWS.map((r) => (r.id === 'l71' ? { ...r, group: 'TATA' } : r));
    const t = grid([GROUP, LABEL, N], { rows });
    expect(cellsOf(buildSpanMap(t.input({ treeColumn: byKind })), 10, 3)).toEqual([{ row: 2, col: 0, rows: 3, cols: 1 }, { row: 6, col: 0, rows: 2, cols: 1 }]);
  });

  it('one tree column for all (a string): the same rule; a top-level row (always open) never joins its lines', () => {
    // Line 4 too reads TITI: the block runs 4…8, the head R stays alone above it, R2 and line 10 apart.
    const rows = ROWS.map((r) => (r.id === 'l4' ? { ...r, group: 'TITI' } : r));
    const t = grid([GROUP, LABEL, N], { rows });
    expect(cellsOf(buildSpanMap(t.input({ treeColumn: 'label' })), 10, 3)).toEqual([{ row: 1, col: 0, rows: 7, cols: 1 }]);
  });

  it('two top-level rows next to each other still merge as siblings (step 15)', () => {
    const rows: R[] = [ROWS[0]!, { ...ROWS[8]!, p: null }];
    const t = grid([GROUP, LABEL], { rows, open: [] });
    expect(cellsOf(buildSpanMap(t.input({ treeColumn: 'label' })), 2, 2)).toEqual([{ row: 0, col: 0, rows: 2, cols: 1 }]);
  });
});

describe("in a row's own tree column: one level, leaves only", () => {
  it('« label » merging equal labels: the node 7 keeps its cell, its leaves merge, nothing crosses a level', () => {
    const rows = ROWS.map((r) => ({ ...r, label: 'same', group: 'TITI' }));
    const t = grid([GROUP, { id: 'label', merge: true }, N], { rows });
    // group (nobody's tree column but the heads'): R | 4…8 | R2 | 10. label (the lines'): 4–6, 7.1–7.2.
    expect(cellsOf(buildSpanMap(t.input({ treeColumn: byKind })), 10, 3)).toEqual([
      { row: 1, col: 0, rows: 7, cols: 1 },
      { row: 1, col: 1, rows: 3, cols: 1 },
      { row: 5, col: 1, rows: 2, cols: 1 },
    ]);
  });

  it('leaves whose tree column is « group », nodes « label »: the block runs 5…7.2 and stops before 8 (another level in its own column)', () => {
    const mixed = (r: R): string => (['l7', 'l71', 'l72'].includes(r.id) ? 'label' : 'group');
    const t = grid([GROUP, LABEL, N]);
    expect(col0(cellsOf(buildSpanMap(t.input({ treeColumn: mixed })), 10, 3))).toEqual([{ row: 2, col: 0, rows: 5, cols: 1 }]);
  });

  it('a node whose tree column is « group » keeps its cell there', () => {
    const own = (r: R): string => (r.id === 'l7' || r.p === null ? 'group' : 'label');
    const t = grid([GROUP, LABEL, N]);
    // 5, 6 | 7 (its chevron here) | 7.1, 7.2, 8 (7.1 cannot continue from 7 in 7's own column).
    expect(col0(cellsOf(buildSpanMap(t.input({ treeColumn: own })), 10, 3))).toEqual([{ row: 2, col: 0, rows: 2, cols: 1 }, { row: 5, col: 0, rows: 3, cols: 1 }]);
  });
});

describe('column spans against each row’s tree column', () => {
  it('a colSpan over « label » is refused on the lines (their tree column), kept on the heads', () => {
    const t = grid([{ id: 'group' }, { id: 'label', colSpan: () => 2 }, N]);
    const m = buildSpanMap(t.input({ treeColumn: byKind }));
    expect(cellsOf(m, 10, 3)).toEqual([{ row: 0, col: 1, rows: 1, cols: 2 }, { row: 8, col: 1, rows: 1, cols: 2 }]);
    expect(shape(m)).toEqual([1, 2, 3, 4, 5, 6, 7, 9].map((i) => ({ code: 'invalid-span', severity: 'error', path: `rows[${i}].label.colSpan`, detail: 'tree' })));
  });
});

describe('opt-in: without acrossLevels, the 1.1.0 rule exactly', () => {
  it('a merge stops at every level change: 5, 6, 7 | 7.1, 7.2 | 8; false is the same map as nothing', () => {
    const t = grid([GROUP, LABEL, N]);
    const off = (more: Partial<SpanInput<R>>) => { const i = t.input({ treeColumn: byKind, ...more }); delete (i as { acrossLevels?: boolean }).acrossLevels; return { ...i, ...more }; };
    const none = cellsOf(buildSpanMap(off({})), 10, 3);
    expect(none).toEqual([{ row: 2, col: 0, rows: 3, cols: 1 }, { row: 5, col: 0, rows: 2, cols: 1 }]);
    expect(JSON.stringify(cellsOf(buildSpanMap(off({ acrossLevels: false })), 10, 3))).toBe(JSON.stringify(none));
  });

  it('the option is part of the memo key', () => {
    const t = grid([GROUP, LABEL]);
    const m1 = buildSpanMap(t.input({ treeColumn: byKind }));
    expect(buildSpanMap(t.input({ treeColumn: byKind, acrossLevels: false }), m1)).not.toBe(m1);
  });
});

describe('memo', () => {
  it('the same tree column function keeps the map; another builds again', () => {
    const t = grid([GROUP, LABEL]);
    const m1 = buildSpanMap(t.input({ treeColumn: byKind }));
    expect(buildSpanMap(t.input({ treeColumn: byKind }), m1)).toBe(m1);
    expect(buildSpanMap(t.input({ treeColumn: (r) => byKind(r) }), m1)).not.toBe(m1);
  });
});

describe('a tall and wide span over a lower row\'s own tree column (review of étape 7)', () => {
  it('refused (invalid-span, detail tree), so the lower row keeps its chevron; with or without acrossLevels', () => {
    // Two siblings under R: line A (its chevron in « n ») and node B (its chevron in « label »), B a parent.
    const rows: R[] = [
      { id: 'R', p: null, group: 'x', label: 'table', n: 0 },
      { id: 'A', p: 'R', group: 'x', label: 'a', n: 0 },
      { id: 'B', p: 'R', group: 'x', label: 'b', n: 0 },
      { id: 'B1', p: 'B', group: 'y', label: 'b1', n: 0 },
    ];
    // Row 1 (line A, under the head at row 0) spans 2 rows and 2 columns: over B's « label », B's own tree column.
    const wide: ColumnDef<R> = { id: 'group', rowSpan: (x) => (x.index === 1 ? 2 : 1), colSpan: (x) => (x.index === 1 ? 2 : 1) };
    const own = (r: R): string => (r.p === null ? 'group' : r.id === 'A' ? 'n' : 'label');
    for (const acrossLevels of [true, false]) {
      const t = grid([wide, LABEL, N], { rows, open: ['B'] });
      const m = buildSpanMap(t.input({ treeColumn: own, acrossLevels }));
      expect(cellsOf(m, 4, 3)).toEqual([]);
      expect(m.problems.map((p) => [p.code, p.detail])).toEqual([['invalid-span', 'tree']]);
    }
  });
});
