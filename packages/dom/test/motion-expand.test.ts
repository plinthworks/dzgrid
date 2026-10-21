// Motion for a tree's rows opening and closing (Phase 4 step 6, plan D12, docs/behaviors/motion.md
// « Trees and details », docs/phase-4-steps/step06-plan.md): real GSAP in jsdom, matchMedia stubbed,
// frames run by hand. Rows below a parent glide (y only) from the offsets the grid wrote; the children
// that appear fade (at most 20); closing, the rows below glide up and the hidden rows get nothing.
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { gsap } from 'gsap';
import { motion, type MotionOptions } from '../src/motion-gsap.js';
import type { GridSettings } from '../src/settings.js';
import { clock, leftovers, media, stubMedia } from './support-motion.js';
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

const y = (el: Element | null): number => Number(gsap.getProperty(el as Element, 'y'));
const opacityTween = (el: Element | null): boolean => !!el && gsap.getTweensOf(el).some((t) => t.vars['opacity'] === 1 && t.progress() < 1);
const tweens = (): number => gsap.globalTimeline.getChildren(true, true, false).filter((t) => t.progress() < 1).length;
const finish = (): void => {
  for (let i = 0; i < 5; i++) for (const t of gsap.globalTimeline.getChildren(true, true, false)) if (t.progress() < 1) t.progress(1);
};

interface Opts {
  readonly motion?: MotionOptions;
  readonly rows?: T[];
  readonly block?: number;
  readonly settings?: Partial<GridSettings<T>>;
  /** Opened before the motion loads (no glide). */
  readonly open?: string[];
}

/** A tree with motion on manual frames; the chunk loaded; `open` opened first, without motion. */
async function tgrid(o: Opts = {}) {
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
  /** Opens or closes rows (by the user) and paints. */
  const toggle = (ids: string[], open: boolean): void => {
    t.expand(ids, open, 'user');
    frame();
  };
  /** The rows mounted, in DOM order: id and aria-rowindex. */
  const dom = () => [...t.host.querySelectorAll<HTMLElement>('.dzg-layer > .dzg-row')].map((r) => `${idOf(t.ctx.rowRenderer.keyOf(r))}@${r.getAttribute('aria-rowindex')}:${r.getAttribute('aria-expanded')}`);
  return { ...t, m, frame, toggle, dom };
}

describe('opening a parent', () => {
  it('the rows below glide down from their old place (y only); the children fade in; the parent and the rows above do not move', async () => {
    const t = await tgrid();
    const s2 = t.row('S2')!;
    const before = s2.style.getPropertyValue('inset-block-start');
    t.toggle(['S1'], true);
    // S2 was row 2 (64 px), is now row 7 (224 px): it starts 160 px up, at its old place.
    expect(t.row('S2')).toBe(s2);
    expect(s2.style.getPropertyValue('inset-block-start')).not.toBe(before);
    expect(y(s2)).toBe(-160);
    expect(gsap.getProperty(s2, 'x')).toBe(0);
    expect(y(t.row('S3'))).toBe(-160);
    for (const id of ['S0', 'S1']) expect(gsap.getTweensOf(t.row(id)!).length, id).toBe(0);
    for (let j = 0; j < 5; j++) {
      const c = t.row(`S1-${j}`)!;
      expect(opacityTween(c), `S1-${j}`).toBe(true);
      expect(y(c)).toBe(0);
    }
    finish();
    expect(leftovers(t.host)).toEqual([]);
    expect(s2.style.getPropertyValue('inset-block-start')).toBe('224px');
  });

  it('fades no child when more than 20 come into view (the rows below still glide)', async () => {
    const t = await tgrid({ rows: wide(3, 30), block: 1600 });
    t.toggle(['S0'], true);
    for (let j = 0; j < 30; j++) expect(gsap.getTweensOf(t.row(`S0-${j}`)!).length).toBe(0);
    expect(y(t.row('S1'))).toBe(-960);
  });

  it('a later toggle glides too, even within 150 ms (no typing rule), from where the rows are', async () => {
    const t = await tgrid();
    t.toggle(['S1'], true);
    const s3 = t.row('S3')!;
    expect(y(s3)).toBe(-160);
    clock.now += 50;
    t.toggle(['S2'], true);
    // S3 was mid-glide (y −160, at row 3 on screen); now at row 13 of the layout: off the window or gliding.
    const s4 = t.row('S4');
    expect(s4 === null || gsap.getTweensOf(s4).length > 0).toBe(true);
    expect(tweens()).toBeGreaterThan(0);
  });
});

