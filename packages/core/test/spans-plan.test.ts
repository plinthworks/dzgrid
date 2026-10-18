import { describe, it, expect } from 'vitest';
import { buildSpanMap, rowPlanner } from '@dzgrid/core/spans';
import type { ColumnDef } from '@dzgrid/core';
import { spanGrid, type Row } from './support/spans.js';

/**
 * The row plans the DOM lays out (step 9b blueprint B): per row, the slots
 * with no element, what a spanned cell covers and its width, what stays
 * mounted out of the column window, and the pinned cells' places.
 */
const C = (id: string, more: Partial<ColumnDef<Row>> = {}): ColumnDef<Row> => ({ id, width: 100, ...more });

describe('rowPlanner', () => {
  it('a row no span meets has no plan', () => {
    const g = spanGrid([C('a', { merge: true }), C('b')], [['x', 1], ['y', 2]]);
    const plan = rowPlanner(buildSpanMap(g.input), g.columns.layout);
    expect(plan(0)).toBeNull();
    expect(plan(1)).toBeNull();
  });

  it('a merge: its first row holds the cell, the rows under it a covered slot', () => {
    const g = spanGrid([C('p', { pinned: 'start', width: 80 }), C('a', { merge: true, pinned: 'start', width: 120 }), C('q', { pinned: 'start', width: 60 }), C('b')], [[1, 'x', 1, 1], [2, 'x', 2, 2], [3, 'y', 3, 3]]);
    const plan = rowPlanner(buildSpanMap(g.input), g.columns.layout);
    const top = plan(0)!;
    expect([...top.covered]).toEqual([]);
    expect([...top.cells]).toEqual([[1, { rows: 2, cols: 1, width: 120 }]]);
    expect(top.spans).toBe(true);
    expect(top.full).toBe(false);
    expect(top.tall).toEqual([['a', { row: 0, col: 1, rows: 2, cols: 1 }]]);
    expect(top.pinned).toEqual([['p', 0, true], ['a', 80, true], ['q', 200, true]]);
    const under = plan(1)!;
    expect([...under.covered]).toEqual([1]);
    expect([...under.cells]).toEqual([]);
    expect(under.spans).toBe(true);
    expect(under.tall).toEqual([]);
    // The covered slot leaves its place: q stays at 200.
    expect(under.pinned).toEqual([['p', 0, true], ['q', 200, true]]);
    expect(plan(2)).toBeNull();
  });

  it('a centre colspan: covered slots, its width, mounted out of the column window; no row span', () => {
    const g = spanGrid([C('a'), C('b', { colSpan: (c) => (c.index === 1 ? 3 : 1), width: 50 }), C('c', { width: 70 }), C('d'), C('e', { pinned: 'end', width: 90 })], [[1, 1, 1, 1, 1], [2, 2, 2, 2, 2]]);
    const plan = rowPlanner(buildSpanMap(g.input), g.columns.layout);
    const p = plan(1)!;
    expect([...p.covered]).toEqual([2, 3]);
    expect([...p.cells]).toEqual([[1, { rows: 1, cols: 3, width: 220 }]]);
    expect(p.mount).toEqual([1]);
    expect(p.spans).toBe(false);
    expect(p.tall).toEqual([]);
    expect(p.pinned).toEqual([['e', 0, false]]);
  });

  it('a pinned colspan is not mounted by the plan (pinned cells always are)', () => {
    const g = spanGrid([C('a', { pinned: 'start', colSpan: () => 2 }), C('b', { pinned: 'start' }), C('c')], [[1, 1, 1]]);
    const p = rowPlanner(buildSpanMap(g.input), g.columns.layout)(0)!;
    expect(p.mount).toEqual([]);
    expect([...p.cells]).toEqual([[0, { rows: 1, cols: 2, width: 200 }]]);
  });

  it('a full-width row: one cell over every column, the rest covered', () => {
    const g = spanGrid([C('a'), C('b'), C('c', { pinned: 'end' })], [['t', 1, 1], ['x', 2, 2]], { fullWidth: (r) => r['a'] === 't' });
    const plan = rowPlanner(buildSpanMap(g.input), g.columns.layout);
    const p = plan(0)!;
    expect(p.full).toBe(true);
    expect([...p.covered]).toEqual([1, 2]);
    expect([...p.cells]).toEqual([[0, { rows: 1, cols: 3, width: 300 }]]);
    expect(p.mount).toEqual([0]);
    expect(p.spans).toBe(false);
    expect(plan(1)).toBeNull();
  });
});
