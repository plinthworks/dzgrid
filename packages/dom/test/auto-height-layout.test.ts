// Automatic row height, the pure part (Phase 6 step 9, docs/phase-6-steps/step09-plan.md §1, §3, §4;
// docs/behaviors/auto-height.md 3, 5, 7, 8): which measured rows become rows of their own height, by
// display index, merged with a detail panel's. Written before the code; expectations by hand.
import { describe, it, expect } from 'vitest';
import type { RowKey } from '@dzgrid/core';
import { sparseRowLayout } from '@dzgrid/core/detail';
import { extrasOf } from '../src/auto-height/layout.js';

/** Displayed rows A..J (or the order given): a key's index, -1 when not shown. */
const rows = (order = 'ABCDEFGHIJ') => ({ count: order.length, index: (i: number) => i as never, indexOf: (k: RowKey) => order.indexOf(String(k)) as never });
const K = (s: string) => s as RowKey;

describe('extrasOf (step 9 §1: memory O(tall rows))', () => {
  const cache = new Map<RowKey, number>([[K('C'), 50], [K('A'), 20], [K('F'), 30], [K('H'), 90], [K('Z'), 60], [K('B'), Number.NaN], [K('D'), -5], [K('E'), Number.POSITIVE_INFINITY]]);

  it('only rows taller than the row height become extras, ascending by display index', () => {
    // A is shorter (the floor wins), F exactly h (no extra), Z not shown, NaN / negative / Infinity never enter.
    expect(extrasOf(rows(), cache, 30)).toEqual({ at: [2, 7], heights: [50, 90] });
  });

  it('indices follow the displayed order (a sort or a filter): keys, not old indices', () => {
    // Reversed: H at 2, C at 7; then a filter that hides C.
    expect(extrasOf(rows('JIHGFEDCBA'), cache, 30)).toEqual({ at: [2, 7], heights: [90, 50] });
    expect(extrasOf(rows('ABDEFGHIJ'), cache, 30)).toEqual({ at: [6], heights: [90] });
  });

  it('a lower row height turns more measured rows into extras (density change, cache kept by key)', () => {
    expect(extrasOf(rows(), cache, 24)).toEqual({ at: [2, 5, 7], heights: [50, 30, 90] });
  });

  it('merged with a detail panel\'s extras: both kept, none lost, none doubled, still ascending', () => {
    const inner = { at: [1, 4, 9], heights: [100, 10, 200] };
    expect(extrasOf(rows(), cache, 30, inner)).toEqual({ at: [1, 2, 4, 7, 9], heights: [100, 50, 10, 90, 200] });
    // A panel's height below h is kept (it is the panel's own); an inner extra first and last.
    expect(extrasOf(rows(), new Map([[K('A'), 40], [K('J'), 70]]), 30, { at: [3], heights: [5] })).toEqual({ at: [0, 3, 9], heights: [40, 5, 70] });
    // The same index twice (never in practice): the panel's.
    expect(extrasOf(rows(), new Map([[K('B'), 40]]), 30, { at: [1], heights: [77] })).toEqual({ at: [1], heights: [77] });
  });

  it('an empty cache gives no extras (a uniform total), with or without inner extras', () => {
    expect(extrasOf(rows(), new Map(), 30)).toEqual({ at: [], heights: [] });
    expect(extrasOf(rows(), new Map(), 30, { at: [2], heights: [8] })).toEqual({ at: [2], heights: [8] });
  });

  it('the merged extras make a layout whose offsets and indexAt are those of the measured heights', () => {
    const d = rows();
    const L = sparseRowLayout(d, 30, extrasOf(d, cache, 30));
    // Rows: 0,1 @30; 2 @50; 3..6 @30; 7 @90; 8,9 @30. Offsets by hand.
    expect([0, 1, 2, 3, 7, 8, 9].map((i) => L.offsetOf(i as never))).toEqual([0, 30, 60, 110, 230, 320, 350]);
    expect(L.total).toBe(380);
    expect([59, 60, 109, 110, 229, 230, 319, 320, 379, 380, -1].map((o) => L.indexAt(o))).toEqual([1, 2, 2, 3, 6, 7, 7, 8, 9, 9, 0]);
  });
});
