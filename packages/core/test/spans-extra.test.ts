import { describe, it, expect } from 'vitest';
import { createColumnModel, type ColumnOrGroup, type DisplayedRows, type Intent } from '@dzgrid/core';
import { flatDisplayed } from '@dzgrid/core/internal';
import { buildSpanMap, headerBands, navigate, ownerFocus, type SpanCell, type SpanLookup } from '@dzgrid/core/spans';
import { cellsOf, shape, spanGrid, type Row } from './support/spans.js';

/** Gaps left by the author's mutants: each test below kills a mutant that survived the shipped suite. */

const lookup = (spans: SpanCell[]): SpanLookup => ({
  ownerAt: (r, c) => spans.find((s) => r >= s.row && r < s.row + s.rows && c >= s.col && c < s.col + s.cols) ?? null,
});
const up: Intent = { kind: 'move', axis: 'row', delta: -1 };
const left: Intent = { kind: 'move', axis: 'col', delta: -1 };

describe('merge runs and the rows they may not cross', () => {
  it('a run broken by a full-width row is two cells, and nothing was clipped', () => {
    const fw = (row: Row) => row.id === 'r2';
    const g = spanGrid([{ id: 'a', merge: true }, { id: 'b' }], [['x', 1], ['x', 1], ['x', 1], ['x', 1], ['x', 1]], { fullWidth: fw });
    const m = buildSpanMap(g.input);
    expect(cellsOf(m, 5, 2)).toEqual([{ row: 0, col: 0, rows: 2, cols: 1 }, { row: 2, col: 0, rows: 1, cols: 2 }, { row: 3, col: 0, rows: 2, cols: 1 }]);
    expect(shape(m)).toEqual([]);
  });

  it('one column clipped by the rows and by its segment is told both reasons', () => {
    const g = spanGrid(
      [{ id: 'a', pinned: 'start', rowSpan: (x) => (x.index === 0 ? 9 : 1), colSpan: (x) => (x.index === 1 ? 5 : 1) }, { id: 'b' }],
      [['x', 1], ['y', 1]],
    );
    // Row 0 asks 9 rows (2 exist): clipped by the rows; row 1 is covered, so ask a second grid for the segment.
    const m = buildSpanMap(g.input);
    expect(shape(m).filter((p) => p.code === 'span-clipped')).toEqual([{ code: 'span-clipped', severity: 'warning', path: 'columns.a', detail: 'rows' }]);
    const g2 = spanGrid(
      [{ id: 'a', pinned: 'start', rowSpan: (x) => (x.index === 0 ? 9 : 1), colSpan: (x) => (x.index === 0 ? 5 : 1) }, { id: 'b' }],
      [['x', 1], ['y', 1]],
    );
    expect(shape(buildSpanMap(g2.input)).filter((p) => p.code === 'span-clipped').map((p) => p.detail)).toEqual(['rows', 'segment']);
  });
});

describe('bad rules', () => {
  it('merge.within with a non-string entry refuses the rule', () => {
    const g = spanGrid([{ id: 'a', merge: { within: [1 as never] } }], [['x'], ['x']]);
    const m = buildSpanMap(g.input);
    expect(cellsOf(m, 2, 1)).toEqual([]);
    expect(shape(m)).toEqual([{ code: 'invalid-span', severity: 'error', path: 'columns.a.merge.within' }]);
  });

  it('a rowSpan that is not a function is refused alone: the colSpan of the same column still spans', () => {
    const g = spanGrid([{ id: 'a', rowSpan: 3 as never, colSpan: () => 2 }, { id: 'b' }], [['x', 1], ['y', 2]]);
    const m = buildSpanMap(g.input);
    expect(cellsOf(m, 2, 2)).toEqual([{ row: 0, col: 0, rows: 1, cols: 2 }, { row: 1, col: 0, rows: 1, cols: 2 }]);
    expect(shape(m)).toEqual([{ code: 'invalid-span', severity: 'error', path: 'columns.a.rowSpan' }]);
  });

  it('a value that throws is told to the rule as undefined', () => {
    const seen: unknown[] = [];
    const g = spanGrid([{ id: 'a', value: () => { throw new Error('x'); }, rowSpan: (x) => (seen.push(x.value), 1) }], [['x']]);
    buildSpanMap(g.input);
    expect(seen).toEqual([undefined]);
    expect(seen.length).toBe(1);
    expect('0' in seen).toBe(true);
  });
});

