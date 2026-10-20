// A random walk (step 26): sorts, filters, live updates, scrolls, pages and focus moves on a grid with
// real GSAP motion and on its `motion: false` twin. After every step both show the same rows in the
// same DOM order with the same aria-rowindex and focus, and the motion moved no focus; once the
// tweens end, no motion prop is left anywhere.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { gsap } from 'gsap';
import { dataKey } from '@dzgrid/core';
import { motion } from '../src/motion-gsap.js';
import { clock, leftovers, media, mount, rowsOf, stubMedia, type Made } from './support-motion.js';

beforeEach(() => {
  media.reduce = false;
  clock.now = 1000;
  stubMedia();
});
afterEach(() => {
  document.body.innerHTML = '';
  gsap.globalTimeline.clear();
  vi.restoreAllMocks();
});

const rng = (seed: number) => () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const shape = (m: Made) => [...m.host.querySelectorAll<HTMLElement>('.dzg-row')].map((r) => `${r.getAttribute('aria-rowindex')}:${[...r.querySelectorAll('.dzg-cell')].map((c) => c.textContent).join('|')}`);
const finish = (): void => {
  for (let i = 0; i < 5; i++) for (const t of gsap.globalTimeline.getChildren(true, true, false)) if (t.progress() < 1) t.progress(1);
};

describe('motion walk against a motion:false twin', () => {
  for (const seed of [1, 7, 42, 99]) {
    it(`seed ${seed}: same rows, order, aria-rowindex and focus; nothing left once the tweens end`, async () => {
      const rand = rng(seed);
      const m = motion({ gsap, onRow: (el, c) => { if (c.index % 7 === 0) gsap.to(el, { scale: 1.01, duration: 0.2 }); } });
      const settings = seed % 2 ? { pagination: { pageSize: 15 } } : {};
      const rows = rowsOf(120);
      const a = mount({ features: [m], ...settings }, { rows });
      const b = mount({ motion: false, ...settings }, { rows });
      await m.load();
      let n = 1000;
      let animated = 0;
      for (let step = 0; step < 80; step++) {
        clock.now += rand() < 0.2 ? 40 : 400;
        const op = Math.floor(rand() * 7);
        const p = [rand(), rand(), rand()];
        for (const g of [a, b]) {
          const k = g.g.kernel;
          if (op === 0) k.dispatch({ type: 'sort.set', sort: [{ column: p[0]! < 0.5 ? 'n' : 's', dir: p[1]! < 0.5 ? 'asc' : 'desc' }] }, 'user');
          else if (op === 1) k.dispatch({ type: 'quick.set', text: p[0]! < 0.4 ? '' : String(Math.floor(p[1]! * 9)) }, 'user');
          else if (op === 2) k.rows.applyTransaction({ update: rows.slice(Math.floor(p[0]! * 10), 1 + Math.floor(p[0]! * 10) + Math.floor(p[1]! * 4)).map((r) => ({ ...r, n: n + Number(r.id.slice(1)) })) });
          else if (op === 3) g.scroll(Math.floor(p[0]! * 30) * 32);
          else if (op === 4 && 'pagination' in settings) k.dispatch({ type: 'page.go', index: Math.floor(p[0]! * 5) }, 'user');
          else if (op === 5) k.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: dataKey(`r${Math.floor(p[0]! * 20)}`)!, column: 'n' } }, 'user');
          else if (op === 6) k.rows.applyTransaction({ add: [{ id: `x${step}`, n: Math.floor(p[0]! * 100), s: `x${step}` }] });
          g.frame();
        }
        if (op === 2) n += 1000;
        if (gsap.globalTimeline.getChildren(true, true, false).some((t) => t.progress() < 1)) animated++;
        expect(shape(a)).toEqual(shape(b));
        expect(a.g.kernel.focus).toEqual(b.g.kernel.focus);
        if (rand() < 0.3) finish();
      }
      finish();
      // The walk did animate (glides, flashes, slides), and nothing stayed.
      expect(animated).toBeGreaterThan(5);
      expect(leftovers(a.host)).toEqual([]);
      // And the twin never had any.
      expect(leftovers(b.host)).toEqual([]);
      a.g.destroy();
      b.g.destroy();
    });
  }

  it('the focused cell keeps the document focus across a sort glide (activeElement unchanged)', async () => {
    const m = motion({ gsap });
    const a = mount({ features: [m] });
    await m.load();
    clock.now += 1000;
    a.g.api.focusCell(dataKey('r1')!, 'n');
    a.frame();
    const focused = document.activeElement;
    expect(focused?.getAttribute('data-col')).toBe('n');
    a.g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'n', dir: 'asc' }] }, 'user');
    a.frame();
    expect(document.activeElement).toBe(focused);
    finish();
    expect(document.activeElement).toBe(focused);
    a.g.destroy();
  });
});
