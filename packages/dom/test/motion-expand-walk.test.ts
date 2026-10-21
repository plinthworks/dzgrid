// A random walk of tree motion (Phase 4 step 6) with real GSAP in jsdom, against a motion:false
// twin: toggles, expand-all/collapse-all, '*', sorts, quick filters, transactions and scrolls, often
// two in the same frame; the reduced-motion setting flipped mid-glide; the grid destroyed mid-glide.
// After every paint: same DOM rows, aria-rowindex, aria-expanded, focus and layout (inset-block-start,
// block-size) as the twin; at most 20 fades and 60 glides a paint, no glide over a screen; under
// reduced motion no tween and no hook call. At the end nothing is left on any row.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { gsap } from 'gsap';
import { motion } from '../src/motion-gsap.js';
import type { GridSettings } from '../src/settings.js';
import { changeMedia, clock, leftovers, media, stubMedia } from './support-motion.js';
import { cleanup, idOf, k, tmake, wide, type T, type TMake } from './support-tree.js';

beforeEach(() => {
  media.reduce = false;
  clock.now = 1000;
  stubMedia();
});
afterEach(() => {
  cleanup();
  gsap.globalTimeline.clear();
});

/** The OS setting flips; a few real milliseconds first, as a person cannot flip it twice in 2 ms. */
const flipMedia = (reduce: boolean): void => {
  const t0 = Date.now();
  while (Date.now() - t0 < 4);
  changeMedia(reduce);
};
const rng = (seed: number) => () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const running = (): number => gsap.globalTimeline.getChildren(true, true, false).filter((t) => t.progress() < 1).length;
const finish = (): void => {
  for (let i = 0; i < 5; i++) for (const t of gsap.globalTimeline.getChildren(true, true, false)) if (t.progress() < 1) t.progress(1);
};

function grid(rows: T[], block: number, settings: Partial<GridSettings<T>>, features: TMake['features'] = []) {
  const queue: FrameRequestCallback[] = [];
  const raf = { requestAnimationFrame: (cb: FrameRequestCallback) => queue.push(cb), cancelAnimationFrame: () => {} };
  const t = tmake({ rows, features, raf, block, settings });
  const frame = (): void => {
    for (let i = 0; i < 5 && queue.length; i++) for (const cb of queue.splice(0)) cb(clock.now);
  };
  frame();
  const rowEls = () => [...t.host.querySelectorAll<HTMLElement>('.dzg-layer > .dzg-row')];
  const dom = () => rowEls().map((r) => `${idOf(t.ctx.rowRenderer.keyOf(r))}@${r.getAttribute('aria-rowindex')}:${r.getAttribute('aria-expanded')}`);
  const layout = () => rowEls().map((r) => `${idOf(t.ctx.rowRenderer.keyOf(r))}:${r.style.getPropertyValue('inset-block-start')}/${r.style.getPropertyValue('block-size')}`).sort();
  return { ...t, frame, dom, layout, rowEls };
}

type G = ReturnType<typeof grid>;

