import { describe, it, expect } from 'vitest';
import type { DisplayIndex } from '@dzgrid/core';
import { sparseRowLayout, type SparseLayout } from '@dzgrid/core/detail';
import { mulberry32 } from './support/rng.js';

/**
 * `sparseRowLayout` (Phase 4 step 8, plan D7, spike S12) against a brute-force oracle: every row's
 * height in an array, offsets as running sums. Random opens and closes (a new layout), single and
 * batched height changes, probes at every edge; exact equality (integer and half-pixel heights).
 */
const rowsOf = (count: number) => ({ count, index: (n: number) => (Number.isInteger(n) && n >= 0 && n < count ? (n as DisplayIndex) : null) });
const I = (n: number) => n as DisplayIndex;

class Oracle {
  readonly hs: Float64Array;
  cum = new Float64Array(0);
  constructor(readonly count: number, readonly h: number, at: number[], heights: number[]) {
    this.hs = new Float64Array(count).fill(h);
    at.forEach((i, j) => (this.hs[i] = heights[j]!));
    this.sum();
  }
  sum() {
    this.cum = new Float64Array(this.count + 1);
    for (let i = 0; i < this.count; i++) this.cum[i + 1] = this.cum[i]! + this.hs[i]!;
  }
  get total() { return this.cum[this.count]!; }
  /** The row whose box holds the offset; clamped; NaN and below 0 → the first. */
  indexAt(off: number): number {
    if (!(off >= 0)) return 0;
    if (off >= this.total) return this.count - 1;
    let lo = 0, hi = this.count - 1;
    while (lo < hi) {
      const m = (lo + hi + 1) >>> 1;
      if (this.cum[m]! <= off) lo = m;
      else hi = m - 1;
    }
    return lo;
  }
}

function check(L: SparseLayout, o: Oracle, r: () => number, probes: number, every: boolean): string | null {
  if (L.count !== o.count) return `count ${L.count} ≠ ${o.count}`;
  if (L.total !== o.total) return `total ${L.total} ≠ ${o.total}`;
  const n = o.count;
  const rows = every ? Array.from({ length: n }, (_, i) => i) : Array.from({ length: probes }, () => Math.floor(r() * n));
  for (const i of rows) {
    if (L.offsetOf(I(i)) !== o.cum[i]) return `offsetOf(${i}) ${L.offsetOf(I(i))} ≠ ${o.cum[i]}`;
    if (L.heightOf(I(i)) !== o.hs[i]) return `heightOf(${i}) ${L.heightOf(I(i))} ≠ ${o.hs[i]}`;
    for (const off of [o.cum[i]!, o.cum[i]! + o.hs[i]! / 2, o.cum[i]! + o.hs[i]! - 0.25, o.cum[i]! - 0.25]) {
      if (L.indexAt(off) !== o.indexAt(off)) return `indexAt(${off}) ${L.indexAt(off)} ≠ ${o.indexAt(off)} (row ${i})`;
    }
  }
  if (n && L.offsetOf(I(n)) !== o.total) return `offsetOf(count) ${L.offsetOf(I(n))} ≠ ${o.total}`;
  for (const off of [-1, -0.5, NaN, o.total, o.total - 0.25, o.total + 5, 1e12, ...Array.from({ length: probes }, () => r() * o.total)]) {
    if (n && L.indexAt(off) !== o.indexAt(off)) return `indexAt(${off}) ${L.indexAt(off)} ≠ ${o.indexAt(off)}`;
  }
  return null;
}

/** A random set of D distinct rows, increasing. */
function pick(r: () => number, count: number, D: number): number[] {
  const s = new Set<number>();
  while (s.size < Math.min(D, count)) s.add(Math.floor(r() * count));
  return [...s].sort((a, b) => a - b);
}
const heightFrom = (r: () => number, h: number) => {
  const v = r();
  return v < 0.1 ? 0 : v < 0.2 ? h : v < 0.3 ? h / 2 : Math.floor(r() * 600) + (r() < 0.3 ? 0.5 : 0);
};

