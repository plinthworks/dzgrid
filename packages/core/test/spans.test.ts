import { describe, it, expect, vi } from 'vitest';
import { buildSpanMap, spanAt } from '@dzgrid/core/spans';
import type { ColumnDef, SpanCtx } from '@dzgrid/core';
import { cellsOf, nodeRows, shape, spanGrid, type Row } from './support/spans.js';

/** docs/behaviors/spans.md: the span map, computed from the displayed rows and the visible columns. */

const C = (id: string, more: Partial<ColumnDef<Row>> = {}): ColumnDef<Row> => ({ id, ...more });

describe('a grid without span rules', () => {
  it('is the fast path: no span anywhere, no problem', () => {
    const g = spanGrid([C('a'), C('b')], [['x', 1], ['x', 1]]);
    const m = buildSpanMap(g.input);
    expect(m.none).toBe(true);
    expect(cellsOf(m, 2, 2)).toEqual([]);
    expect(m.fullWidth(0)).toBe(false);
    expect(m.coveringAbove(1)).toEqual([]);
    expect(m.inRow(0, 0, 1)).toEqual([]);
    expect(m.problems).toEqual([]);
  });

  it('a rule on a hidden column is no rule', () => {
    const g = spanGrid([C('a', { merge: true, hidden: true }), C('b')], [['x', 1], ['x', 1]]);
    expect(buildSpanMap(g.input).none).toBe(true);
  });
});

