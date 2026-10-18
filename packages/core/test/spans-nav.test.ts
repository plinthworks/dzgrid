import { describe, it, expect } from 'vitest';
import type { Intent } from '@dzgrid/core';
import { flatDisplayed } from '@dzgrid/core/internal';
import { buildSpanMap, land, navigate, ownerFocus, type NavShape, type SpanCell, type SpanLookup } from '@dzgrid/core/spans';
import { spanGrid } from './support/spans.js';

/** docs/behaviors/spans.md: one stop per spanned cell, arrows step over it, moving back returns where the user came from. */

const down: Intent = { kind: 'move', axis: 'row', delta: 1 };
const up: Intent = { kind: 'move', axis: 'row', delta: -1 };
const right: Intent = { kind: 'move', axis: 'col', delta: 1 };
const left: Intent = { kind: 'move', axis: 'col', delta: -1 };

/** A literal map: listed cells, full-width rows over every column. */
export function lookup(cells: readonly SpanCell[], cols: number, fullWidth: readonly number[] = []): SpanLookup {
  return {
    ownerAt(r, c) {
      if (fullWidth.includes(r)) return { row: r, col: 0, rows: 1, cols };
      return cells.find((s) => r >= s.row && r < s.row + s.rows && c >= s.col && c < s.col + s.cols) ?? null;
    },
  };
}

const S: NavShape = { rows: 10, cols: 4, page: 3 };
// A tall cell in column 1 over rows 2-5; a wide one in row 7 over columns 1-3.
const M = lookup([{ row: 2, col: 1, rows: 4, cols: 1 }, { row: 7, col: 1, rows: 1, cols: 3 }], 4, [9]);

describe('moving over spans', () => {
  it('Down from a tall cell lands below it; Up from there comes back to it, the column kept', () => {
    const a = navigate(M, S, { row: 2, col: 1 }, null, down);
    expect(a).toEqual({ to: { row: 6, col: 1 }, goal: { row: 6, col: 1 } });
    expect(navigate(M, S, a!.to, a!.goal, up)).toEqual({ to: { row: 2, col: 1 }, goal: { row: 5, col: 1 } });
  });

  it('Down into a tall cell focuses its origin and keeps the goal row', () => {
    expect(navigate(M, S, { row: 1, col: 1 }, null, down)).toEqual({ to: { row: 2, col: 1 }, goal: { row: 2, col: 1 } });
    expect(navigate(M, S, { row: 4, col: 0 }, null, right)).toEqual({ to: { row: 2, col: 1 }, goal: { row: 4, col: 1 } });
  });

  it('Right through a tall cell comes out on the row the user came from', () => {
    const a = navigate(M, S, { row: 4, col: 0 }, null, right)!;
    expect(navigate(M, S, a.to, a.goal, right)).toEqual({ to: { row: 4, col: 2 }, goal: { row: 4, col: 2 } });
    expect(navigate(M, S, a.to, a.goal, left)).toEqual({ to: { row: 4, col: 0 }, goal: { row: 4, col: 0 } });
  });

  it('Right from a wide cell steps over all its columns; at the end it stays, the goal kept', () => {
    expect(navigate(M, S, { row: 7, col: 0 }, null, right)).toEqual({ to: { row: 7, col: 1 }, goal: { row: 7, col: 1 } });
    expect(navigate(M, S, { row: 7, col: 1 }, { row: 7, col: 1 }, right)).toEqual({ to: { row: 7, col: 1 }, goal: { row: 7, col: 1 } });
    expect(navigate(M, S, { row: 7, col: 1 }, { row: 7, col: 1 }, left)).toEqual({ to: { row: 7, col: 0 }, goal: { row: 7, col: 0 } });
    // Down onto the wide cell from column 3, then down again: column 3 is remembered.
    const a = navigate(M, S, { row: 6, col: 3 }, null, down)!;
    expect(a).toEqual({ to: { row: 7, col: 1 }, goal: { row: 7, col: 3 } });
    expect(navigate(M, S, a.to, a.goal, down)).toEqual({ to: { row: 8, col: 3 }, goal: { row: 8, col: 3 } });
  });

  it('a goal the focused cell no longer owns is dropped', () => {
    expect(navigate(M, S, { row: 0, col: 0 }, { row: 4, col: 1 }, down)).toEqual({ to: { row: 1, col: 0 }, goal: { row: 1, col: 0 } });
  });

  it('a focus on a covered slot moves from the cell owning it', () => {
    expect(navigate(M, S, { row: 4, col: 1 }, null, down)).toEqual({ to: { row: 6, col: 1 }, goal: { row: 6, col: 1 } });
  });

  it('a full-width row: Left, Right, Home and End stay put and remember the column', () => {
    const g = { row: 9, col: 2 };
    for (const i of [left, right, { kind: 'edge', axis: 'col', to: 'first' }, { kind: 'edge', axis: 'col', to: 'last' }] as Intent[]) {
      expect(navigate(M, S, { row: 9, col: 0 }, g, i)).toEqual({ to: { row: 9, col: 0 }, goal: g });
    }
    expect(navigate(M, S, { row: 9, col: 0 }, g, up)).toEqual({ to: { row: 8, col: 2 }, goal: { row: 8, col: 2 } });
  });

  it('Up from the first row leaves the body (row -1: the header row above)', () => {
    expect(navigate(M, S, { row: 0, col: 2 }, null, up)).toEqual({ to: { row: -1, col: 2 }, goal: { row: -1, col: 2 } });
  });

  it('Page keys move from the goal row; edges go to the first or last slot', () => {
    expect(navigate(M, S, { row: 2, col: 1 }, { row: 5, col: 1 }, { kind: 'page', delta: 1 })).toEqual({ to: { row: 8, col: 1 }, goal: { row: 8, col: 1 } });
    expect(navigate(M, S, { row: 8, col: 1 }, null, { kind: 'page', delta: -1 })).toEqual({ to: { row: 2, col: 1 }, goal: { row: 5, col: 1 } });
    expect(navigate(M, S, { row: 3, col: 3 }, null, { kind: 'edge', axis: 'col', to: 'first' })).toEqual({ to: { row: 3, col: 0 }, goal: { row: 3, col: 0 } });
    expect(navigate(M, S, { row: 4, col: 0 }, null, { kind: 'edge', axis: 'col', to: 'last' })).toEqual({ to: { row: 4, col: 3 }, goal: { row: 4, col: 3 } });
    expect(navigate(M, S, { row: 0, col: 1 }, null, { kind: 'edge', axis: 'row', to: 'last' })).toEqual({ to: { row: 9, col: 0 }, goal: { row: 9, col: 1 } });
    expect(navigate(M, S, { row: 6, col: 3 }, null, { kind: 'edge', axis: 'both', to: 'first' })).toEqual({ to: { row: 0, col: 0 }, goal: { row: 0, col: 0 } });
    expect(navigate(M, S, { row: 6, col: 0 }, null, { kind: 'edge', axis: 'both', to: 'last' })).toEqual({ to: { row: 9, col: 0 }, goal: { row: 9, col: 3 } });
  });

  it('other intents, an empty grid: nothing', () => {
    expect(navigate(M, S, { row: 0, col: 0 }, null, { kind: 'toggleSelect' })).toBeNull();
    expect(navigate(M, { rows: 0, cols: 4, page: 3 }, { row: 0, col: 0 }, null, down)).toBeNull();
    expect(navigate(M, { rows: 4, cols: 0, page: 3 }, { row: 0, col: 0 }, null, down)).toBeNull();
  });

  it('without a map: one slot at a time, clamped', () => {
    expect(navigate(null, S, { row: 2, col: 1 }, null, down)).toEqual({ to: { row: 3, col: 1 }, goal: { row: 3, col: 1 } });
    expect(navigate(null, S, { row: 9, col: 3 }, null, down)).toEqual({ to: { row: 9, col: 3 }, goal: { row: 9, col: 3 } });
    expect(navigate(null, S, { row: 9, col: 3 }, null, right)).toEqual({ to: { row: 9, col: 3 }, goal: { row: 9, col: 3 } });
    expect(navigate(null, S, { row: 8, col: 0 }, null, { kind: 'page', delta: 1 })).toEqual({ to: { row: 9, col: 0 }, goal: { row: 9, col: 0 } });
  });

  it('land: the origin of the cell owning a slot', () => {
    expect(land(M, 4, 1)).toEqual({ row: 2, col: 1 });
    expect(land(M, 4, 0)).toEqual({ row: 4, col: 0 });
    expect(land(null, 4, 1)).toEqual({ row: 4, col: 1 });
  });
});