describe('sparseRowLayout against a brute-force oracle', () => {
  it('1 000 seeds: opens, closes, single and batched height changes, every row probed', () => {
    for (let seed = 1; seed <= 1000; seed++) {
      const r = mulberry32(seed);
      const count = Math.floor(r() * 300);
      const h = [32, 24.5, 1, 40][Math.floor(r() * 4)]!;
      for (let rebuild = 0; rebuild < 3; rebuild++) {
        const at = pick(r, count, Math.floor(r() * Math.min(count, 40)));
        const heights = at.map(() => heightFrom(r, h));
        const L = sparseRowLayout(rowsOf(count), h, { at, heights });
        const o = new Oracle(count, h, at, heights);
        let bad = check(L, o, r, 50, true);
        expect(bad, `seed ${seed} build`).toBe(null);
        for (let step = 0; step < 6 && at.length; step++) {
          if (r() < 0.5) {
            const i = at[Math.floor(r() * at.length)]!;
            const v = heightFrom(r, h);
            const changed = o.hs[i] !== v;
            expect(L.setHeight(I(i), v), `seed ${seed} setHeight`).toBe(changed);
            o.hs[i] = v;
          } else {
            const batch: [DisplayIndex, number][] = Array.from({ length: 1 + Math.floor(r() * 5) }, () => [I(at[Math.floor(r() * at.length)]!), heightFrom(r, h)]);
            // A row that is not an extra keeps its height (a plain row's height is the layout's).
            if (count && r() < 0.3) batch.push([I(Math.floor(r() * count)), 77]);
            // True when a height was set to another value on the way (set and set back counts).
            let changed = false;
            for (const [i, v] of batch) if (at.includes(i)) (changed ||= o.hs[i] !== v), (o.hs[i] = v);
            expect(L.setHeights(batch), `seed ${seed} setHeights`).toBe(changed);
          }
          o.sum();
          bad = check(L, o, r, 50, true);
          expect(bad, `seed ${seed} step ${step}`).toBe(null);
        }
      }
    }
  });

  it('a row that is not an extra: setHeight changes nothing and says so', () => {
    const L = sparseRowLayout(rowsOf(10), 32, { at: [3], heights: [240] });
    expect(L.setHeight(I(4), 100)).toBe(false);
    expect(L.setHeight(I(3), 240)).toBe(false);
    expect(L.setHeights([])).toBe(false);
    expect(L.total).toBe(9 * 32 + 240);
    expect(L.setHeight(I(3), 100)).toBe(true);
    expect(L.total).toBe(9 * 32 + 100);
  });

  it('a batch: the last height of a row wins, the sums made once; a plain row is left alone', () => {
    const L = sparseRowLayout(rowsOf(10), 32, { at: [1, 5, 8], heights: [100, 100, 100] });
    expect(L.setHeights([[I(5), 10], [I(1), 50], [I(5), 20]])).toBe(true);
    expect([L.heightOf(I(1)), L.heightOf(I(5)), L.offsetOf(I(6)), L.offsetOf(I(9))]).toEqual([50, 20, 32 + 50 + 3 * 32 + 20, 32 + 50 + 3 * 32 + 20 + 2 * 32 + 100]);
    // Set and set back in one batch: told as a change (the sums made again, the same).
    expect(L.setHeights([[I(5), 99], [I(5), 20]])).toBe(true);
    expect(L.offsetOf(I(9))).toBe(32 + 50 + 3 * 32 + 20 + 2 * 32 + 100);
    expect(L.setHeights([[I(5), 20], [I(4), 1]])).toBe(false);
  });

  it('no rows: total 0; no extras: the uniform layout', () => {
    const E = sparseRowLayout(rowsOf(0), 32, { at: [], heights: [] });
    expect([E.count, E.total]).toEqual([0, 0]);
    const U = sparseRowLayout(rowsOf(5), 32, { at: [], heights: [] });
    expect([U.total, U.offsetOf(I(4)), U.indexAt(100), U.heightOf(I(2)), U.uniform]).toEqual([160, 128, 3, 32, false]);
  });

  it('refuses heights that are not sizes (programming errors); the rows of `at` are trusted (the shape makes them)', () => {
    for (const heights of [[-1], [NaN], [Infinity], []]) expect(() => sparseRowLayout(rowsOf(10), 32, { at: [1], heights }), String(heights)).toThrow(RangeError);
    const L = sparseRowLayout(rowsOf(10), 32, { at: [1], heights: [5] });
    expect(() => L.setHeight(I(1), -2)).toThrow(RangeError);
    expect(() => L.setHeights([[I(1), NaN]])).toThrow(RangeError);
    expect(L.heightOf(I(1))).toBe(5);
  });

  it('1 000 000 rows × 2 000 details of 240 px (S12): exact at both ends and everywhere probed, through height changes', () => {
    const r = mulberry32(12);
    const count = 1_000_000 + 2_000;
    // As S12: masters spread over the list, the last displayed row a detail.
    const at = Array.from({ length: 2000 }, (_, j) => Math.round((j * (count - 1)) / 1999));
    const heights = at.map(() => 240);
    const L = sparseRowLayout(rowsOf(count), 32, { at, heights });
    const o = new Oracle(count, 32, at, heights);
    expect(L.total).toBe(1_000_000 * 32 + 2000 * 240);
    expect(L.indexAt(L.total - 0.001)).toBe(count - 1);
    expect(L.offsetOf(I(count - 1)) + L.heightOf(I(count - 1))).toBe(L.total);
    expect(check(L, o, r, 20_000, false)).toBe(null);
    for (const i of at.slice(0, 50)) for (const off of [o.cum[i]!, o.cum[i]! + 239.5, o.cum[i + 1] ?? 0]) expect(L.indexAt(off)).toBe(o.indexAt(off));
    for (let round = 0; round < 5; round++) {
      const batch: [DisplayIndex, number][] = Array.from({ length: 50 }, () => [I(at[Math.floor(r() * at.length)]!), Math.floor(r() * 800)]);
      L.setHeights(batch);
      for (const [i, v] of batch) o.hs[i] = v;
      const i = at[Math.floor(r() * at.length)]!;
      L.setHeight(I(i), 777);
      o.hs[i] = 777;
      o.sum();
      expect(check(L, o, r, 5_000, false), `round ${round}`).toBe(null);
    }
  });
});