describe('identical values merged', () => {
  it('consecutive equal values make one tall cell per run', () => {
    const g = spanGrid([C('ward', { merge: true }), C('name')], [['A', 'x'], ['A', 'y'], ['B', 'z'], ['B', 'w'], ['B', 'v'], ['C', 'u']]);
    const m = buildSpanMap(g.input);
    expect(m.none).toBe(false);
    expect(cellsOf(m, 6, 2)).toEqual([{ row: 0, col: 0, rows: 2, cols: 1 }, { row: 2, col: 0, rows: 3, cols: 1 }]);
    expect(m.ownerAt(1, 0)).toEqual({ row: 0, col: 0, rows: 2, cols: 1 });
    expect(m.ownerAt(4, 0)).toEqual({ row: 2, col: 0, rows: 3, cols: 1 });
    expect(m.ownerAt(5, 0)).toBeNull();
    expect(m.ownerAt(0, 1)).toBeNull();
    expect(m.problems).toEqual([]);
  });

  it('compares the stable export text: e and é stay apart, 1 and "1.0" in a number column merge', () => {
    const g = spanGrid([C('t', { merge: true }), C('n', { merge: true, type: 'number' })], [['e', 1], ['é', '1.0'], ['é', 2], ['E', 2]]);
    const m = buildSpanMap(g.input);
    expect(cellsOf(m, 4, 2)).toEqual([{ row: 0, col: 1, rows: 2, cols: 1 }, { row: 1, col: 0, rows: 2, cols: 1 }, { row: 2, col: 1, rows: 2, cols: 1 }]);
  });

  it('blanks never merge, not even with each other', () => {
    const g = spanGrid([C('a', { merge: true })], [[''], [null], [undefined], ['A'], [''], ['A'], ['A']]);
    expect(cellsOf(buildSpanMap(g.input), 7, 1)).toEqual([{ row: 5, col: 0, rows: 2, cols: 1 }]);
  });

  it('an unreadable value is a blank: never merged', () => {
    const g = spanGrid([C('n', { merge: true, type: 'number' })], [['zz'], ['zz'], [3], [3]]);
    expect(cellsOf(buildSpanMap(g.input), 4, 1)).toEqual([{ row: 2, col: 0, rows: 2, cols: 1 }]);
  });

  it('within cuts a run where a listed column changes, and a blank there cuts too', () => {
    const g = spanGrid(
      [C('region'), C('city', { merge: { within: ['region'] } })],
      [['N', 'Oran'], ['N', 'Oran'], ['S', 'Oran'], ['S', 'Oran'], ['', 'Oran'], ['', 'Oran'], ['S', 'Oran']],
    );
    expect(cellsOf(buildSpanMap(g.input), 7, 2)).toEqual([{ row: 0, col: 1, rows: 2, cols: 1 }, { row: 2, col: 1, rows: 2, cols: 1 }]);
  });

  it('within may name a hidden column, and an unknown one is said once', () => {
    const g = spanGrid([C('region', { hidden: true }), C('city', { merge: { within: ['region', 'nope'] } })], [['N', 'Oran'], ['S', 'Oran'], ['S', 'Oran']]);
    const m = buildSpanMap(g.input);
    expect(cellsOf(m, 3, 1)).toEqual([{ row: 1, col: 0, rows: 2, cols: 1 }]);
    expect(shape(m)).toEqual([{ code: 'invalid-span', severity: 'error', path: 'columns.city.merge.within', detail: 'nope' }]);
  });

  it('a function decides, with both cells told; blanks still never merge', () => {
    const seen: [string, string, number, number][] = [];
    const same = (a: SpanCtx<Row>, b: SpanCtx<Row>) => {
      seen.push([String(a.value), String(b.value), a.index, b.index]);
      return String(a.value).toLowerCase() === String(b.value).toLowerCase();
    };
    const g = spanGrid([C('a', { merge: same })], [['x'], ['X'], ['y'], [''], ['']]);
    expect(cellsOf(buildSpanMap(g.input), 5, 1)).toEqual([{ row: 0, col: 0, rows: 2, cols: 1 }]);
    expect(seen).toEqual([['x', 'X', 0, 1], ['X', 'y', 1, 2]]);
  });

  it('the object form: same and within together', () => {
    const g = spanGrid(
      [C('k'), C('a', { merge: { same: (x, y) => String(x.value)[0] === String(y.value)[0], within: ['k'] } })],
      [[1, 'ab'], [1, 'ac'], [2, 'ad'], [2, 'b']],
    );
    expect(cellsOf(buildSpanMap(g.input), 4, 2)).toEqual([{ row: 0, col: 1, rows: 2, cols: 1 }]);
  });

  it('a merge function that throws merges nothing there and is said', () => {
    const g = spanGrid([C('a', { merge: () => { throw new Error('no'); } })], [['x'], ['x']]);
    const m = buildSpanMap(g.input);
    expect(cellsOf(m, 2, 1)).toEqual([]);
    expect(shape(m)).toEqual([{ code: 'invalid-span', severity: 'error', path: 'rows[0].a.merge', detail: 'threw' }]);
  });

  it('follows the order on screen, not the source order', () => {
    const g = spanGrid([C('w', { merge: true })], [['A'], ['B'], ['A'], ['B']], { order: [0, 2, 1, 3] });
    expect(cellsOf(buildSpanMap(g.input), 4, 1)).toEqual([{ row: 0, col: 0, rows: 2, cols: 1 }, { row: 2, col: 0, rows: 2, cols: 1 }]);
  });

  it('stays inside the displayed rows: a page cut ends its runs', () => {
    // Source rows 0..5 all 'A'; the page shows source rows 2..3 only.
    const g = spanGrid([C('w', { merge: true })], [['A'], ['A'], ['A'], ['A'], ['A'], ['A']], { order: [2, 3] });
    const m = buildSpanMap(g.input);
    expect(cellsOf(m, 2, 1)).toEqual([{ row: 0, col: 0, rows: 2, cols: 1 }]);
    expect(m.problems).toEqual([]);
  });

  it('reads the text through the reader the host gives (an export cache)', () => {
    const text = vi.fn((_c: unknown, _row: Readonly<Row>, i: number) => (i < 2 ? 'same' : `t${i}`));
    const g = spanGrid([C('a', { merge: true })], [['x'], ['y'], ['z']]);
    expect(cellsOf(buildSpanMap({ ...g.input, text }), 3, 1)).toEqual([{ row: 0, col: 0, rows: 2, cols: 1 }]);
    expect(text).toHaveBeenCalled();
  });
});