describe('the focus owner the kernel is given', () => {
  const g = spanGrid([{ id: 'a', merge: true }, { id: 'b' }], [['x', 1], ['x', 2], ['y', 3]]);
  const map = buildSpanMap(g.input);
  const owner = ownerFocus(map, ['a', 'b']);
  const key = (i: number) => g.rows.keyAt(g.rows.index(i)!);

  it('a focus on a covered slot moves to its origin; any other stays', () => {
    expect(owner({ kind: 'cell', row: key(1), column: 'a' }, g.rows)).toEqual({ kind: 'cell', row: key(0), column: 'a' });
    const f = { kind: 'cell', row: key(1), column: 'b' } as const;
    expect(owner(f, g.rows)).toBe(f);
  });

  it('rows the map was not built for, or an unknown column: left alone', () => {
    const other = flatDisplayed(g.store.snapshot, null, 99);
    const f = { kind: 'cell', row: key(1), column: 'a' } as const;
    expect(owner(f, other)).toBe(f);
    const z = { kind: 'cell', row: key(1), column: 'zz' } as const;
    expect(owner(z, g.rows)).toBe(z);
  });
});

describe('gaps found by the mutants', () => {
  const W = lookup([{ row: 2, col: 1, rows: 3, cols: 1 }, { row: 6, col: 1, rows: 1, cols: 3 }], 4);
  const s = { rows: 8, cols: 4, page: 2 };

  it('a goal on the same row but another cell is not the focused cell\'s', () => {
    expect(navigate(W, s, { row: 0, col: 0 }, { row: 0, col: 2 }, down)).toEqual({ to: { row: 1, col: 0 }, goal: { row: 1, col: 0 } });
  });

  it('Home and End go along the goal row; first and last row along the goal column', () => {
    expect(navigate(W, s, { row: 2, col: 1 }, { row: 4, col: 1 }, { kind: 'edge', axis: 'col', to: 'first' })).toEqual({ to: { row: 4, col: 0 }, goal: { row: 4, col: 0 } });
    expect(navigate(W, s, { row: 6, col: 1 }, { row: 6, col: 3 }, { kind: 'edge', axis: 'row', to: 'first' })).toEqual({ to: { row: 0, col: 3 }, goal: { row: 0, col: 3 } });
  });
});
