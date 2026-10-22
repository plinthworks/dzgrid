// Sticky parent rows, the pure stack (docs/behaviors/tree-sticky.md, sticky-blueprint.md, decisions.md
// Q10–Q11): `stickyStack` against a brute-force oracle written from the sheet — linear scans, whole
// ancestor paths, unbounded rounds — over 1 000 seeded trees, uniform and mixed heights; then hand cases
// and the 1 000 000-row profile's cost. Expectations by hand, from the sheet.
import { describe, it, expect } from 'vitest';
import { variableRowLayout, uniformRowLayout } from '@dzgrid/core';
import { stickyStack, type StackInput } from '../src/tree/sticky.js';
import { treeProfile } from '../../../perf/profiles/tree.js';
import { stickyOracle as oracle } from './support-sticky.js';

/** A small seeded generator (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mint = (count: number) => ({ count, index: (i: number) => (i >= 0 && i < count ? (i as never) : undefined) });

/** The rows shown, as a tree view gives them: each row's level (a child right under its parent's subtree). */
function input(levels: readonly number[], heights: readonly number[] | number, o: { top: number; n: number; viewBlock: number; h?: number }): StackInput {
  const count = levels.length;
  const layout = typeof heights === 'number' ? uniformRowLayout(mint(count) as never, heights) : variableRowLayout(mint(count) as never, 32, Float64Array.from(heights));
  // Parents by a stack walk (the fast function is given them, as the DOM gives `parentOf`).
  const parent = new Int32Array(count);
  const path: number[] = [];
  for (let i = 0; i < count; i++) {
    path.length = levels[i]!;
    parent[i] = levels[i]! > 0 ? path[levels[i]! - 1]! : -1;
    path.push(i);
  }
  return {
    top: o.top, n: o.n, viewBlock: o.viewBlock, h: o.h ?? 32, count,
    layout: { offsetOf: (i) => layout.offsetOf(i as never), heightOf: (i) => layout.heightOf(i as never), indexAt: (y) => layout.indexAt(y) },
    levelAt: (i) => levels[i]!,
    ancestorOf: (i) => parent[i]!,
  };
}

/** A random tree view: `count` rows, each at most one level under the row before it. */
function randomTree(r: () => number, count: number, deep: number): number[] {
  const levels: number[] = [];
  for (let i = 0; i < count; i++) {
    const prev = i ? levels[i - 1]! : -1;
    const x = r();
    levels.push(i === 0 ? 0 : x < deep ? prev + 1 : Math.floor(r() * (prev + 1)));
  }
  return levels;
}

const stack = (levels: number[], heights: number[] | number, o: { top: number; n: number; viewBlock: number; h?: number }) => {
  const s = stickyStack(input(levels, heights, o));
  return { at: s.at, y: s.y, height: s.height };
};

