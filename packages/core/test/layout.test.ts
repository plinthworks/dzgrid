import { describe, it, expect } from 'vitest';
import { PrefixSums, uniformRowLayout, variableRowLayout, scrollMapper, visibleWindow, overscanRows, MAX_PHYSICAL, createRowStore } from '@dzgrid/core';
import { flatDisplayed } from '@dzgrid/core/internal';

const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const rowsOf = (count: number) => ({ count, index: (n: number) => (Number.isInteger(n) && n >= 0 && n < count ? (n as never) : null) });

describe('PrefixSums drift', () => {
  it('stays within 1e-6 of the exact total after 100 000 fractional updates', () => {
    const next = rng(11);
    const n = 1000;
    const sizes = Array.from({ length: n }, () => next() * 100);
    const ps = new PrefixSums(sizes);
    for (let k = 0; k < 100_000; k++) {
      const i = Math.floor(next() * n);
      const v = next() * 100;
      ps.set(i, v);
      sizes[i] = v;
    }
    const exact = sizes.reduce((a, b) => a + b, 0);
    expect(Math.abs(ps.offsetOf(n) - exact)).toBeLessThan(1e-6);
    ps.rebuild();
    expect(Math.abs(ps.total - exact)).toBeLessThan(1e-6);
  });
});

describe('row layouts', () => {
  it('make positions the displayed rows accept', () => {
    const store = createRowStore<{ id: string }>((r) => r.id);
    store.replaceAll(Array.from({ length: 50 }, (_, i) => ({ id: String(i) })));
    const shown = flatDisplayed(store.snapshot, null, 1);
    const l = variableRowLayout(shown, 20);
    const i = l.indexAt(510);
    expect(shown.index(i)).toBe(25);
    expect(shown.nodeAt(i).id).toBe('25');
  });

  it('clamp an offset past the end to the last row', () => {
    expect(uniformRowLayout(rowsOf(10), 32).indexAt(1e9)).toBe(9);
    expect(uniformRowLayout(rowsOf(10), 32).indexAt(-50)).toBe(0);
  });

  it('never let uniform rows change height', () => {
    const l = uniformRowLayout(rowsOf(10), 32);
    expect(l.setHeight(3 as never, 99)).toBe(false);
    expect(l.total).toBe(320);
  });
});

describe('a million rows, scaled', () => {
  it('reach the last row exactly at the end of the scroll range', () => {
    const count = 1_000_000;
    const l = uniformRowLayout(rowsOf(count), 32);
    const m = scrollMapper(l.total, MAX_PHYSICAL, 700);
    expect(m.scaled).toBe(true);
    const w = visibleWindow(l, new PrefixSums([100]), m, m.maxPhysical, 0, { block: 700, inline: 100 }, { overscanRows: 0, overscanCols: 0 });
    expect(w.rows!.last).toBe(count - 1);
    // The layer offset stays small enough for exact pixels.
    expect(Math.abs(w.placement.layerTop)).toBeLessThan(2 ** 22);
  });

  it('map the middle proportionally', () => {
    const l = uniformRowLayout(rowsOf(1_000_000), 32);
    const m = scrollMapper(l.total, MAX_PHYSICAL, 700);
    const w = visibleWindow(l, new PrefixSums([100]), m, m.maxPhysical / 2, 0, { block: 700, inline: 100 }, { overscanRows: 0, overscanCols: 0 });
    expect(Math.abs(w.rows!.first - 500_000)).toBeLessThan(20);
  });
});

describe('overscanRows', () => {
  it('grows with speed, between its bounds', () => {
    expect(overscanRows(0, 32)).toBe(4);
    expect(overscanRows(3200, 32)).toBe(14);
    expect(overscanRows(1e9, 32)).toBe(40);
    expect(overscanRows(Number.NaN, 32)).toBe(4);
  });
});
