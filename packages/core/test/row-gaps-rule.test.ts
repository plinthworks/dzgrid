import { describe, it, expect } from 'vitest';
import { clientRows, createColumnModel, createKernel, dataKey, localeCtx } from '@dzgrid/core';
import { createRowStore, flatDisplayed } from '@dzgrid/core/internal';
import { treeShape } from '@dzgrid/core/tree';
import { gapsOf, roots, type GapCtx } from '@dzgrid/core/row-gaps';

/**
 * `gapsOf` (1.1.0 step 15, row-gaps.md « API », « Problems »): the rule asked for each shown row but the first; a
 * filler gets `row: null`; `true` is `size`, a number that many pixels; a throw or a bad size: no gap there, one
 * `invalid-gap` per kind, never the row's data. Expectations by hand.
 */
type R = { id: string; p?: string | null; t: string };
const flat = (ts: string[]) => {
  const store = createRowStore<R>((r) => r.id);
  store.replaceAll(ts.map((t, i) => ({ id: `r${i}`, t })));
  return flatDisplayed(store.snapshot, null, 1);
};

describe('asking the rule', () => {
  it('every row but the first, with its row, key, index, level and the row above', () => {
    const seen: string[] = [];
    const rows = flat(['a', 'b', 'c']);
    gapsOf(rows, (c: GapCtx<R>) => void seen.push(`${c.index} ${c.row!.t} ${String(c.key).replace(/^d:\d+:/, '')} ${c.level} ${c.prev!.t}`), 16);
    expect(seen).toEqual(['1 b r1 0 a', '2 c r2 0 b']);
  });

  it('true is the size, a number that many pixels; false, 0, null, undefined: none', () => {
    const rows = flat(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    const answers = [null, true, 7, false, 0, undefined, null];
    expect(gapsOf(rows, (c) => answers[c.index] as never, 16)).toEqual({ at: [1, 2], sizes: [16, 7], problems: [] });
  });

  it('a throw, a negative, NaN, Infinity, a string: no gap there; one problem per kind, no row data', () => {
    const rows = flat(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    const answers: unknown[] = [null, 'x', -1, Number.NaN, Infinity, 'boom', true];
    const r = gapsOf(rows, (c) => {
      if (answers[c.index] === 'boom') throw new Error(`secret ${c.row!.t}`);
      return answers[c.index] as never;
    }, 16);
    expect(r.at).toEqual([6]);
    expect(r.problems).toEqual([
      { code: 'invalid-gap', severity: 'warning', path: 'rowGaps.before', detail: 'not a size' },
      { code: 'invalid-gap', severity: 'warning', path: 'rowGaps.before', detail: 'threw' },
    ]);
    expect(JSON.stringify(r.problems)).not.toMatch(/secret|"e"/);
  });

  it('no rows, one row: nothing asked', () => {
    let asked = 0;
    for (const rows of [flat([]), flat(['a'])]) expect(gapsOf(rows, () => (asked++, true), 16)).toEqual({ at: [], sizes: [], problems: [] });
    expect(asked).toBe(0);
  });
});

describe('in a tree', () => {
  it('roots: a gap before each top-level row but the first; levels and fillers', () => {
    const rows: (R & { path: string[] })[] = [
      { id: 'A', path: ['A'], t: 'A' },
      { id: 'a1', path: ['A', 'a1'], t: 'a1' },
      { id: 'b1', path: ['B', 'b1'], t: 'b1' },
      { id: 'C', path: ['C'], t: 'C' },
    ];
    const columns = createColumnModel<R>([{ id: 't' }]);
    const model = clientRows<R>({ rows, getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'en-US' }), shape: treeShape<R>({ path: (r) => (r as R & { path: string[] }).path, initial: 'all' }) });
    createKernel<R>({ rows: model, columns });
    const seen: string[] = [];
    // A, a1, the filler B, b1, C.
    const r = gapsOf(model.displayed, (c) => (seen.push(`${c.index} ${c.row ? c.row.t : 'null'} ${c.level} ${c.prev ? c.prev.t : 'null'}`), roots(c)), 16);
    expect(seen).toEqual(['1 a1 1 A', '2 null 0 a1', '3 b1 1 null', '4 C 0 b1']);
    expect(r.at).toEqual([2, 4]);
    expect(dataKey('A')).toBeTruthy();
  });

  it('parent ids, A open: roots gives a gap before B only', () => {
    const rows: R[] = [{ id: 'A', t: 'A' }, { id: 'a1', p: 'A', t: 'a1' }, { id: 'B', t: 'B' }];
    const columns = createColumnModel<R>([{ id: 't' }]);
    const model = clientRows<R>({ rows, getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'en-US' }), shape: treeShape<R>({ parentId: (r) => r.p, initial: 'all' }) });
    createKernel<R>({ rows: model, columns });
    expect(gapsOf(model.displayed, roots, 16)).toEqual({ at: [2], sizes: [16], problems: [] });
  });
});