describe('stickyStack against the oracle', () => {
  it('agrees on 1 000 seeded trees, at many scroll tops, uniform and mixed heights, n 0 / 1 / 3 / any / unbounded', () => {
    let compared = 0;
    let nonEmpty = 0;
    let pushed = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      const r = rng(seed);
      const count = 1 + Math.floor(r() * 160);
      const levels = randomTree(r, count, 0.25 + r() * 0.5);
      const heights = r() < 0.5 ? 32 : levels.map(() => 16 + Math.floor(r() * 64));
      const total = typeof heights === 'number' ? count * heights : heights.reduce((a, b) => a + b, 0);
      const ns = [0, 1, 3, 1 + Math.floor(r() * 8), Infinity];
      const viewBlock = 60 + Math.floor(r() * 600);
      for (let k = 0; k < 12; k++) {
        const top = k === 0 ? 0 : Math.floor(r() * total);
        for (const n of ns) {
          const want = oracle(levels, heights, { top, n, viewBlock });
          expect(stack(levels, heights, { top, n, viewBlock }), `seed ${seed} top ${top} n ${n}`).toEqual(want);
          compared++;
          if (want.at.length) nonEmpty++;
          if (want.y.some((y, s) => y < (s === 0 ? 0 : want.y[s - 1]! + 1))) pushed++;
        }
      }
    }
    // The cases met are not all empty: stacks, and pushed ones.
    expect(compared).toBe(60_000);
    expect(nonEmpty).toBeGreaterThan(5_000);
    expect(pushed).toBeGreaterThan(300);
  });

  it('keeps its properties: at most n (and half the view), outermost first, a chain of parents, a prefix of slots', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const r = rng(seed * 7);
      const count = 2 + Math.floor(r() * 120);
      const levels = randomTree(r, count, 0.6);
      const inp = (top: number, n: number) => input(levels, 32, { top, n, viewBlock: 400 });
      for (let k = 0; k < 20; k++) {
        const top = Math.floor(r() * count * 32);
        for (const n of [1, 2, 3, 5]) {
          const s = stickyStack(inp(top, n));
          expect(s.at.length).toBeLessThanOrEqual(Math.min(n, 6));
          for (let j = 1; j < s.at.length; j++) {
            // Each copy's parent is the copy above it; the slots are filled from the top.
            expect(inp(top, n).ancestorOf(s.at[j]!)).toBe(s.at[j - 1]);
            expect(s.y[j]!).toBeLessThanOrEqual(s.y[j - 1]! + 32);
          }
          expect(s.height).toBe(s.at.length ? Math.max(...s.y.map((y) => y + 32)) : 0);
        }
      }
    }
  });

  it('never covers a row outside the copy’s own subtree when every ancestor fits (n ≥ the depth)', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const r = rng(seed * 13);
      const count = 2 + Math.floor(r() * 120);
      const levels = randomTree(r, count, 0.5);
      const hs = levels.map(() => (r() < 0.5 ? 32 : 20 + Math.floor(r() * 50)));
      const off: number[] = [];
      let sum = 0;
      for (const h of hs) off.push(sum), (sum += h);
      const endOf = (c: number) => {
        for (let j = c + 1; j < count; j++) if (levels[j]! <= levels[c]!) return j;
        return count;
      };
      for (let k = 0; k < 20; k++) {
        const top = Math.floor(r() * sum);
        const s = stack(levels, hs, { top, n: Infinity, viewBlock: 100_000 });
        s.at.forEach((c, j) => {
          const a = Math.max(0, s.y[j]!);
          const b = s.y[j]! + hs[c]!;
          for (let i = 0; i < count; i++) {
            const ra = off[i]! - top;
            const rb = ra + hs[i]!;
            if (Math.min(b, rb) - Math.max(a, ra) > 0) expect(i >= c && i < endOf(c), `seed ${seed} top ${top} copy ${c} over row ${i}`).toBe(true);
          }
        });
      }
    }
  });
});