describe('spans decided by the data', () => {
  it('rowSpan covers rows below, and is not asked for the rows it covers', () => {
    const asked: number[] = [];
    const g = spanGrid([C('a', { rowSpan: (c) => (asked.push(c.index), c.index === 0 ? 3 : 1) }), C('b')], [[1, 1], [2, 2], [3, 3], [4, 4]]);
    const m = buildSpanMap(g.input);
    expect(cellsOf(m, 4, 2)).toEqual([{ row: 0, col: 0, rows: 3, cols: 1 }]);
    expect(asked).toEqual([0, 3]);
  });

  it('tells the rule the cell: row, raw value, key, index, column, neighbours', () => {
    const got: unknown[] = [];
    const g = spanGrid([C('a', { colSpan: (c) => (got.push({ value: c.value, key: c.key, index: c.index, column: c.column, row: c.row.id, prev: c.prev?.id ?? null, next: c.next?.id ?? null }), 1) }), C('b')], [['x', 1], ['y', 2]]);
    buildSpanMap(g.input);
    const key = (i: number) => g.rows.keyAt(g.rows.index(i)!);
    expect(got).toEqual([
      { value: 'x', key: key(0), index: 0, column: 'a', row: 'r0', prev: null, next: 'r1' },
      { value: 'y', key: key(1), index: 1, column: 'a', row: 'r1', prev: 'r0', next: null },
    ]);
  });

  it('colSpan covers columns to the end side: a total row over three columns', () => {
    const g = spanGrid([C('a', { colSpan: (c) => (c.value === 'total' ? 3 : 1) }), C('b'), C('c'), C('d')], [['x', 1, 2, 3], ['total', '', '', 9]]);
    const m = buildSpanMap(g.input);
    expect(cellsOf(m, 2, 4)).toEqual([{ row: 1, col: 0, rows: 1, cols: 3 }]);
    expect(m.ownerAt(1, 2)).toEqual({ row: 1, col: 0, rows: 1, cols: 3 });
    expect(m.ownerAt(1, 3)).toBeNull();
  });

  it('rowSpan and colSpan on one column make a block', () => {
    const g = spanGrid([C('a', { rowSpan: (c) => (c.index === 1 ? 2 : 1), colSpan: (c) => (c.index === 1 ? 2 : 1) }), C('b'), C('c')], [[0, 0, 0], [1, 1, 1], [2, 2, 2], [3, 3, 3]]);
    const m = buildSpanMap(g.input);
    expect(cellsOf(m, 4, 3)).toEqual([{ row: 1, col: 0, rows: 2, cols: 2 }]);
    for (const [r, c] of [[1, 0], [1, 1], [2, 0], [2, 1]] as const) expect(m.ownerAt(r, c)).toEqual({ row: 1, col: 0, rows: 2, cols: 2 });
    expect(m.ownerAt(2, 2)).toBeNull();
  });

  it('a covered rule column is not asked either (HTML table)', () => {
    const asked: string[] = [];
    const g = spanGrid([C('a', { colSpan: (c) => (c.index === 0 ? 2 : 1) }), C('b', { rowSpan: (c) => (asked.push(`b${c.index}`), 1) })], [[1, 1], [2, 2]]);
    buildSpanMap(g.input);
    expect(asked).toEqual(['b1']);
  });

  it('a bad answer is one cell and said: not whole, below 1, not a number, a throw', () => {
    const answers: unknown[] = [1.5, 0, -2, Number.NaN, '2', Infinity, null];
    const g = spanGrid(
      [C('a', { rowSpan: (c) => answers[c.index] as number }), C('b', { colSpan: (c) => { if (c.index === 0) throw new Error('x'); return 1; } }), C('c')],
      answers.map(() => [1, 1, 1]),
    );
    const m = buildSpanMap(g.input);
    expect(cellsOf(m, answers.length, 3)).toEqual([]);
    expect(shape(m)).toEqual([
      { code: 'invalid-span', severity: 'error', path: 'rows[0].a.rowSpan', detail: 'not a whole number' },
      { code: 'invalid-span', severity: 'error', path: 'rows[0].b.colSpan', detail: 'threw' },
      ...[1, 2, 3, 4, 5, 6].map((i) => ({ code: 'invalid-span', severity: 'error', path: `rows[${i}].a.rowSpan`, detail: 'not a whole number' })),
    ]);
  });

  it('caps what it says at ten per column, then a count', () => {
    const g = spanGrid([C('a', { rowSpan: () => 0 })], Array.from({ length: 14 }, () => [1]));
    const ps = shape(buildSpanMap(g.input));
    expect(ps).toHaveLength(11);
    expect(ps[9]!.path).toBe('rows[9].a.rowSpan');
    expect(ps[10]).toEqual({ code: 'invalid-span', severity: 'error', path: 'rows.a', detail: '4 more' });
  });

  it('merge together with rowSpan or colSpan on one column is refused: that column spans nothing', () => {
    const g = spanGrid([C('a', { merge: true, rowSpan: () => 2 }), C('b', { merge: true })], [['x', 'y'], ['x', 'y']]);
    const m = buildSpanMap(g.input);
    expect(cellsOf(m, 2, 2)).toEqual([{ row: 0, col: 1, rows: 2, cols: 1 }]);
    expect(shape(m)).toEqual([{ code: 'invalid-span', severity: 'error', path: 'columns.a', detail: 'merge with rowSpan or colSpan' }]);
  });

  it('a rule that is not a function, or a merge of the wrong shape, is refused', () => {
    const g = spanGrid([C('a', { rowSpan: 3 as never }), C('b', { merge: 'yes' as never }), C('c', { merge: { within: 'b' } as never })], [[1, 1, 1], [1, 1, 1]]);
    const m = buildSpanMap(g.input);
    expect(cellsOf(m, 2, 3)).toEqual([]);
    expect(shape(m)).toEqual([
      { code: 'invalid-span', severity: 'error', path: 'columns.a.rowSpan' },
      { code: 'invalid-span', severity: 'error', path: 'columns.b.merge' },
      { code: 'invalid-span', severity: 'error', path: 'columns.c.merge.within' },
    ]);
  });
});

