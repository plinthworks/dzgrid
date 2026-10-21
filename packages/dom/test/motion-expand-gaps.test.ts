// Gaps in the tree motion tests (Phase 4 step 6): the skip conditions one at a time, the caps at
// their edges, a toggle and a sort in one paint, the typing rule kept to sorts and filters, reduced
// motion switched on and the grid destroyed mid-glide; and the bugs found (fixed in the step 6 review).
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { gsap } from 'gsap';
import { motion, type MotionOptions, type RowMotion } from '../src/motion-gsap.js';
import type { GridSettings } from '../src/settings.js';
import { changeMedia, clock, leftovers, media, mount, stubMedia, type R } from './support-motion.js';
import { cleanup, idOf, k, tmake, wide, type T } from './support-tree.js';

beforeEach(() => {
  media.reduce = false;
  clock.now = 1000;
  stubMedia();
});
afterEach(() => {
  cleanup();
  gsap.globalTimeline.clear();
});

const running = (): number => gsap.globalTimeline.getChildren(true, true, false).filter((t) => t.progress() < 1).length;
const finish = (): void => {
  for (let i = 0; i < 5; i++) for (const t of gsap.globalTimeline.getChildren(true, true, false)) if (t.progress() < 1) t.progress(1);
};
const opacityTween = (el: Element | null): boolean => !!el && gsap.getTweensOf(el).some((t) => t.vars['opacity'] === 1 && t.progress() < 1);

async function tgrid(o: { motion?: MotionOptions; rows?: T[]; block?: number; settings?: Partial<GridSettings<T>>; open?: string[] } = {}) {
  const queue: FrameRequestCallback[] = [];
  const raf = { requestAnimationFrame: (cb: FrameRequestCallback) => queue.push(cb), cancelAnimationFrame: () => {} };
  const m = motion({ gsap, ...o.motion });
  const t = tmake({ rows: o.rows ?? wide(10, 5), features: [m], raf, block: o.block ?? 320, settings: o.settings ?? {} });
  const frame = (): void => {
    for (let i = 0; i < 5 && queue.length; i++) for (const cb of queue.splice(0)) cb(clock.now);
  };
  frame();
  if (o.open) t.expand(o.open), frame();
  await m.load();
  clock.now += 1000;
  const toggle = (ids: string[], open: boolean): void => {
    t.expand(ids, open, 'user');
    frame();
  };
  const rowEls = () => [...t.host.querySelectorAll<HTMLElement>('.dzg-layer > .dzg-row')];
  /** Each mounted row's key and layout offset. */
  const tops = () => new Map(rowEls().map((r) => [idOf(t.ctx.rowRenderer.keyOf(r)), r.style.getPropertyValue('inset-block-start')]));
  return { ...t, m, frame, toggle, rowEls, tops };
}

/** The grid's own tweens on rows started by `run`, per row element: y glides and fades. */
function playsDuring(run: () => void): { glides: Map<Element, number>; fades: Map<Element, number> } {
  const spy = vi.spyOn(gsap, 'fromTo');
  run();
  const glides = new Map<Element, number>();
  const fades = new Map<Element, number>();
  for (const [el, from] of spy.mock.calls) {
    if (!(el as HTMLElement).classList?.contains('dzg-row')) continue;
    if ('y' in (from as unknown as object)) glides.set(el as Element, (glides.get(el as Element) ?? 0) + 1);
    if ((from as { opacity?: number }).opacity === 0) fades.set(el as Element, (fades.get(el as Element) ?? 0) + 1);
  }
  spy.mockRestore();
  return { glides, fades };
}

