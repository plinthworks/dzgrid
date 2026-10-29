// Step 14 (1.1.0, the owner's « arbre » screen; docs/behaviors/motion.md « Its duration »): `effects.flash:
// { hold, fade }` in ms — the live flash and the saved flash held then faded; reduced motion: a still mark for
// hold + fade; bad values: that field's default and one invalid-setting warning per grid and field. Real GSAP in
// jsdom, matchMedia stubbed, frames by hand; GSAP's time moved by hand on its global timeline.
import { describe, it, expect, afterEach, afterAll, beforeEach, vi } from 'vitest';
import { gsap } from 'gsap';
import { dataKey, type ColumnDef, type GridEvent, type Problem } from '@dzgrid/core';
import type { SaveRequest } from '@dzgrid/core/edit';
import { motion, type MotionOptions } from '../src/motion-gsap.js';
import { edit, type EditApi } from '../src/edit.js';
import { EN } from '../src/locales/en.js';
import { EN_EDIT } from '../src/locales/en-edit.js';
import { EN_PAGINATION } from '../src/locales/en-pagination.js';
import { clock, leftovers, media, mount, stubMedia, type Made, type R } from './support-motion.js';

let made: Made[] = [];
beforeEach(() => {
  media.reduce = false;
  clock.now = 1000;
  stubMedia();
  gsap.ticker.lagSmoothing(1, 0);
});
afterEach(() => {
  for (const m of made) m.g.destroy();
  made = [];
  document.body.innerHTML = '';
  gsap.globalTimeline.clear();
  gsap.ticker.lagSmoothing(500, 33);
  vi.restoreAllMocks();
});
afterAll(() => gsap.ticker.lagSmoothing(500, 33));

const later = (ms = 1000) => void (clock.now += ms);
/** GSAP's time, moved by hand: `ms` after the mark started (the test runs synchronously from there). */
let t0 = 0;
const start = (): void => void (t0 = gsap.globalTimeline.time());
const at = (ms: number): void => void gsap.globalTimeline.time(t0 + ms / 1000);
const mark = (el: HTMLElement): [boolean, string] => [el.classList.contains('dzg-flash'), el.style.getPropertyValue('--dzg-flash')];
const level = (el: HTMLElement): number => Number(el.style.getPropertyValue('--dzg-flash'));

async function grid(o: MotionOptions['effects'] | undefined, settings: Parameters<typeof mount>[0] = {}) {
  const events: GridEvent<R>[] = [];
  const m = motion({ gsap, ...(o ? { effects: o } : {}) });
  const g = mount({ features: [m], onEvent: (e) => events.push(e), ...settings });
  made.push(g);
  await m.load();
  later();
  const warned = (): Problem[] => events.flatMap((e) => (e.type === 'problems' ? e.problems : [])).filter((p) => p.path.startsWith('motion.'));
  return { ...g, m, warned };
}
const update = (g: Made, n: number) => {
  g.g.kernel.rows.applyTransaction({ update: [{ id: 'r2', n, s: 's2' }] });
  g.frame();
};