describe('no overlap: the earlier span wins', () => {
  it('a later span asked over an earlier one drops to one cell, with a warning', () => {
    // b at row 0 covers rows 0-2; a at row 1 wants two columns, over b's row 1.
    const g = spanGrid([C('a', { colSpan: (c) => (c.index === 1 ? 2 : 1) }), C('b', { rowSpan: (c) => (c.index === 0 ? 3 : 1) })], [[0, 0], [1, 1], [2, 2], [3, 3]]);
    const m = buildSpanMap(g.input);
    expect(cellsOf(m, 4, 2)).toEqual([{ row: 0, col: 1, rows: 3, cols: 1 }]);
    expect(shape(m)).toEqual([{ code: 'span-overlap', severity: 'warning', path: 'rows[1].a', detail: '1x2' }]);
  });

  it('in one row, the start-most span wins', () => {
    const g = spanGrid([C('a', { colSpan: () => 2 }), C('b', { colSpan: () => 2 }), C('c')], [[0, 0, 0]]);
    const m = buildSpanMap(g.input);
    expect(cellsOf(m, 1, 3)).toEqual([{ row: 0, col: 0, rows: 1, cols: 2 }]);
    expect(m.problems).toEqual([]);
  });

  it('a merge run wins over a later data span reaching into it', () => {
    const g = spanGrid([C('a', { colSpan: (c) => (c.index === 1 ? 2 : 1) }), C('b', { merge: true })], [[0, 'x'], [1, 'x'], [2, 'y']]);
    const m = buildSpanMap(g.input);
    expect(cellsOf(m, 3, 2)).toEqual([{ row: 0, col: 1, rows: 2, cols: 1 }]);
    expect(shape(m)).toEqual([{ code: 'span-overlap', severity: 'warning', path: 'rows[1].a', detail: '1x2' }]);
  });

  it('a merge whose first slot is covered starts again below it', () => {
    const g = spanGrid([C('a', { colSpan: (c) => (c.index === 0 ? 2 : 1) }), C('b', { merge: true })], [[0, 'x'], [1, 'x'], [2, 'x']]);
    expect(cellsOf(buildSpanMap(g.input), 3, 2)).toEqual([{ row: 0, col: 0, rows: 1, cols: 2 }, { row: 1, col: 1, rows: 2, cols: 1 }]);
  });
});

