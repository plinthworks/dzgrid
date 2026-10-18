import { describe, it, expect } from 'vitest';
import { createColumnModel, type ColumnDef, type Intent } from '@dzgrid/core';
import { missingFeatureProblems } from '@dzgrid/core/internal';
import { buildSpanMap, navigate, type NavMove, type NavShape, type SpanCell, type SpanLookup } from '@dzgrid/core/spans';
import { cellsOf, shape, spanGrid, type Row } from './support/spans.js';

/** The review and test analysis of the span engine (step 9b, commit 2). docs/behaviors/spans.md. */

const C = (id: string, more: Partial<ColumnDef<Row>> = {}): ColumnDef<Row> => ({ id, ...more });
const lookup = (cells: readonly SpanCell[], cols: number, fullWidth: readonly number[] = []): SpanLookup => ({
  ownerAt(r, c) {
    if (fullWidth.includes(r)) return { row: r, col: 0, rows: 1, cols };
    return cells.find((s) => r >= s.row && r < s.row + s.rows && c >= s.col && c < s.col + s.cols) ?? null;
  },
});
const pageDown: Intent = { kind: 'page', delta: 1 };
const pageUp: Intent = { kind: 'page', delta: -1 };
const down: Intent = { kind: 'move', axis: 'row', delta: 1 };
const right: Intent = { kind: 'move', axis: 'col', delta: 1 };
const left: Intent = { kind: 'move', axis: 'col', delta: -1 };
const home: Intent = { kind: 'edge', axis: 'col', to: 'first' };
const end: Intent = { kind: 'edge', axis: 'col', to: 'last' };
const ctrlHome: Intent = { kind: 'edge', axis: 'both', to: 'first' };
const ctrlEnd: Intent = { kind: 'edge', axis: 'both', to: 'last' };
const ctrlUp: Intent = { kind: 'edge', axis: 'row', to: 'first' };
const ctrlDown: Intent = { kind: 'edge', axis: 'row', to: 'last' };