describe('the skip conditions, one at a time', () => {
  it('a scroll event between the change and the paint skips the glide even when the layer did not move', async () => {
    const t = await tgrid({ rows: wide(40, 5) });
    const layer = t.host.querySelector<HTMLElement>('.dzg-layer')!;
    const before = layer.style.getPropertyValue('inset-block-start');
    t.expand(['S1'], true, 'user');
    clock.now += 5;
    // One pixel: the same rows, the same layer offset; only the scroll's time says it moved.
    t.scroll(1);
    t.frame();
    expect(layer.style.getPropertyValue('inset-block-start')).toBe(before);
    expect(running()).toBe(0);
  });

  it('the layer moved by the grid (scroll clamped at a close, no scroll event) skips the glide', async () => {
    const t = await tgrid({ rows: wide(12, 5), open: ['S10', 'S11'] });
    t.scroll(10_000);
    t.frame();
    const layer = t.host.querySelector<HTMLElement>('.dzg-layer')!;
    const before = layer.style.getPropertyValue('inset-block-start');
    const scrolledAt = t.ctx.scrolledAt;
    const s11 = t.row('S11')!;
    const top0 = t.box.scrollTop;
    clock.now += 1000;
    // S11 and its rows move up 160 px in the content, and the scroll is pulled back 160 px: on the
    // screen they stand still. A glide by the content's distance would be wrong.
    t.toggle(['S10'], false);
    expect(t.ctx.scrolledAt).toBe(scrolledAt);
    expect(t.box.scrollTop).toBeLessThan(top0);
    expect(layer.style.getPropertyValue('inset-block-start')).not.toBe(before);
    expect(t.row('S11')).toBe(s11);
    expect(running()).toBe(0);
  });

  it('a sort 100 ms after a toggle still glides (the typing rule is for sorts and filters, not toggles)', async () => {
    const t = await tgrid();
    t.toggle(['S1'], true);
    finish();
    clock.now += 100;
    t.g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'n', dir: 'desc' }] }, 'user');
    t.frame();
    expect(running()).toBeGreaterThan(0);
  });
});

describe('a toggle mid-glide', () => {
  it('closing halfway through an opening glide: the row goes on from where it is drawn (no jump)', async () => {
    const t = await tgrid();
    const s2 = t.row('S2')!;
    t.toggle(['S1'], true);
    gsap.getTweensOf(s2)[0]!.progress(0.5);
    const drawn = (): number => parseFloat(s2.style.getPropertyValue('inset-block-start')) + Number(gsap.getProperty(s2, 'y'));
    const was = drawn();
    expect(was).toBeGreaterThan(64);
    expect(was).toBeLessThan(224);
    clock.now += 40;
    t.toggle(['S1'], false);
    expect(t.row('S2')).toBe(s2);
    expect(s2.style.getPropertyValue('inset-block-start')).toBe('64px');
    expect(drawn()).toBeCloseTo(was, 5);
    finish();
    expect(drawn()).toBe(64);
  });
});

describe('a toggle and another change in the same paint', () => {
  it('a toggle and a sort in one paint: one glide per row at most, no fade twice; DOM final at once', async () => {
    const t = await tgrid();
    const { glides, fades } = playsDuring(() => {
      t.expand(['S1'], true, 'user');
      t.g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'n', dir: 'desc' }] }, 'user');
      t.frame();
    });
    expect(glides.size).toBeGreaterThan(0);
    for (const n of glides.values()) expect(n).toBe(1);
    for (const n of fades.values()) expect(n).toBe(1);
    finish();
    expect(leftovers(t.host)).toEqual([]);
  });

  it('a toggle and an added child in one paint: the new child fades once (not by the glide and the flash both)', async () => {
    const t = await tgrid();
    const { fades } = playsDuring(() => {
      t.expand(['S1'], true, 'user');
      t.g.kernel.rows.applyTransaction({ add: [{ id: 'X', parent: 'S1', name: 'Extra', n: 9 }] });
      t.frame();
    });
    for (const n of fades.values()) expect(n).toBe(1);
    finish();
    expect(leftovers(t.host)).toEqual([]);
  });
});

describe('the caps at their edges', () => {
  it('exactly 20 children coming into view fade; 21 do not', async () => {
    for (const [per, fades] of [[20, 20], [21, 0]] as const) {
      const t = await tgrid({ rows: wide(3, per), block: 1600 });
      const plays = playsDuring(() => t.toggle(['S0'], true));
      expect(plays.fades.size, `${per} children`).toBe(fades);
      finish();
      cleanup();
      stubMedia();
    }
  });

  it('opening: glides when 60 rows move or fewer, none when 61 or more (whatever the view)', async () => {
    const seen = new Set<number>();
    for (let block = 1600; block <= 2400; block += 32) {
      const t = await tgrid({ rows: wide(120, 1), block, settings: { overscan: { rows: 0 } } });
      const before = t.tops();
      const plays = playsDuring(() => t.toggle(['S0'], true));
      const after = t.tops();
      const moved = [...after].filter(([id, top]) => before.has(id) && before.get(id) !== top).length;
      seen.add(moved);
      expect(plays.glides.size > 0, `${moved} rows moved (view ${block})`).toBe(moved <= 60);
      finish();
      cleanup();
      stubMedia();
    }
    expect(seen.has(60) || seen.has(59)).toBe(true);
    expect([...seen].some((n) => n > 60)).toBe(true);
  });

  it('closing: the rows rising in at the bottom count toward the 60 (moved + risen > 60: nothing glides)', async () => {
    // 50 rows below S0 move up; about 20 come in at the bottom and rise with them: over 60 in all.
    const t = await tgrid({ rows: [...wide(1, 20), ...wide(80, 0).map((r) => ({ ...r, id: `R${r.id}` }))], block: 2400, settings: { overscan: { rows: 0 } }, open: ["S0"] });
    const before = t.tops();
    const plays = playsDuring(() => t.toggle(['S0'], false));
    const after = t.tops();
    const moved = [...after].filter(([id, top]) => before.has(id) && before.get(id) !== top).length;
    const rose = [...after.keys()].filter((id) => !before.has(id)).length;
    expect(moved).toBeLessThanOrEqual(60);
    expect(moved + rose).toBeGreaterThan(60);
    expect(plays.glides.size).toBe(0);
  });
});