describe('clipping', () => {
  it('a colSpan stops at its pinned segment, said once per column', () => {
    const g = spanGrid([C('s1', { pinned: 'start', colSpan: () => 3 }), C('s2', { pinned: 'start' }), C('m'), C('e', { pinned: 'end' })], [[1, 1, 1, 1], [2, 2, 2, 2]]);
    const m = buildSpanMap(g.input);
    expect(cellsOf(m, 2, 4)).toEqual([{ row: 0, col: 0, rows: 1, cols: 2 }, { row: 1, col: 0, rows: 1, cols: 2 }]);
    expect(shape(m)).toEqual([{ code: 'span-clipped', severity: 'warning', path: 'columns.s1', detail: 'segment' }]);
  });

  it('a colSpan in the centre stops before the end segment; one in the end segment at the last column', () => {
    const g = spanGrid([C('m1', { colSpan: () => 5 }), C('m2'), C('e1', { pinned: 'end', colSpan: () => 4 }), C('e2', { pinned: 'end' })], [[1, 1, 1, 1]]);
    const m = buildSpanMap(g.input);
    expect(cellsOf(m, 1, 4)).toEqual([{ row: 0, col: 0, rows: 1, cols: 2 }, { row: 0, col: 2, rows: 1, cols: 2 }]);
    expect(shape(m).map((p) => p.path)).toEqual(['columns.m1', 'columns.e1']);
  });

  it('a pinned column splits what would merge across segments? No: a merge is one column, it never crosses', () => {
    const g = spanGrid([C('p', { pinned: 'start', merge: true }), C('m', { merge: true })], [['x', 'x'], ['x', 'x']]);
    expect(cellsOf(buildSpanMap(g.input), 2, 2)).toEqual([{ row: 0, col: 0, rows: 2, cols: 1 }, { row: 0, col: 1, rows: 2, cols: 1 }]);
  });

  it('a rowSpan stops at the end of the rows (or the page), said once', () => {
    const g = spanGrid([C('a', { rowSpan: (c) => (c.index === 1 ? 10 : 1) })], [[0], [1], [2], [3]], { order: [0, 1, 2] });
    const m = buildSpanMap(g.input);
    expect(cellsOf(m, 3, 1)).toEqual([{ row: 1, col: 0, rows: 2, cols: 1 }]);
    expect(shape(m)).toEqual([{ code: 'span-clipped', severity: 'warning', path: 'columns.a', detail: 'rows' }]);
  });

  it('is said once per column layout: a new order or a resize keeps quiet, a column change tells again', () => {
    const defs = [C('a', { rowSpan: () => 5 }), C('b')];
    const g = spanGrid(defs, [[0, 0], [1, 1], [2, 2]]);
    const m1 = buildSpanMap(g.input);
    expect(shape(m1).map((p) => p.code)).toEqual(['span-clipped']);
    const g2 = spanGrid(defs, [[0, 0], [1, 1], [2, 2]], { order: [2, 1, 0], version: 2, columns: g.columns });
    const m2 = buildSpanMap(g2.input, m1);
    expect(m2).not.toBe(m1);
    expect(m2.problems).toEqual([]);
    // A width is not the layout the map depends on: the same map, nothing told again.
    g.columns.apply([{ id: 'b', width: 99 }], 'api');
    expect(buildSpanMap(g2.input, m2)).toBe(m2);
    g.columns.apply([{ id: 'b', pinned: 'end' }], 'api');
    const m3 = buildSpanMap(g2.input, m2);
    expect(shape(m3).map((p) => p.code)).toEqual(['span-clipped']);
  });
});

