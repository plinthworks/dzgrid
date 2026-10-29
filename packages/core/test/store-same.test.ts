// Rows compared by value (docs/behaviors/row-identity-transactions.md « Rows compared by value », step 16e).
// Expectations by hand.
import { describe, it, expect } from 'vitest';
import { dataKey } from '@dzgrid/core';
import { createRowStore } from '@dzgrid/core/internal';
import { sameValues } from '@dzgrid/core/compare';

type R = { id: string; v: number; path?: string[]; x?: number };
const ten = (): R[] => Array.from({ length: 10 }, (_, i) => ({ id: `r${i}`, v: i, path: ['A', `r${i}`] }));
const copy = (rows: R[]): R[] => JSON.parse(JSON.stringify(rows));

describe('store.replaceAll with sameRow', () => {
  it('10 rows replaced by deep copies with one field changed in row 4: a delta updating row 4 only; row 1 keeps its object', () => {
    const s = createRowStore<R>((r) => r.id, sameValues);
    const first = ten();
    s.replaceAll(first);
    const next = copy(first);
    next[4]!.v = 40;
    const r = s.replaceAll(next);
    expect(r.kind).toBe('delta');
    expect(r.updated).toEqual([dataKey('r4')]);
    expect(r.added).toEqual([]);
    expect(r.removed).toEqual([]);
    expect(s.snapshot.rows[1]).toBe(first[1]);
    expect(s.snapshot.rows[4]).toBe(next[4]);
    expect(s.lastDelta.kind).toBe('update');
  });

  it('every row equal: nothing changed (none), every object the old one', () => {
    const s = createRowStore<R>((r) => r.id, sameValues);
    const first = ten();
    s.replaceAll(first);
    expect(s.replaceAll(copy(first)).kind).toBe('none');
    expect(s.snapshot.rows.every((r, i) => r === first[i])).toBe(true);
  });

  it('6 of 10 really changed: a reset (the > 50 % rule stays)', () => {
    const s = createRowStore<R>((r) => r.id, sameValues);
    s.replaceAll(ten());
    const next = copy(ten());
    for (const i of [0, 1, 2, 3, 4, 5]) next[i]!.v = 100 + i;
    expect(s.replaceAll(next).kind).toBe('reset');
  });

  it('NaN equals NaN; a copied hierarchyPath array is equal', () => {
    const s = createRowStore<R>((r) => r.id, sameValues);
    s.replaceAll([{ id: 'a', v: NaN, path: ['X', 'a'] }, { id: 'b', v: 1 }, { id: 'c', v: 2 }]);
    expect(s.replaceAll([{ id: 'a', v: NaN, path: ['X', 'a'] }, { id: 'b', v: 1 }, { id: 'c', v: 2 }]).kind).toBe('none');
  });

  it('a throwing sameRow: that row counts as changed, one invalid-setting warning per load', () => {
    const s = createRowStore<R>((r) => r.id, (a) => { if (a.id !== 'r9') throw new Error('broken'); return true; });
    s.replaceAll(ten());
    const r = s.replaceAll(copy(ten()));
    // 9 of 10 threw: changed, more than half: a reset.
    expect(r.kind).toBe('reset');
    expect(r.problems.map((p) => [p.code, p.severity, p.path, p.detail])).toEqual([['invalid-setting', 'warning', 'sameRow', 'threw']]);
  });

  it('without sameRow: a deep copy of every row is a reset (as before)', () => {
    const s = createRowStore<R>((r) => r.id);
    s.replaceAll(ten());
    expect(s.replaceAll(copy(ten())).kind).toBe('reset');
  });

  it('added and removed rows as before, the equal ones kept', () => {
    const s = createRowStore<R>((r) => r.id, sameValues);
    const first = ten();
    s.replaceAll(first);
    const next = [{ id: 'n1', v: 1 }, ...copy(first).slice(0, 9)];
    const r = s.replaceAll(next);
    expect(r.kind).toBe('delta');
    expect(r.added).toEqual([dataKey('n1')]);
    expect(r.removed).toEqual([dataKey('r9')]);
    expect(r.updated).toEqual([]);
    expect(s.snapshot.rows[1]).toBe(first[0]);
  });
});