describe('effects.flash { hold, fade }', () => {
  it('default: one 0.6 s fade, no delay (today)', async () => {
    const g = await grid(undefined);
    update(g, 77);
    const ts = gsap.getTweensOf(g.cell('r2', 'n')!);
    expect(ts.map((t) => [t.duration(), t.delay()])).toEqual([[0.6, 0]]);
    expect(g.warned()).toEqual([]);
  });

  it('{ hold: 3000, fade: 1000 }: full for 3 s, fading in the 4th, gone at 4 s', async () => {
    const g = await grid({ flash: { hold: 3000, fade: 1000 } });
    update(g, 77);
    start();
    const c = g.cell('r2', 'n')!;
    expect(mark(c)).toEqual([true, '1']);
    at(2900);
    expect(mark(c)).toEqual([true, '1']);
    at(3500);
    expect(level(c)).toBeGreaterThan(0);
    expect(level(c)).toBeLessThan(1);
    at(4050);
    expect(mark(c)).toEqual([false, '']);
    expect(leftovers(g.host)).toEqual([]);
  });

  it('reduced motion: no tween, a still mark for hold + fade (4 s)', async () => {
    media.reduce = true;
    const g = await grid({ flash: { hold: 3000, fade: 1000 } });
    update(g, 77);
    start();
    const c = g.cell('r2', 'n')!;
    expect(gsap.getTweensOf(c)).toHaveLength(0);
    expect(mark(c)).toEqual([true, '1']);
    at(3900);
    expect(mark(c)).toEqual([true, '1']);
    at(4050);
    expect(mark(c)).toEqual([false, '']);
  });

  it('changed again: within 500 ms not marked again; after, back at full, gone 4 s after that change only', async () => {
    const g = await grid({ flash: { hold: 3000, fade: 1000 } });
    update(g, 77);
    start();
    const c = g.cell('r2', 'n')!;
    later(200);
    update(g, 78);
    expect(gsap.getTweensOf(c)).toHaveLength(1);
    at(1000);
    later(800);
    update(g, 79);
    // One tween on the cell, never two (the waiting one replaced).
    expect(gsap.getTweensOf(c).filter((t) => t.progress() < 1)).toHaveLength(1);
    expect(mark(c)).toEqual([true, '1']);
    // Timed from the second change (1 s after the first): its own full hold, then its fade.
    at(1000 + 2900);
    expect(mark(c)).toEqual([true, '1']);
    at(1000 + 3500);
    expect(level(c)).toBeGreaterThan(0);
    expect(level(c)).toBeLessThan(1);
    at(1000 + 4050);
    expect(mark(c)).toEqual([false, '']);
  });

  it('bad values: that field takes its default, one invalid-setting each, once per grid, no throw', async () => {
    const cases: [unknown, Problem[]][] = [
      [{ hold: -1 }, [{ code: 'invalid-setting', severity: 'warning', path: 'motion.effects.flash.hold', detail: '-1' }]],
      [{ hold: Number.NaN }, [{ code: 'invalid-setting', severity: 'warning', path: 'motion.effects.flash.hold', detail: 'NaN' }]],
      [{ fade: 20000 }, [{ code: 'invalid-setting', severity: 'warning', path: 'motion.effects.flash.fade', detail: '20000' }]],
      [{ hold: '3000', fade: 2000 }, [{ code: 'invalid-setting', severity: 'warning', path: 'motion.effects.flash.hold', detail: '3000' }]],
    ];
    for (const [o, want] of cases) {
      const g = await grid({ flash: o as never });
      for (let i = 0; i < 3; i++) later(), update(g, 70 + i);
      expect(g.warned()).toEqual(want);
    }
    // The good field kept: { hold: '3000', fade: 2000 } → hold 0, fade 2 s.
    const last = made.at(-1)!;
    expect(gsap.getTweensOf(last.cell('r2', 'n')!).filter((t) => t.progress() < 1).map((t) => [t.duration(), t.delay()])).toEqual([[2, 0]]);
    // The bad hold of { hold: -1 }: 0, the default fade 0.6 s.
    expect(gsap.getTweensOf(made[0]!.cell('r2', 'n')!).filter((t) => t.progress() < 1).map((t) => [t.duration(), t.delay()])).toEqual([[0.6, 0]]);
  });

  it('{ hold: 0, fade: 0 }: marked and cleared at once, no error', async () => {
    const g = await grid({ flash: { hold: 0, fade: 0 } });
    update(g, 77);
    start();
    at(10);
    expect(mark(g.cell('r2', 'n')!)).toEqual([false, '']);
    expect(g.warned()).toEqual([]);
  });

  it('a pooled cell scrolled away during the hold: its mark cleared at once, no tween left', async () => {
    const g = await grid({ flash: { hold: 3000, fade: 1000 } });
    update(g, 77);
    start();
    const c = g.cell('r2', 'n')!;
    at(1000);
    later(1000);
    g.scroll(32 * 40);
    expect(mark(c)).toEqual([false, '']);
    expect(gsap.getTweensOf(c).filter((t) => t.progress() < 1)).toHaveLength(0);
  });

  it('flash: false still wins; true is the default', async () => {
    const off = await grid({ flash: false });
    update(off, 77);
    expect(off.root.querySelectorAll('.dzg-flash').length).toBe(0);
    const on = await grid({ flash: true });
    update(on, 77);
    expect(gsap.getTweensOf(on.cell('r2', 'n')!).map((t) => [t.duration(), t.delay()])).toEqual([[0.6, 0]]);
  });
});

describe('the saved flash takes the same durations (owner Q14-6)', () => {
  it('a save that succeeds: full 3 s, gone at 4 s', async () => {
    const held: (() => void)[] = [];
    const save = (_r: SaveRequest<R>) => new Promise<void>((ok) => void held.push(() => ok()));
    const m = motion({ gsap, effects: { flash: { hold: 3000, fade: 1000 } } });
    const e = edit<R>({ save });
    const COLS: ColumnDef<R, any>[] = [{ id: 'id' }, { id: 'n', type: 'number', editable: true }, { id: 's', editable: true }];
    const g = mount({ features: [e, m], columns: COLS, messages: { ...EN, text: { ...EN.text, ...EN_EDIT.text, ...EN_PAGINATION.text } } });
    made.push(g);
    await m.load();
    later();
    g.frame();
    const api = e.api(g.g as never)! as EditApi<R>;
    api.commit([{ key: dataKey('r1')!, column: 'n', input: { text: '42' } }]);
    g.frame();
    held[0]!();
    for (let i = 0; i < 8; i++) await Promise.resolve();
    g.frame();
    start();
    const c = g.cell('r1', 'n')!;
    expect(mark(c)).toEqual([true, '1']);
    at(2900);
    expect(mark(c)).toEqual([true, '1']);
    at(4050);
    expect(mark(c)).toEqual([false, '']);
  });
});

describe('the mark is drawn at once, even before GSAP has drawn its first frame', () => {
  // GSAP defers a tween's first render to its next tick when it has not ticked yet (its « lazy » rendering): a
  // flash right after GSAP loads (a busy page; the zone test under load) left `dzg-flash` with no `--dzg-flash`
  // until then. A fresh GSAP whose frames never come, so its frame stays 0.
  it('a flash right after GSAP loads: at 1 in the same paint', async () => {
    const raf = window.requestAnimationFrame;
    window.requestAnimationFrame = (() => 0) as never;
    vi.resetModules();
    const fresh = (await import('gsap')).gsap;
    window.requestAnimationFrame = raf;
    expect(fresh.ticker.frame).toBe(0);
    const m = motion({ gsap: fresh });
    const g = mount({ features: [m] });
    made.push(g);
    await m.load();
    later();
    update(g, 77);
    expect(mark(g.cell('r2', 'n')!)).toEqual([true, '1']);
    fresh.globalTimeline.clear();
  });
});