describe('rows that cut spans', () => {
  it('a full-width row is one cell over every column, cuts merges and clips row spans', () => {
    const g = spanGrid(
      [C('p', { pinned: 'start', merge: true }), C('a', { rowSpan: (c) => (c.index === 0 ? 4 : 1) }), C('e', { pinned: 'end' })],
      [['x', 1, 1], ['x', 1, 1], ['title', 0, 0], ['x', 1, 1], ['x', 1, 1]],
      { fullWidth: (r) => r.p === 'title' },
    );
    const m = buildSpanMap(g.input);
    expect(m.fullWidth(2)).toBe(true);
    expect(m.fullWidth(1)).toBe(false);
    for (let c = 0; c < 3; c++) expect(m.ownerAt(2, c)).toEqual({ row: 2, col: 0, rows: 1, cols: 3 });
    expect(m.inRow(2, 1, 1)).toEqual([{ row: 2, col: 0, rows: 1, cols: 3 }]);
    expect(cellsOf(m, 5, 3)).toEqual([{ row: 0, col: 0, rows: 2, cols: 1 }, { row: 0, col: 1, rows: 2, cols: 1 }, { row: 2, col: 0, rows: 1, cols: 3 }, { row: 3, col: 0, rows: 2, cols: 1 }]);
    expect(shape(m)).toEqual([{ code: 'span-clipped', severity: 'warning', path: 'columns.a', detail: 'rows' }]);
  });

  it('the object form counts as full width; a rule that throws is a plain row, said', () => {
    const g = spanGrid([C('a'), C('b')], [[1, 1], [2, 2], [3, 3]], { fullWidth: (r) => { if (r.a === 3) throw new Error('x'); return r.a === 1 ? { part: 'note' } : false; } });
    const m = buildSpanMap(g.input);
    expect(m.none).toBe(false);
    expect([m.fullWidth(0), m.fullWidth(1), m.fullWidth(2)]).toEqual([true, false, false]);
    expect(shape(m)).toEqual([{ code: 'invalid-span', severity: 'error', path: 'rows[2]', detail: 'fullWidth threw' }]);
  });

  it('a non-data row or a change of level cuts a run and clips a span', () => {
    const d = (id: string, a: unknown) => ({ id, a });
    const rows = nodeRows([
      { kind: 'data', level: 0, data: d('0', 'x') },
      { kind: 'data', level: 0, data: d('1', 'x') },
      { kind: 'group', level: 0, data: d('2', 'x') },
      { kind: 'data', level: 0, data: d('3', 'x') },
      { kind: 'data', level: 1, data: d('4', 'x') },
      { kind: 'data', level: 1, data: d('5', 'x') },
    ]);
    const g = spanGrid([C('a', { merge: true })], []);
    const m = buildSpanMap({ ...g.input, rows });
    expect(cellsOf(m, 6, 1)).toEqual([{ row: 0, col: 0, rows: 2, cols: 1 }, { row: 4, col: 0, rows: 2, cols: 1 }]);
    const g2 = spanGrid([C('a', { rowSpan: (c) => (c.index === 0 || c.index === 3 ? 5 : 1) })], []);
    const m2 = buildSpanMap({ ...g2.input, rows });
    expect(cellsOf(m2, 6, 1)).toEqual([{ row: 0, col: 0, rows: 2, cols: 1 }]);
    expect(shape(m2)).toEqual([{ code: 'span-clipped', severity: 'warning', path: 'columns.a', detail: 'rows' }]);
  });
});