describe('the setting changes and the grid goes mid-glide', () => {
  it('reduced motion switched on mid-glide: every row finished and cleared at once; the next toggles call no hook, start no tween', async () => {
    const calls: string[] = [];
    const t = await tgrid({ motion: { onRow: (_e, c, why) => void calls.push(`${idOf(c.key)}:${why}`) } });
    t.toggle(['S1'], true);
    expect(running()).toBeGreaterThan(0);
    // GSAP ignores a media change within 2 ms of the last one.
    const t0 = Date.now();
    while (Date.now() - t0 < 4);
    changeMedia(true);
    expect(running()).toBe(0);
    expect(leftovers(t.host)).toEqual([]);
    for (const el of t.rowEls()) expect(el.style.getPropertyValue('transform')).toBe('');
    calls.length = 0;
    clock.now += 1000;
    t.toggle(['S1'], false);
    clock.now += 1000;
    t.g.kernel.dispatch({ type: 'rows.expandAll', expanded: true }, 'user');
    t.frame();
    expect(running()).toBe(0);
    expect(calls).toEqual([]);
  });

  it('destroyed mid-glide: no tween left running on any row element, no motion prop inline, layout props intact', async () => {
    const t = await tgrid({ open: ['S0'] });
    t.toggle(['S1'], true);
    const els = t.rowEls();
    const layout = els.map((el) => `${el.style.getPropertyValue('inset-block-start')}/${el.style.getPropertyValue('block-size')}`);
    expect(running()).toBeGreaterThan(0);
    t.g.destroy();
    for (const el of els) expect(gsap.getTweensOf(el).filter((x) => x.progress() < 1).length).toBe(0);
    for (const el of els) expect(`${el.style.getPropertyValue('transform')}${el.style.getPropertyValue('opacity')}`).toBe('');
    expect(els.map((el) => `${el.style.getPropertyValue('inset-block-start')}/${el.style.getPropertyValue('block-size')}`)).toEqual(layout);
  });
});

describe('an opening read as a close (see « bugs found »)', () => {
  it('the opened children never glide from the distance the rows below moved (they are new, not moved)', async () => {
    const leaves = Array.from({ length: 6 }, (_, i): T => ({ id: `L${i}`, parent: null, name: `Leaf ${i}`, n: 50 + i }));
    const t = await tgrid({ rows: [...wide(4, 5), ...leaves] });
    t.expand(['S1'], true, 'user');
    t.g.kernel.rows.applyTransaction({ remove: leaves.map((l) => l.id) });
    t.frame();
    for (let j = 0; j < 5; j++) expect(gsap.getTweensOf(t.row(`S1-${j}`)!).some((x) => 'y' in x.vars), `S1-${j}`).toBe(false);
    finish();
    expect(leftovers(t.host)).toEqual([]);
  });
});