describe('closing a parent', () => {
  it('the rows below glide up; rows entering at the bottom glide up with them; the hidden rows get nothing; nothing fades', async () => {
    const t = await tgrid({ open: ['S1'] });
    const hidden = ['S1-0', 'S1-1', 'S1-2', 'S1-3', 'S1-4'].map((id) => t.row(id)!);
    expect(hidden.every(Boolean)).toBe(true);
    expect(t.row('S9')).toBeNull();
    t.toggle(['S1'], false);
    expect(y(t.row('S2'))).toBe(160);
    expect(y(t.row('S6'))).toBe(160);
    // S7–S9 were below the window: they rise with the others.
    for (const id of ['S7', 'S8', 'S9']) expect(y(t.row(id)), id).toBe(160);
    for (const id of ['S0', 'S1']) expect(gsap.getTweensOf(t.row(id)!).length, id).toBe(0);
    // No fade at a close; the elements that showed the hidden rows hold no tween of theirs.
    for (const el of t.host.querySelectorAll('.dzg-row')) expect(opacityTween(el)).toBe(false);
    for (const el of hidden) if (!el.isConnected || t.ctx.rowRenderer.keyOf(el) === null) expect(gsap.getTweensOf(el).length).toBe(0);
    finish();
    expect(leftovers(t.host)).toEqual([]);
  });

  it('a hidden block taller than the view: the rows coming in simply show', async () => {
    const t = await tgrid({ rows: wide(5, 20), open: ['S0'] });
    t.toggle(['S0'], false);
    expect(tweens()).toBe(0);
  });
});

describe('skips', () => {
  it('more than 60 rows gliding: nothing moves, nothing fades', async () => {
    const t = await tgrid({ rows: wide(80, 2), block: 3200 });
    expect(t.host.querySelectorAll('.dzg-row').length).toBeGreaterThan(60);
    t.toggle(['S0'], true);
    expect(tweens()).toBe(0);
  });

  it('a row moving more than a screen (g.viewBlock) does not glide; the children still fade', async () => {
    const t = await tgrid({ rows: wide(10, 15), settings: { overscan: { rows: 20 } } });
    t.toggle(['S0'], true);
    // S1: from 32 px to 512 px, more than the 320 px view, though mounted before and after.
    const s1 = t.row('S1')!;
    expect(s1).not.toBeNull();
    expect(gsap.getTweensOf(s1).length).toBe(0);
    expect(opacityTween(t.row('S0-0'))).toBe(true);
  });

  it('a scroll between the change and the paint', async () => {
    const t = await tgrid();
    t.expand(['S1'], true, 'user');
    clock.now += 5;
    t.scroll(32);
    t.frame();
    expect(tweens()).toBe(0);
  });

  it('reduced motion: no tween, no hook, no mark', async () => {
    media.reduce = true;
    const calls: string[] = [];
    const t = await tgrid({ motion: { onRow: (_e, c, why) => void calls.push(`${idOf(c.key)}:${why}`) } });
    t.toggle(['S1'], true);
    t.toggle(['S1'], false);
    expect(tweens()).toBe(0);
    expect(calls).toEqual([]);
    expect(leftovers(t.host)).toEqual([]);
  });

  it('settings.motion false: nothing', async () => {
    const t = await tgrid({ settings: { motion: false } });
    t.toggle(['S1'], true);
    expect(tweens()).toBe(0);
    expect(leftovers(t.host)).toEqual([]);
  });

  it('effects.expand false: nothing moves, the hooks are still called; a sort still glides', async () => {
    const calls: string[] = [];
    const t = await tgrid({ motion: { effects: { expand: false }, onRow: (_e, c, why) => void calls.push(`${idOf(c.key)}:${why}`) } });
    t.toggle(['S1'], true);
    expect(tweens()).toBe(0);
    expect(calls).toContain('S2:moved');
    expect(calls).toContain('S1-0:entered');
    clock.now += 1000;
    t.g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'n', dir: 'desc' }] }, 'user');
    t.frame();
    expect(tweens()).toBeGreaterThan(0);
  });
});