describe('fix 1: page keys inside a cell taller than a page', () => {
  // Column 0 rows 0-9 is one cell; 12 rows, a page is 3 rows.
  const M = lookup([{ row: 0, col: 0, rows: 10, cols: 1 }], 2);
  const S: NavShape = { rows: 12, cols: 2, page: 3 };

  it('PageDown advances the goal row inside the cell, then leaves it', () => {
    const steps: NavMove[] = [];
    let at = { row: 0, col: 0 };
    let goal: { row: number; col: number } | null = null;
    for (let i = 0; i < 5; i++) {
      const mv: NavMove = navigate(M, S, at, goal, pageDown)!;
      steps.push(mv);
      at = mv.to;
      goal = mv.goal;
    }
    expect(steps).toEqual([
      { to: { row: 0, col: 0 }, goal: { row: 3, col: 0 } },
      { to: { row: 0, col: 0 }, goal: { row: 6, col: 0 } },
      { to: { row: 0, col: 0 }, goal: { row: 9, col: 0 } },
      { to: { row: 11, col: 0 }, goal: { row: 11, col: 0 } },
      { to: { row: 11, col: 0 }, goal: { row: 11, col: 0 } },
    ]);
  });

  it('PageUp climbs the same way from the bottom of the cell', () => {
    const a = navigate(M, S, { row: 0, col: 0 }, { row: 9, col: 0 }, pageUp)!;
    expect(a).toEqual({ to: { row: 0, col: 0 }, goal: { row: 6, col: 0 } });
    const b = navigate(M, S, a.to, a.goal, pageUp)!;
    expect(b).toEqual({ to: { row: 0, col: 0 }, goal: { row: 3, col: 0 } });
    expect(navigate(M, S, b.to, b.goal, pageUp)).toEqual({ to: { row: 0, col: 0 }, goal: { row: 0, col: 0 } });
  });

  it('after a page inside the cell, Down leaves from the cell bottom and Right comes out on the goal row', () => {
    const a = navigate(M, S, { row: 0, col: 0 }, null, pageDown)!;
    expect(navigate(M, S, a.to, a.goal, right)).toEqual({ to: { row: 3, col: 1 }, goal: { row: 3, col: 1 } });
    expect(navigate(M, S, a.to, a.goal, down)).toEqual({ to: { row: 10, col: 0 }, goal: { row: 10, col: 0 } });
  });

  // A cell over the whole 4x2 grid's bottom-right corner block: rows 0-3, columns 0-1.
  const B = lookup([{ row: 0, col: 0, rows: 4, cols: 2 }], 2);
  const SB: NavShape = { rows: 4, cols: 2, page: 2 };

  it('Ctrl+End and Ctrl+Home inside one cell: the goal follows the edge', () => {
    const a = navigate(B, SB, { row: 0, col: 0 }, { row: 1, col: 0 }, ctrlEnd)!;
    expect(a).toEqual({ to: { row: 0, col: 0 }, goal: { row: 3, col: 1 } });
    expect(navigate(B, SB, a.to, a.goal, ctrlHome)).toEqual({ to: { row: 0, col: 0 }, goal: { row: 0, col: 0 } });
  });

  it('Ctrl+Up and Ctrl+Down inside one cell: the goal row follows the edge, the column kept', () => {
    expect(navigate(B, SB, { row: 0, col: 0 }, { row: 1, col: 1 }, ctrlDown)).toEqual({ to: { row: 0, col: 0 }, goal: { row: 3, col: 1 } });
    expect(navigate(B, SB, { row: 0, col: 0 }, { row: 2, col: 1 }, ctrlUp)).toEqual({ to: { row: 0, col: 0 }, goal: { row: 0, col: 1 } });
  });

  it('Down at the bottom edge keeps the goal', () => {
    expect(navigate(B, SB, { row: 0, col: 0 }, { row: 1, col: 1 }, down)).toEqual({ to: { row: 0, col: 0 }, goal: { row: 1, col: 1 } });
  });

  it('a full-width row: Left, Right, Home and End keep the goal', () => {
    const F = lookup([], 4, [2]);
    const s: NavShape = { rows: 5, cols: 4, page: 2 };
    for (const k of [left, right, home, end]) {
      expect(navigate(F, s, { row: 2, col: 0 }, { row: 2, col: 2 }, k), JSON.stringify(k)).toEqual({ to: { row: 2, col: 0 }, goal: { row: 2, col: 2 } });
    }
  });

  it('Home and End inside a wide cell keep the goal column', () => {
    const W = lookup([{ row: 0, col: 0, rows: 1, cols: 3 }], 3);
    const s: NavShape = { rows: 2, cols: 3, page: 1 };
    expect(navigate(W, s, { row: 0, col: 0 }, { row: 0, col: 1 }, home)).toEqual({ to: { row: 0, col: 0 }, goal: { row: 0, col: 1 } });
    expect(navigate(W, s, { row: 0, col: 0 }, { row: 0, col: 1 }, end)).toEqual({ to: { row: 0, col: 0 }, goal: { row: 0, col: 1 } });
  });
});

