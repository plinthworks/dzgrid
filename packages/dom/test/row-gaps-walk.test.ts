// A seeded walk over a 10 100-row tree with gaps before each root and pinned parents (1.1.0 step 15, row-gaps.md):
// scrolls, opens, closes, sorts, focus moves. After each step: the layout against a brute-force oracle (each row's box
// top from the rows shown, a gap of 16 before each root but the first), the row at the view's top, the focused row
// mounted, every mounted row placed where the oracle says. Expectations from the oracle, written by hand.
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, idOf, k, tmake, wide, type T } from './support-tree.js';
import { rowGaps, roots } from '../src/row-gaps.js';
import { rng } from '../../core/test/support/spans.js';

afterEach(cleanup);

describe('gaps under virtual scroll: a seeded walk', () => {
  for (const seed of [11, 23, 37]) {
    it(`seed ${seed}: the layout, the top row, the focused row, the mounted rows, against the oracle`, () => {
      const r = rng(seed);
      const t = tmake({ rows: wide(100, 100), block: 400, features: [rowGaps<T>({ before: roots })] });
      const H = t.ctx.rowHeight();
      const oracle = () => {
        const d = t.g.kernel.rows.displayed as never as { count: number; levelAt(i: number): number };
        const tops: number[] = [];
        let y = 0;
        for (let i = 0; i < d.count; i++) {
          if (i > 0 && d.levelAt(i) === 0) y += 16;
          tops.push(y);
          y += H;
        }
        return { tops, total: y };
      };
      let focused: string | null = null;
      for (let step = 0; step < 60; step++) {
        const o = oracle();
        const pick = r.int(5);
        const shown = t.shown();
        if (pick === 0) t.scroll(r.int(Math.max(1, o.total - 400)));
        else if (pick === 1) t.expand([`S${r.int(100)}`], r.next() < 0.7);
        else if (pick === 2) t.g.kernel.dispatch({ type: 'sort.set', sort: r.next() < 0.5 ? [{ column: 'n', dir: r.pick(['asc', 'desc'] as const) }] : [] }, 'user');
        else if (pick === 3) {
          focused = shown[r.int(shown.length)]!;
          t.g.api.focusCell(k(focused), 'name');
        } else if (focused && t.shown().includes(focused)) {
          t.press(r.pick(['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp']));
          focused = idOf(t.ctx.rowRenderer.keyOf(document.activeElement!.closest('.dzg-row')!));
        }
        const now = oracle();
        const L = t.ctx.layout!;
        const d = t.g.kernel.rows.displayed;
        expect(L.total, `step ${step}`).toBe(now.total);
        const top = t.ctx.scroll.logicalTop;
        // The row at the view's top: the last whose slot (its gap, then its box) starts at or above it.
        let want = 0;
        for (let i = 0; i < now.tops.length; i++) if (now.tops[i]! - (i > 0 && (d as never as { levelAt(i: number): number }).levelAt(i) === 0 ? 16 : 0) <= top) want = i;
        if (now.tops.length) expect(L.indexAt(top), `step ${step} top ${top}`).toBe(want);
        // Every mounted row where the oracle puts it.
        const layer = parseFloat(t.ctx.el.layer.style.insetBlockStart || '0');
        for (const [key, v] of t.ctx.rowRenderer.mounted) {
          const i = d.indexOf(key);
          expect(layer + parseFloat(v.el.style.insetBlockStart), `step ${step} row ${idOf(key)}`).toBe(now.tops[i]!);
        }
        // The focused row, still shown, is mounted.
        if (focused && t.shown().includes(focused)) expect(t.ctx.rowRenderer.mounted.has(k(focused)), `step ${step} focus ${focused}`).toBe(true);
      }
    });
  }
});