describe('queries', () => {
  const g = spanGrid(
    [C('a', { merge: true }), C('b', { colSpan: (c) => (c.index === 3 ? 2 : 1) }), C('c'), C('d', { rowSpan: (c) => (c.index === 0 ? 6 : 1) })],
    [['x', 0, 0, 0], ['x', 0, 0, 0], ['x', 0, 0, 0], ['y', 0, 0, 0], ['y', 0, 0, 0], ['z', 0, 0, 0]],
  );
  const m = buildSpanMap(g.input);

  it('coveringAbove gives the origins above a row that reach it, at most one per column', () => {
    expect(m.coveringAbove(0)).toEqual([]);
    expect(m.coveringAbove(1)).toEqual([{ row: 0, col: 0, rows: 3, cols: 1 }, { row: 0, col: 3, rows: 6, cols: 1 }]);
    expect(m.coveringAbove(3)).toEqual([{ row: 0, col: 3, rows: 6, cols: 1 }]);
    expect(m.coveringAbove(4)).toEqual([{ row: 3, col: 0, rows: 2, cols: 1 }, { row: 0, col: 3, rows: 6, cols: 1 }]);
    expect(m.coveringAbove(6)).toEqual([]);
  });

  it('inRow gives the spans of a row meeting a column window, once each', () => {
    expect(m.inRow(3, 0, 3)).toEqual([{ row: 3, col: 0, rows: 2, cols: 1 }, { row: 3, col: 1, rows: 1, cols: 2 }, { row: 0, col: 3, rows: 6, cols: 1 }]);
    expect(m.inRow(3, 2, 2)).toEqual([{ row: 3, col: 1, rows: 1, cols: 2 }]);
    expect(m.inRow(5, 0, 2)).toEqual([]);
  });

  it('out of range is a plain cell, never a throw', () => {
    for (const [r, c] of [[-1, 0], [0, -1], [6, 0], [0, 4], [0.5, 0], [Number.NaN, 0]] as const) expect(m.ownerAt(r, c)).toBeNull();
    expect(m.fullWidth(-1)).toBe(false);
    expect(m.inRow(99, 0, 3)).toEqual([]);
  });

  it('spanAt answers what api.spanOf will: the owner of a slot or null', () => {
    expect(spanAt(m, 2, 0)).toEqual({ row: 0, col: 0, rows: 3, cols: 1 });
    expect(spanAt(m, 5, 0)).toBeNull();
    expect(spanAt(m, 99, 0)).toBeNull();
    expect(spanAt(null, 0, 0)).toBeNull();
  });
});

describe('memoised', () => {
  it('the same rows, columns, rules and language give the same map', () => {
    const g = spanGrid([C('a', { merge: true })], [['x'], ['x']]);
    const m1 = buildSpanMap(g.input);
    expect(buildSpanMap({ ...g.input }, m1)).toBe(m1);
    expect(buildSpanMap({ ...g.input, ctx: { ...g.input.ctx } }, m1)).toBe(m1);
  });

  it('anything else gives a new map with the next version', () => {
    const g = spanGrid([C('a', { merge: true })], [['x'], ['x']]);
    const m1 = buildSpanMap(g.input);
    const g2 = spanGrid([C('a', { merge: true })], [['x'], ['y']], { version: 2, columns: g.columns });
    const m2 = buildSpanMap(g2.input, m1);
    expect(m2.version).toBe(m1.version + 1);
    expect(cellsOf(m2, 2, 1)).toEqual([]);
    const fw = () => false;
    const m3 = buildSpanMap({ ...g2.input, fullWidth: fw }, m2);
    expect(m3).not.toBe(m2);
    expect(buildSpanMap({ ...g2.input, fullWidth: fw }, m3)).toBe(m3);
    const m4 = buildSpanMap({ ...g2.input, fullWidth: fw, ctx: { ...g2.input.ctx, locale: 'fr-FR' } }, m3);
    expect(m4).not.toBe(m3);
    const m5 = buildSpanMap({ ...g2.input, fullWidth: fw, ctx: { ...g2.input.ctx, locale: "fr-FR" }, text: () => null }, m4);
    expect(m5).not.toBe(m4);
    g.columns.setDefs([C('a', { merge: true })]);
    expect(buildSpanMap(g2.input, m2)).not.toBe(m2);
  });
});

