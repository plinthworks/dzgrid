import { describe, it, expect } from 'vitest';
import { uniformRowLayout, variableRowLayout, type RowLayout } from '@dzgrid/core';
import { sparseRowLayout } from '@dzgrid/core/detail';
import { gapLayout } from '@dzgrid/core/row-gaps';
import { check } from './support/row-gaps.js';

/**
 * `gapLayout` (1.1.0 step 15, docs/behaviors/row-gaps.md « Layout »): a gap belongs to the slot of the row under
 * it — the row's box starts after its gap, `heightOf` is the row's own height, `total` counts every gap, a point in
 * a gap is the row under it. Expectations by hand.
 */
const rowsOf = (count: number) => ({ count, index: (n: number) => (Number.isInteger(n) && n >= 0 && n < count ? (n as never) : null) });
const at = (i: number) => i as never;

describe('over uniform rows', () => {
  // Five rows of 30; a gap of 16 before row 2, one of 10 before row 4.
  const L = gapLayout(uniformRowLayout(rowsOf(5), 30), [2, 4], [16, 10]);

  it('offsets: each row after the gaps above it and its own; heights unchanged; total with every gap', () => {
    expect([0, 1, 2, 3, 4].map((i) => L.offsetOf(at(i)))).toEqual([0, 30, 76, 106, 146]);
    expect([0, 1, 2, 3, 4].map((i) => L.heightOf(at(i)))).toEqual([30, 30, 30, 30, 30]);
    expect(L.total).toBe(176);
    expect(L.count).toBe(5);
    expect(L.uniform).toBe(false);
  });

  it('indexAt: a point in a gap is the row under it; the box edges as in rows', () => {
    // Row 1 ends at 60; the gap is 60–75; row 2's box 76–105; gap 136–145; row 4 146–175.
    expect([0, 29, 30, 59, 60, 75, 76, 105, 106, 135, 136, 145, 146, 175, 176, 999, -5].map((y) => L.indexAt(y))).toEqual([0, 0, 1, 1, 2, 2, 2, 2, 3, 3, 4, 4, 4, 4, 4, 4, 0]);
  });

  it('setHeight goes to the inner layout (false for uniform rows)', () => {
    expect(L.setHeight(at(1), 50)).toBe(false);
  });
});

describe('over rows of their own heights', () => {
  it('reads the inner layout at every call: a height set after is followed', () => {
    const inner = variableRowLayout(rowsOf(3), 20);
    const L = gapLayout(inner, [1], [8]);
    expect([L.offsetOf(at(1)), L.offsetOf(at(2)), L.total]).toEqual([28, 48, 68]);
    expect(L.setHeight(at(0), 40)).toBe(true);
    expect([L.offsetOf(at(1)), L.offsetOf(at(2)), L.heightOf(at(0)), L.total]).toEqual([48, 68, 40, 88]);
    expect([39, 40, 47, 48, 67, 68].map((y) => L.indexAt(y))).toEqual([0, 1, 1, 1, 1, 2]);
  });

  it('over a sparse layout (taller rows), a gap at the last row', () => {
    const inner = sparseRowLayout(rowsOf(4), 10, { at: [1], heights: [30] });
    const L = gapLayout(inner, [3], [5]);
    expect([0, 1, 2, 3].map((i) => L.offsetOf(at(i)))).toEqual([0, 10, 40, 55]);
    expect(L.total).toBe(65);
    expect([49, 50, 54, 55, 64].map((y) => L.indexAt(y))).toEqual([2, 3, 3, 3, 3]);
  });
});

describe('edges', () => {
  it('no gap: the inner layout itself', () => {
    const inner = uniformRowLayout(rowsOf(3), 30);
    expect(gapLayout(inner, [], [])).toBe(inner);
  });

  it('zero-size gaps change nothing but uniform', () => {
    const L = gapLayout(uniformRowLayout(rowsOf(3), 30), [1, 2], [0, 0]);
    expect([0, 1, 2].map((i) => L.offsetOf(at(i)))).toEqual([0, 30, 60]);
    expect([29, 30, 60, 89].map((y) => L.indexAt(y))).toEqual([0, 1, 2, 2]);
    expect(L.total).toBe(90);
  });

  it('two gaps before consecutive rows', () => {
    const L = gapLayout(uniformRowLayout(rowsOf(3), 10), [1, 2], [4, 6]);
    expect([0, 1, 2].map((i) => L.offsetOf(at(i)))).toEqual([0, 14, 30]);
    expect([9, 10, 13, 14, 23, 24, 29, 30].map((y) => L.indexAt(y))).toEqual([0, 1, 1, 1, 1, 2, 2, 2]);
  });
});

describe('the oracle catches a layout that puts a row\'s gap after it (planted fault)', () => {
  it('fails', () => {
    const heights = [10, 10, 10];
    const gaps = new Map([[1, 5]]);
    const inner = uniformRowLayout(rowsOf(3), 10);
    const wrong: RowLayout = { ...inner, uniform: false, total: 35, offsetOf: (i) => (i as number) * 10 + ((i as number) > 1 ? 5 : 0), indexAt: (y) => at(y < 10 ? 0 : y < 25 ? 1 : 2) };
    expect(check(wrong, heights, gaps).length).toBeGreaterThan(0);
    expect(check(gapLayout(inner, [1], [5]), heights, gaps)).toEqual([]);
  });
});