describe('the host hook', () => {
  it('onRow is told moved (rows below) and entered (children) at an opening, moved at a closing; false skips the built-in effect', async () => {
    const calls: string[] = [];
    const t = await tgrid({
      motion: {
        onRow: (_e, c, why) => {
          calls.push(`${idOf(c.key)}:${why}:${c.index}:${c.reduced}`);
          if (idOf(c.key) === 'S2' || idOf(c.key) === 'S1-0') return false;
        },
      },
    });
    t.toggle(['S1'], true);
    expect(calls).toContain('S2:moved:7:false');
    expect(calls).toContain('S1-0:entered:2:false');
    expect(calls.some((c) => c.startsWith('S0:') || c.startsWith('S1:'))).toBe(false);
    expect(gsap.getTweensOf(t.row('S2')!).length).toBe(0);
    expect(opacityTween(t.row('S1-0'))).toBe(false);
    expect(y(t.row('S3'))).toBe(-160);
    expect(opacityTween(t.row('S1-1'))).toBe(true);
    finish();
    calls.length = 0;
    clock.now += 1000;
    t.toggle(['S1'], false);
    expect(calls).toContain('S3:moved:3:false');
    expect(calls.every((c) => c.includes(':moved:'))).toBe(true);
  });
});

describe('what a screen reader and the keys see', () => {
  it('focus, aria-expanded, DOM order and aria-rowindex are final at once: equal to a motion:false twin mid-glide', async () => {
    const a = await tgrid();
    const b = await tgrid({ settings: { motion: false } });
    // One grid at a time holds the document's focus: each run alone, read mid-glide.
    const run = (t: typeof a, key: string) => {
      t.focus('S1');
      t.frame();
      t.press(key);
      t.frame();
      return { dom: t.dom(), where: t.where(), running: tweens(), open: t.row('S1')!.getAttribute('aria-expanded') };
    };
    const opened = run(a, 'ArrowRight');
    expect(opened.running).toBeGreaterThan(0);
    expect(opened).toMatchObject({ where: 'S1/name', open: 'true' });
    const twin = run(b, 'ArrowRight');
    expect(opened.dom).toEqual(twin.dom);
    expect(twin.where).toBe('S1/name');
    clock.now += 1000;
    const closed = run(a, 'ArrowLeft');
    expect(closed.running).toBeGreaterThan(0);
    expect(closed).toMatchObject({ where: 'S1/name', open: 'false' });
    expect(closed.dom).toEqual(run(b, 'ArrowLeft').dom);
    expect(a.g.kernel.expansion.has(k('S1'))).toBe(false);
  });

  it('pooled-row guard: a scroll mid-glide finishes and clears what the elements now showing other rows held', async () => {
    const t = await tgrid({ rows: wide(40, 5) });
    t.toggle(['S1'], true);
    const el = t.row('S2')!;
    expect(gsap.getTweensOf(el).length).toBe(1);
    clock.now += 16;
    t.scroll(32 * 120);
    t.frame();
    expect(t.ctx.rowRenderer.keyOf(el)).not.toBe(k('S2'));
    expect(el.style.getPropertyValue('transform')).toBe('');
    expect(el.style.getPropertyValue('block-size')).toBe('32px');
  });
});