describe('fix 2: a column resize does not rebuild the map', () => {
  const defs = [C('a', { merge: true }), C('b', { flex: 1 }), C('c', { pinned: 'start', colSpan: () => 3 })];
  const make = () => {
    const columns = createColumnModel<Row>(defs, { availableInline: 600 });
    const g = spanGrid(defs, [['x', 1, 1], ['x', 2, 2]], { columns });
    return { g, columns };
  };

  it('a width, then a flex reshare, give prev back', () => {
    const { g, columns } = make();
    const m1 = buildSpanMap(g.input);
    expect(shape(m1).filter((p) => p.code === 'span-clipped')).toHaveLength(1);
    const v = columns.version;
    columns.apply([{ id: 'a', width: 222 }], 'user');
    expect(columns.version).toBeGreaterThan(v);
    expect(buildSpanMap(g.input, m1)).toBe(m1);
    columns.setAvailableInline(900);
    expect(buildSpanMap(g.input, m1)).toBe(m1);
  });

  it('after a resize, a rebuild for new rows does not tell a clipped span again', () => {
    const { g, columns } = make();
    const m1 = buildSpanMap(g.input);
    columns.apply([{ id: 'a', width: 222 }], 'user');
    const rows = { ...g.rows, version: g.rows.version + 1 };
    const m2 = buildSpanMap({ ...g.input, rows }, m1);
    expect(m2).not.toBe(m1);
    expect(shape(m2).filter((p) => p.code === 'span-clipped')).toEqual([]);
  });

  it('a pin, a move, a hide or new definitions rebuild', () => {
    const changes: ((c: ReturnType<typeof make>['columns']) => void)[] = [
      (c) => c.apply([{ id: 'b', pinned: 'end' }], 'user'),
      (c) => c.apply([{ id: 'b', order: -1 }], 'user'),
      (c) => c.apply([{ id: 'b', hidden: true }], 'user'),
      (c) => c.setDefs(defs),
    ];
    for (const [i, change] of changes.entries()) {
      const { g, columns } = make();
      const m1 = buildSpanMap(g.input);
      change(columns);
      const m2 = buildSpanMap(g.input, m1);
      expect(m2, `change ${i}`).not.toBe(m1);
      // A new column layout tells its clipped spans again.
      expect(shape(m2).filter((p) => p.code === 'span-clipped'), `change ${i}`).toHaveLength(1);
    }
  });

  it('a column shown again at the end of a segment rebuilds', () => {
    const d = [C('a', { colSpan: () => 2 }), C('b', { hidden: true })];
    const columns = createColumnModel<Row>(d);
    const g = spanGrid(d, [[1, 1]], { columns });
    const m1 = buildSpanMap(g.input);
    expect(cellsOf(m1, 1, 1)).toEqual([]);
    columns.apply([{ id: 'b', hidden: false }], 'user');
    const m2 = buildSpanMap(g.input, m1);
    expect(m2).not.toBe(m1);
    expect(cellsOf(m2, 1, 2)).toEqual([{ row: 0, col: 0, rows: 1, cols: 2 }]);
  });

  it('another columns object over the same layout rebuilds (its lookup may differ)', () => {
    const d = [C('a', { merge: { within: ['b'] } }), C('b', { hidden: true })];
    const columns = createColumnModel<Row>(d);
    const g = spanGrid(d, [['x', 1], ['x', 2]], { columns });
    const m1 = buildSpanMap(g.input);
    expect(cellsOf(m1, 2, 1)).toEqual([]);
    const other = { layout: columns.layout, get: () => undefined };
    const m2 = buildSpanMap({ ...g.input, columns: other }, m1);
    expect(m2).not.toBe(m1);
    expect(shape(m2)).toEqual([{ code: 'invalid-span', severity: 'error', path: 'columns.a.merge.within', detail: 'b' }]);
  });

  it('a move inside the centre (same ids per segment, new order) rebuilds', () => {
    const d = [C('a', { colSpan: (x) => (x.index === 0 ? 2 : 1) }), C('b'), C('c')];
    const columns = createColumnModel<Row>(d);
    const g = spanGrid(d, [[1, 1, 1]], { columns });
    const m1 = buildSpanMap(g.input);
    expect(cellsOf(m1, 1, 3)).toEqual([{ row: 0, col: 0, rows: 1, cols: 2 }]);
    columns.apply([{ id: 'a', order: 5 }], 'user');
    const m2 = buildSpanMap(g.input, m1);
    expect(m2).not.toBe(m1);
    expect(cellsOf(m2, 1, 3)).toEqual([]);
  });
});