describe('the focus owner and the rows it was built for', () => {
  const g = spanGrid([{ id: 'a', merge: true }, { id: 'b' }], [['x', 1], ['x', 2], ['y', 3]]);
  const map = buildSpanMap(g.input);
  const owner = ownerFocus(map, ['a', 'b']);
  const key = (rows: DisplayedRows<Row>, i: number) => rows.keyAt(rows.index(i)!);

  it('new rows of the same version (another order) are not the map\'s: the focus stays', () => {
    const sorted = flatDisplayed(g.store.snapshot, Uint32Array.from([2, 1, 0]), g.rows.version);
    const f = { kind: 'cell', row: key(sorted, 1), column: 'a' } as const;
    expect(owner(f, sorted)).toBe(f);
  });

  it('the same rows object at a later version is not the map\'s either', () => {
    const rows = { ...g.rows, version: 1 };
    const m = buildSpanMap({ ...g.input, rows }, null);
    const o = ownerFocus(m, ['a', 'b']);
    const f = { kind: 'cell', row: key(g.rows, 1), column: 'a' } as const;
    expect(o(f, rows)).toEqual({ kind: 'cell', row: key(g.rows, 0), column: 'a' });
    (rows as { version: number }).version = 2;
    expect(o(f, rows)).toBe(f);
  });

  it('a focus already on an origin is given back as is', () => {
    const f = { kind: 'cell', row: key(g.rows, 0), column: 'a' } as const;
    expect(owner(f, g.rows)).toBe(f);
  });
});

describe('navigate: the goal, not the origin, on the crossing axis', () => {
  const W = lookup([{ row: 0, col: 1, rows: 2, cols: 3 }]);
  const s = { rows: 4, cols: 5, page: 2 };

  it('Up from the first row of a wide cell goes to the header above the goal column', () => {
    expect(navigate(W, s, { row: 0, col: 1 }, { row: 1, col: 3 }, up)).toEqual({ to: { row: -1, col: 3 }, goal: { row: -1, col: 3 } });
  });

  it('Left leaves a wide cell by its start side, whatever the goal column', () => {
    expect(navigate(W, s, { row: 0, col: 1 }, { row: 1, col: 3 }, left)).toEqual({ to: { row: 1, col: 0 }, goal: { row: 1, col: 0 } });
  });
});

describe('header bands: refusals', () => {
  type R = Record<string, unknown>;
  const bands = (tree: ColumnOrGroup<R>[]) => {
    const m = createColumnModel<R>(tree);
    const b = headerBands(tree, m.layout);
    return { depth: b.depth, levels: b.levels, problems: b.problems.map((p) => [p.path, p.detail]) };
  };

  it('a group without a string id is refused (id), its leaves kept ungrouped', () => {
    expect(bands([{ id: 5 as never, header: 'G', children: [{ id: 'a' }] }])).toEqual({ depth: 0, levels: [], problems: [['columns[0]', 'id']] });
  });

  it('an empty group with no id is said empty, the first reason', () => {
    expect(bands([{ id: '', children: [] }, { id: 'a' }]).problems).toEqual([['columns[0]', 'empty']]);
  });

  it('a group named like a hidden leaf is a duplicate', () => {
    expect(bands([{ id: 'a', children: [{ id: 'b' }] }, { id: 'a', hidden: true } as never]).problems).toEqual([['columns[0]', 'duplicate']]);
  });

  it('a refused group inside a valid one: its leaves stay in the outer group', () => {
    expect(bands([{ id: 'p', header: 'P', children: [{ id: 'p', children: [{ id: 'a' }] }, { id: 'b' }] }])).toEqual({
      depth: 1,
      levels: [[{ group: 'p', first: 0, count: 2, label: 'P' }]],
      problems: [['columns[0].children[0]', 'duplicate']],
    });
  });

  it('a header that is not a string labels nothing', () => {
    expect(bands([{ id: 'g', header: 42 as never, children: [{ id: 'a' }] }]).levels).toEqual([[{ group: 'g', first: 0, count: 1, label: '' }]]);
  });
});