describe('gaps found writing the mutants', () => {
  it('the full-width rule is asked for data rows only', () => {
    const asked: string[] = [];
    const d = (id: string, a: unknown) => ({ id, a });
    const rows = nodeRows([{ kind: 'group', level: 0, data: d('0', 'x') }, { kind: 'data', level: 0, data: d('1', 'x') }]);
    const m = buildSpanMap({ ...spanGrid([C('a')], []).input, rows, fullWidth: (r) => (asked.push(r.id), true) });
    expect(asked).toEqual(['1']);
    expect([m.fullWidth(0), m.fullWidth(1)]).toEqual([false, true]);
  });

  it('exactly ten problems of a code and column: no summary', () => {
    const g = spanGrid([C('a', { rowSpan: () => 0 })], Array.from({ length: 10 }, () => [1]));
    expect(shape(buildSpanMap(g.input))).toHaveLength(10);
  });

  it('a full-width row or a non-data row asks no rule and starts no span', () => {
    const asked: number[] = [];
    const g = spanGrid([C('a', { colSpan: (c) => (asked.push(c.index), 0) }), C('b')], [[1, 1], ['title', 1], [3, 3]], { fullWidth: (r) => r.a === 'title' });
    const m = buildSpanMap(g.input);
    expect(asked).toEqual([0, 2]);
    expect(shape(m).map((p) => p.path)).toEqual(['rows[0].a.colSpan', 'rows[2].a.colSpan']);
    const d = (id: string, a: unknown) => ({ id, a });
    const rows = nodeRows([{ kind: 'group', level: 0, data: d('0', 'x') }, { kind: 'data', level: 0, data: d('1', 'x') }]);
    const asked2: number[] = [];
    buildSpanMap({ ...spanGrid([C('a', { rowSpan: (c) => (asked2.push(c.index), 1) })], []).input, rows });
    expect(asked2).toEqual([1]);
  });

  it('a merge.same that is not a function is refused', () => {
    const g = spanGrid([C('a', { merge: { same: 'x' } as never })], [['x'], ['x']]);
    const m = buildSpanMap(g.input);
    expect(cellsOf(m, 2, 1)).toEqual([]);
    expect(shape(m)).toEqual([{ code: 'invalid-span', severity: 'error', path: 'columns.a.merge.same' }]);
  });

  it('the same rows object at a new version is a new map', () => {
    const g = spanGrid([C('a', { merge: true })], [['x'], ['x']]);
    const rows = { ...g.rows, version: 1 };
    const m1 = buildSpanMap({ ...g.input, rows });
    rows.version = 2;
    expect(buildSpanMap({ ...g.input, rows }, m1)).not.toBe(m1);
  });

  it('the summary of a capped column keeps the code and its severity', () => {
    const g = spanGrid([C('a', { colSpan: (c) => (c.index % 2 === 1 ? 2 : 1) }), C('b', { rowSpan: (c) => (c.index % 2 === 0 ? 2 : 1) })], Array.from({ length: 30 }, () => [1, 1]));
    const ps = shape(buildSpanMap(g.input));
    expect(ps.filter((p) => p.code === 'span-overlap')).toHaveLength(11);
    expect(ps.at(-1)).toEqual({ code: 'span-overlap', severity: 'warning', path: 'rows.a', detail: '5 more' });
  });

  it('a rule that throws on full width too many times is counted, under rows', () => {
    const g = spanGrid([C('a')], Array.from({ length: 12 }, () => [1]), { fullWidth: () => { throw new Error('x'); } });
    const ps = shape(buildSpanMap(g.input));
    expect(ps).toHaveLength(11);
    expect(ps.at(-1)).toEqual({ code: 'invalid-span', severity: 'error', path: 'rows', detail: '2 more' });
  });
});