describe('the review of step 6', () => {
  it('a close mid-glide (a held arrow key): the rows rising in at the bottom start the hidden block below (not the in-flight distance)', async () => {
    const t = await tgrid();
    t.toggle(['S1'], true);
    for (const x of gsap.globalTimeline.getChildren(true, true, false)) x.progress(0.5);
    const before = new Set(t.tops().keys());
    clock.now += 60;
    const spy = vi.spyOn(gsap, 'fromTo');
    t.toggle(['S1'], false);
    const risen = spy.mock.calls.filter(([el, from]) => 'y' in (from as unknown as object) && !before.has(idOf(t.ctx.rowRenderer.keyOf(el as HTMLElement))));
    spy.mockRestore();
    expect(risen.length).toBeGreaterThan(0);
    // Five children of 32 px hidden.
    for (const [, from] of risen) expect((from as unknown as { y: number }).y).toBe(160);
  });

  it('an opening and a closing in one paint: a plain glide, nothing fades', async () => {
    const t = await tgrid({ open: ['S0'] });
    const { glides, fades } = playsDuring(() => {
      t.expand(['S0'], false, 'user');
      t.expand(['S2'], true, 'user');
      t.frame();
    });
    expect(glides.size).toBeGreaterThan(0);
    expect(fades.size).toBe(0);
    finish();
    expect(leftovers(t.host)).toEqual([]);
  });

  it('a toggle and a sort in one paint: the sort governs (its `flip` off: nothing glides, even with `expand` on)', async () => {
    const t = await tgrid({ motion: { effects: { flip: false } } });
    const { glides } = playsDuring(() => {
      t.expand(['S1'], true, 'user');
      t.g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'n', dir: 'desc' }] }, 'user');
      t.frame();
    });
    expect(glides.size).toBe(0);
  });

  it('a flat grid: rows that glided at a sort and stand still at a filter keep no motion prop', async () => {
    const rows: R[] = Array.from({ length: 40 }, (_, i) => ({ id: `r${i}`, n: i === 0 ? 1 : i === 1 ? 0 : i, s: i < 3 ? 'keep' : `x${i}` }));
    const m = motion({ gsap });
    const g = mount({ features: [m] }, { rows });
    await m.load();
    clock.now += 1000;
    g.g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'n', dir: 'asc' }] }, 'user');
    g.frame();
    expect(running()).toBeGreaterThan(0);
    finish();
    clock.now += 1000;
    g.g.kernel.dispatch({ type: 'quick.set', text: 'keep' }, 'user');
    g.frame();
    finish();
    expect(leftovers(g.host)).toEqual([]);
    g.g.destroy();
    g.host.remove();
  });

  it("`onRow`'s index is found when the hook reads it (not before: a million-row tree builds its index then)", async () => {
    const told: RowMotion[] = [];
    const t = await tgrid({ motion: { onRow: (_e, c) => void told.push(c) } });
    t.toggle(['S1'], true);
    const c = told.find((x) => x.key === k('S2'))!;
    expect(typeof Object.getOwnPropertyDescriptor(c, 'index')?.get).toBe('function');
    expect(c.index).toBe(t.g.kernel.rows.displayed.indexOf(k('S2')));
  });
});

describe('bugs found (fixed in the step 6 review)', () => {
  // The snapshot reads `gsap.getProperty(el, 'y')` of every row the guard still follows (an element
  // animated before, released but followed until it shows another row). GSAP's read writes
  // `translate: none; rotate: none; scale: none` inline. A row that then does not move gets no tween,
  // so nothing clears it: it stays, overriding any `translate`/`rotate`/`scale` a stylesheet gives
  // rows. A toggle hits this every time: the rows above the parent never move. (The flat sort/filter
  // path has it too since step 26; a filter keeping the top rows in place shows it.)
  it('no motion prop is left on rows that glided at one toggle and stood still at the next', async () => {
    const t = await tgrid({ rows: wide(10, 2) });
    t.toggle(['S1'], true);
    finish();
    expect(leftovers(t.host)).toEqual([]);
    clock.now += 1000;
    t.toggle(['S5'], true);
    finish();
    // S2–S4 glided at the first toggle and stand still at the second.
    expect(leftovers(t.host)).toEqual([]);
  });

  // The close is told by the shown count going down. A toggle opening a parent and a transaction
  // removing more rows in the same paint reads as a close: the opened children neither fade (the
  // close drops the fades) nor glide (rows below moved down, `rise` is not > 0): they pop in.
  it('an opening fades its children even when a transaction removes more rows in the same paint', async () => {
    const leaves = Array.from({ length: 6 }, (_, i): T => ({ id: `L${i}`, parent: null, name: `Leaf ${i}`, n: 50 + i }));
    const t = await tgrid({ rows: [...wide(4, 5), ...leaves] });
    const before = t.g.kernel.rows.displayed.count;
    t.expand(['S1'], true, 'user');
    // Six leaves at the bottom go, five children open: one row fewer in all.
    t.g.kernel.rows.applyTransaction({ remove: leaves.map((l) => l.id) });
    t.frame();
    expect(t.g.kernel.rows.displayed.count).toBe(before - 1);
    // The rows below still glide down.
    expect(gsap.getTweensOf(t.row('S2')!).length).toBe(1);
    expect(t.g.kernel.expansion.has(k('S1'))).toBe(true);
    expect(opacityTween(t.row('S1-0'))).toBe(true);
  });
});