describe('tree motion walk against a motion:false twin', () => {
  for (const [seed, block, hostTweens] of [[3, 320, false], [11, 320, true], [27, 2400, false], [64, 640, true], [101, 320, true], [7, 2400, true]] as const) {
    it(`seed ${seed} (view ${block}px${hostTweens ? ', host tweens' : ''}): twin-equal DOM, aria, focus, layout; caps; nothing under reduced motion; nothing left`, async () => {
      const rand = rng(seed);
      const hookedReduced: string[] = [];
      const m = motion({
        gsap,
        onRow: (el, c, why) => {
          if (media.reduce) hookedReduced.push(`${idOf(c.key)}:${why}`);
          if (hostTweens && c.index % 5 === 0) gsap.to(el, { scale: 1.01, duration: 0.2 });
          if (c.index % 11 === 0) return false;
        },
      });
      const rows = wide(14, 6);
      const a = grid(rows, block, {}, [m]);
      const b = grid(rows, block, { motion: false });
      await m.load();
      clock.now += 1000;
      const fromTo = vi.spyOn(gsap, 'fromTo');
      let nextId = 0;
      let animated = 0;
      let steps = 0;
      let reducedSteps = 0;
      const parents = () => a.shown().filter((id) => id !== null && /^S\d+$/.test(id)) as string[];
      const shownIds = () => a.shown().filter(Boolean) as string[];
      const pick = <X,>(xs: readonly X[]): X | undefined => xs[Math.floor(rand() * xs.length)];
      /** One operation on both grids (no paint), or null for one that paints itself. */
      const op = (): ((g: G) => void) | 'star' | 'media' => {
        const o = Math.floor(rand() * 10);
        const p = [rand(), rand(), rand()];
        if (o <= 2) {
          const id = pick(parents()) ?? 'S0';
          const open = p[0]! < 0.55;
          return (g) => void g.g.kernel.dispatch({ type: 'rows.expand', rows: [k(id)], expanded: open }, 'user');
        }
        if (o === 3) return (g) => void g.g.kernel.dispatch({ type: 'rows.expandAll', expanded: p[0]! < 0.5 }, 'user');
        if (o === 4) return 'star';
        if (o === 5) return (g) => void g.g.kernel.dispatch({ type: 'sort.set', sort: p[0]! < 0.2 ? [] : [{ column: p[1]! < 0.5 ? 'n' : 'name', dir: p[2]! < 0.5 ? 'asc' : 'desc' }] }, 'user');
        if (o === 6) return (g) => void g.g.kernel.dispatch({ type: 'quick.set', text: p[0]! < 0.5 ? '' : `Patient ${Math.floor(p[1]! * 14)}` }, 'user');
        if (o === 7) {
          const id = `X${nextId++}`;
          const parent = pick(parents()) ?? 'S0';
          const victim = pick(shownIds().filter((x) => x.includes('-') || x.startsWith('X')));
          const kind = p[0]!;
          return (g) => {
            if (kind < 0.4) g.g.kernel.rows.applyTransaction({ add: [{ id, parent, name: `Extra ${id}`, n: Math.floor(p[1]! * 9) }] });
            else if (kind < 0.7 && victim) g.g.kernel.rows.applyTransaction({ remove: [victim] });
            else g.g.kernel.rows.applyTransaction({ update: rows.slice(0, 1 + Math.floor(p[1]! * 6)).map((r) => ({ ...r, n: r.n + 100 + steps })) });
          };
        }
        if (o === 8) {
          const top = Math.floor(p[0]! * 60) * 32;
          return (g) => g.scroll(top);
        }
        return 'media';
      };
      for (let step = 0; step < 90; step++, steps++) {
        clock.now += rand() < 0.25 ? 30 : 400;
        const ops = [op()];
        // Often a second change before the same paint.
        if (rand() < 0.35) ops.push(op());
        fromTo.mockClear();
        hookedReduced.length = 0;
        for (const x of ops) {
          if (x === 'media') flipMedia(!media.reduce);
          else if (x === 'star') {
            const id = pick(shownIds()) ?? 'S0';
            for (const g of [a, b]) {
              g.focus(id);
              g.frame();
              g.press('*');
            }
          } else for (const g of [a, b]) x(g);
        }
        const reducedAtPaint = media.reduce;
        a.frame();
        b.frame();
        if (reducedAtPaint) reducedSteps++;
        const where = `step ${step} ops ${ops.map((x) => (typeof x === 'string' ? x : 'f')).join('+')}`;
        expect(a.dom(), where).toEqual(b.dom());
        expect(a.layout(), where).toEqual(b.layout());
        expect(a.g.kernel.focus, where).toEqual(b.g.kernel.focus);
        const rowCalls = fromTo.mock.calls.filter(([el]) => (el as HTMLElement).classList?.contains('dzg-row'));
        const fades = rowCalls.filter(([, from]) => (from as { opacity?: number }).opacity === 0);
        const glides = rowCalls.filter(([, from]) => 'y' in (from as unknown as object));
        expect(fades.length, `${where}: fades`).toBeLessThanOrEqual(20);
        expect(glides.length, `${where}: glides`).toBeLessThanOrEqual(60);
        for (const [, from] of glides) expect(Math.abs((from as unknown as { y: number }).y), `${where}: glide over a screen`).toBeLessThanOrEqual(a.ctx.viewBlock);
        if (reducedAtPaint) {
          expect(rowCalls, `${where}: tween under reduced motion`).toEqual([]);
          expect(hookedReduced, `${where}: hook under reduced motion`).toEqual([]);
        }
        // The grid animates a row's y and opacity only (never x, a size or an offset). Not read with
        // gsap.getProperty: that writes `translate: none` inline on every row it reads.
        for (const [, from, to] of rowCalls) expect([...Object.keys(from as unknown as object), ...Object.keys(to as unknown as object)].filter((p) => !['y', 'opacity', 'duration', 'delay', 'ease', 'force3D', 'overwrite', 'immediateRender', 'onComplete', 'parent', 'startAt'].includes(p)), where).toEqual([]);
        if (running()) animated++;
        if (rand() < 0.25) finish();
      }
      expect(animated).toBeGreaterThan(5);
      expect(reducedSteps).toBeGreaterThan(0);
      // Destroy mid-glide on odd seeds; finish otherwise.
      if (seed % 2) {
        if (media.reduce) flipMedia(false);
        clock.now += 1000;
        a.g.kernel.dispatch({ type: 'quick.set', text: '' }, 'user');
        a.g.kernel.dispatch({ type: 'sort.set', sort: [] }, 'user');
        a.g.kernel.dispatch({ type: 'rows.expandAll', expanded: false }, 'user');
        a.frame();
        a.scroll(0);
        a.frame();
        clock.now += 1000;
        a.g.kernel.dispatch({ type: 'rows.expand', rows: [k('S0')], expanded: true }, 'user');
        a.frame();
        expect(running()).toBeGreaterThan(0);
        const els = a.rowEls();
        a.g.destroy();
        for (const el of els) expect(gsap.getTweensOf(el).filter((t) => t.progress() < 1).length).toBe(0);
        expect(leftovers(a.host)).toEqual([]);
        for (const el of els) expect(el.style.getPropertyValue('transform') + el.style.getPropertyValue('opacity')).toBe('');
      } else {
        finish();
        expect(leftovers(a.host)).toEqual([]);
        expect(a.layout()).toEqual(b.layout());
      }
      expect(leftovers(b.host)).toEqual([]);
    });
  }
});
