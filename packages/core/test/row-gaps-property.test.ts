import { describe, it, expect } from 'vitest';
import { uniformRowLayout, variableRowLayout } from '@dzgrid/core';
import { gapLayout } from '@dzgrid/core/row-gaps';
import { rng } from './support/spans.js';
import { check } from './support/row-gaps.js';

/** `gapLayout` against the brute-force oracle (every pixel's row) over seeded layouts, uniform and of their own heights. */
const rowsOf = (count: number) => ({ count, index: (n: number) => (Number.isInteger(n) && n >= 0 && n < count ? (n as never) : null) });

describe('gapLayout: 500 seeded layouts against the oracle', () => {
  it('offsets, heights, total, the row at every pixel', () => {
    const bad: string[] = [];
    for (let s = 0; s < 500; s++) {
      const r = rng(777 + s * 31);
      const n = 1 + r.int(40);
      const uniform = r.next() < 0.5;
      const h = 1 + r.int(30);
      const heights = Array.from({ length: n }, () => (uniform ? h : r.int(30)));
      const inner = uniform ? uniformRowLayout(rowsOf(n), h) : variableRowLayout(rowsOf(n), 0, Float64Array.from(heights));
      const at: number[] = [];
      const sizes: number[] = [];
      for (let i = 1; i < n; i++) if (r.next() < 0.25) at.push(i), sizes.push(r.int(20));
      const v = check(gapLayout(inner, at, sizes), heights, new Map(at.map((a, j) => [a, sizes[j]!])));
      if (v.length) bad.push(`seed ${s}: ${v.slice(0, 3).join(', ')}`);
    }
    expect(bad).toEqual([]);
  });
});