describe('stickyStack by hand (rows 32 px, view 320 px)', () => {
  // 0 S0
  // 1   P1
  // 2     V1
  // 3     V2
  // 4     V3
  // 5   P2
  // 6 S1
  // 7   P3
  const L = [0, 1, 2, 2, 2, 1, 0, 1];
  const at = (top: number, n = 3, viewBlock = 320) => stack(L, 32, { top, n, viewBlock });

  it('shows nothing at the very top, nor on a root row at the top', () => {
    expect(at(0)).toEqual({ at: [], y: [], height: 0 });
    expect(at(6 * 32)).toEqual({ at: [], y: [], height: 0 });
  });

  it('pins an open parent as soon as its row starts above the top, then its own open child under it', () => {
    // S0 one pixel under the top: S0 pinned; its edge at 33 px, on P1, open and started above: P1 too.
    expect(at(1)).toEqual({ at: [0, 1], y: [0, 32], height: 64 });
    // Deeper: S0 and P1 over V1, V2.
    expect(at(2 * 32 + 5)).toEqual({ at: [0, 1], y: [0, 32], height: 64 });
  });

  it('n 1: the nearest parent only; n 0: none', () => {
    expect(at(2 * 32 + 5, 1)).toEqual({ at: [1], y: [0], height: 32 });
    expect(at(2 * 32 + 5, 0)).toEqual({ at: [], y: [], height: 0 });
  });

  it('pushes a copy up when its subtree ends above its slot, then drops it', () => {
    // top 100: edge 164 on row 5 (P2, outside P1): P1's subtree ends at 160, P1 pushed to 160 − 100 − 32 = 28.
    expect(at(100)).toEqual({ at: [0, 1], y: [0, 28], height: 60 });
    // top 130: P1 pushed to −2 (behind S0); S0's subtree ends at row 6 (192): 192 − 130 − 32 = 30 > 0: S0 stays.
    expect(at(130)).toEqual({ at: [0, 1], y: [0, -2], height: 32 });
    // top 170: S0 alone (row 5 is P2, a leaf), pushed by S1 at 192: 192 − 170 − 32 = −10.
    expect(at(170)).toEqual({ at: [0], y: [-10], height: 22 });
    // top 191: −31, still there; 192: S1 at the top, nothing.
    expect(at(191)).toEqual({ at: [0], y: [-31], height: 1 });
    expect(at(192)).toEqual({ at: [], y: [], height: 0 });
  });

  it('caps the copies at half the view: 100 px of view, 32 px rows → one', () => {
    expect(at(2 * 32 + 5, 3, 100)).toEqual({ at: [1], y: [0], height: 32 });
    expect(at(2 * 32 + 5, 3, 60)).toEqual({ at: [], y: [], height: 0 });
  });

  it('reads heights per row (step 9 ready): a tall parent takes its own height', () => {
    const hs = [80, 32, 32, 32, 32, 32, 32, 32];
    // top 10: S0 (80 px) pinned; its edge at 90 on P1 (80–112), open, started above: P1 at 80.
    expect(stack(L, hs, { top: 10, n: 3, viewBlock: 400 })).toEqual({ at: [0, 1], y: [0, 80], height: 112 });
  });

  it('settles in a few rounds: at most n + 2 on uniform rows', () => {
    const deep = Array.from({ length: 40 }, (_, i) => i);
    for (const n of [1, 2, 3, 4]) {
      for (let top = 0; top < 40 * 32; top += 7) {
        const s = stickyStack(input(deep, 32, { top, n, viewBlock: 2000 }));
        expect(s.rounds).toBeLessThanOrEqual(n + 2);
      }
    }
  });
});

describe('stickyStack on the 1 000 000-row profile', () => {
  it('costs ≤ 0.2 ms a frame (mean and 99th percentile over 20 000 scroll tops, everything open)', () => {
    const rows = treeProfile(1_000_000);
    // Everything open: depth first from the roots, children in their order.
    const kids = new Map<string | null, number[]>();
    rows.forEach((r, i) => (kids.get(r.parent) ?? kids.set(r.parent, []).get(r.parent)!).push(i));
    const id = new Map(rows.map((r, i) => [r.id, i]));
    const levels: number[] = [];
    const todo: number[] = [...(kids.get(null) ?? [])].reverse();
    while (todo.length) {
      const i = todo.pop()!;
      levels.push(rows[i]!.level);
      const k = kids.get(rows[i]!.id);
      if (k) for (let j = k.length - 1; j >= 0; j--) todo.push(k[j]!);
    }
    expect(levels.length).toBe(1_000_000);
    expect(id.size).toBe(1_000_000);
    const r = rng(42);
    const times: number[] = [];
    let shown = 0;
    const base = input(levels, 32, { top: 0, n: 3, viewBlock: 720 });
    for (let k = 0; k < 20_000; k++) {
      const top = Math.floor(r() * 1_000_000 * 32);
      const t0 = performance.now();
      const s = stickyStack({ ...base, top });
      times.push(performance.now() - t0);
      shown += s.at.length;
    }
    times.sort((a, b) => a - b);
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    const p99 = times[Math.floor(times.length * 0.99)]!;
    expect(shown).toBeGreaterThan(20_000);
    expect(mean).toBeLessThanOrEqual(0.2);
    expect(p99).toBeLessThanOrEqual(0.2);
  });
});