describe('fix 3: a text reader that throws', () => {
  it('the slot reads as blank, nothing merges over it, told once at the column', () => {
    const g = spanGrid([C('a', { merge: true }), C('b', { merge: true })], [['x', 'y'], ['x', 'y'], ['x', 'y'], ['x', 'y']]);
    const text = (col: { id: string }, _row: Readonly<Row>, i: number): string | null => {
      if (col.id === 'a' && i >= 1) throw new Error('boom');
      return 'same';
    };
    let m: ReturnType<typeof buildSpanMap> | undefined;
    expect(() => (m = buildSpanMap({ ...g.input, text }))).not.toThrow();
    expect(cellsOf(m!, 4, 2)).toEqual([{ row: 0, col: 1, rows: 4, cols: 1 }]);
    expect(shape(m!)).toEqual([{ code: 'invalid-span', severity: 'error', path: 'columns.a', detail: 'threw' }]);
  });

  it('a reader that throws for a within column cuts the run, told at that column', () => {
    const g = spanGrid([C('a', { merge: { within: ['b'] } }), C('b')], [['x', 1], ['x', 1]]);
    const text = (col: { id: string }): string | null => {
      if (col.id === 'b') throw new Error('boom');
      return 'x';
    };
    const m = buildSpanMap({ ...g.input, text });
    expect(cellsOf(m, 2, 2)).toEqual([]);
    expect(shape(m)).toEqual([{ code: 'invalid-span', severity: 'error', path: 'columns.b', detail: 'threw' }]);
  });
});

describe('fix 4: settings.fullWidth, one rule', () => {
  const g = spanGrid([C('a'), C('b')], [['x', 1], ['y', 2]]);
  for (const off of [undefined, null, false]) {
    it(`${String(off)}: no full-width row, no problem, no missing-feature`, () => {
      const m = buildSpanMap({ ...g.input, fullWidth: off as never });
      expect([m.fullWidth(0), m.fullWidth(1)]).toEqual([false, false]);
      expect(m.problems).toEqual([]);
      expect(m.none).toBe(true);
      expect(missingFeatureProblems<Row>([C('a')], off)).toEqual([]);
    });
  }
  for (const bad of [true, {}, 'yes', 1]) {
    it(`${JSON.stringify(bad)}: refused at settings.fullWidth, no row full width`, () => {
      const m = buildSpanMap({ ...g.input, fullWidth: bad as never });
      expect([m.fullWidth(0), m.fullWidth(1)]).toEqual([false, false]);
      expect(cellsOf(m, 2, 2)).toEqual([]);
      expect(shape(m)).toEqual([{ code: 'invalid-span', severity: 'error', path: 'settings.fullWidth', detail: 'not a function' }]);
      expect(missingFeatureProblems<Row>([C('a')], bad)).toEqual([{ code: 'missing-feature', severity: 'warning', path: 'settings.fullWidth', detail: 'spans' }]);
    });
  }
  it('a function is the rule, and is a missing feature without spans', () => {
    const m = buildSpanMap({ ...g.input, fullWidth: (r) => r.id === 'r1' });
    expect([m.fullWidth(0), m.fullWidth(1)]).toEqual([false, true]);
    expect(missingFeatureProblems<Row>([C('a')], () => false)).toHaveLength(1);
  });
});

describe('fix 5: no column visible', () => {
  it('no row is full width and no slot has an owner', () => {
    const d = [C('a', { hidden: true, merge: true })];
    const g = spanGrid(d, [['x'], ['x']], { fullWidth: () => true });
    const m = buildSpanMap(g.input);
    expect([m.fullWidth(0), m.fullWidth(1)]).toEqual([false, false]);
    expect(m.ownerAt(0, 0)).toBeNull();
    expect(m.inRow(0, 0, 0)).toEqual([]);
    expect(m.coveringAbove(1)).toEqual([]);
  });
});
