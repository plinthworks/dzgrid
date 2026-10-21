// Gaps in the step 26 motion tests, on GSAP's clock moved by the test (gsap.updateRoot), not on
// progress(1): what a real frame sequence does mid-tween. The last block: the step 26 corrections.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { gsap } from 'gsap';
import { motion, type MotionOptions } from '../src/motion-gsap.js';
import { popupsFor } from '../src/popup.js';
import type { GridContext } from '../src/context.js';
import { changeMedia, clock, leftovers, media, mount, rowsOf, stubMedia, type Made, type R } from './support-motion.js';

let T = 0;
const advance = (s: number): void => {
  T += s;
  gsap.updateRoot(T);
};
let made: Made[] = [];
beforeEach(() => {
  media.reduce = false;
  clock.now = 1000;
  stubMedia();
  gsap.ticker.remove(gsap.updateRoot);
  T = gsap.ticker.time + 1;
  gsap.updateRoot(T);
});
afterEach(() => {
  for (const m of made) m.g.destroy();
  made = [];
  document.body.innerHTML = '';
  gsap.globalTimeline.clear();
  gsap.ticker.add(gsap.updateRoot);
  vi.restoreAllMocks();
});
async function grid(o: MotionOptions = {}, mo: Parameters<typeof mount>[1] = {}, settings: Parameters<typeof mount>[0] = {}) {
  const m = motion({ gsap, ...o });
  const g = mount({ features: [m], ...settings }, mo);
  made.push(g);
  await m.load();
  clock.now += 1000;
  return g;
}
const update = (g: Made, rows: R[]) => {
  g.g.kernel.rows.applyTransaction({ update: rows });
  g.frame();
};
const sortN = (g: Made, dir: 'asc' | 'desc' = 'asc') => {
  g.g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'n', dir }] }, 'user');
  g.frame();
};
const live = (el: Element) => gsap.getTweensOf(el).filter((t) => t.progress() < 1);
const visualTop = (el: HTMLElement) => parseFloat(el.style.getPropertyValue('inset-block-start')) + (Number(gsap.getProperty(el, 'y')) || 0);

describe('mid-tween, on GSAP time', () => {
  it('a sort during a glide starts each row from where it is seen, not from its old offset', async () => {
    const g = await grid();
    sortN(g);
    advance(0.15);
    const el = g.row('r1')!;
    const seen = visualTop(el);
    expect(Number(gsap.getProperty(el, 'y'))).not.toBe(0);
    clock.now += 400;
    // Back to the first order: r1 moves back one row, its element kept.
    g.g.kernel.dispatch({ type: 'sort.set', sort: [] }, 'user');
    g.frame();
    expect(g.row('r1')).toBe(el);
    expect(visualTop(el)).toBeCloseTo(seen, 3);
    // The old glide is overwritten at the next tick: one tween left.
    advance(0.01);
    expect(live(el)).toHaveLength(1);
    advance(2);
    expect(leftovers(g.host)).toEqual([]);
  });

  it('a glide, a flash and a page slide all end on their own: no prop left, layout intact', async () => {
    const g = await grid({}, {}, { pagination: { pageSize: 15 } });
    sortN(g);
    clock.now += 400;
    update(g, [{ id: 'r2', n: 77, s: 's2' }]);
    clock.now += 400;
    g.g.kernel.dispatch({ type: 'page.go', index: 1 }, 'user');
    g.frame();
    expect(gsap.globalTimeline.getChildren(true, true, false).some((t) => t.progress() < 1)).toBe(true);
    advance(0.1);
    expect(g.layer.style.getPropertyValue('inset-block-start')).not.toBe('');
    advance(2);
    expect(leftovers(g.host)).toEqual([]);
    for (const r of g.host.querySelectorAll<HTMLElement>('.dzg-row')) expect(r.style.getPropertyValue('block-size')).toBe('32px');
  });

  it('reduced motion turned on mid-glide: finished at once, nothing moves after', async () => {
    const g = await grid();
    sortN(g);
    advance(0.05);
    changeMedia(true);
    expect(live(g.row('r1')!)).toHaveLength(0);
    expect(leftovers(g.host)).toEqual([]);
    clock.now += 400;
    sortN(g, 'desc');
    expect(gsap.globalTimeline.getChildren(true, true, false).filter((t) => t.progress() < 1)).toHaveLength(0);
  });

  it('a popup closed mid-fade: its content is finished and cleared', async () => {
    const g = await grid();
    const ctx = (g.g as unknown as { context: GridContext<unknown> }).context;
    const content = document.createElement('div');
    content.innerHTML = '<button type="button">ok</button>';
    const p = popupsFor(ctx).open(g.host.querySelector<HTMLElement>('.dzg-hcell')!, content, { placement: 'block-end', modal: true });
    await new Promise((r) => setTimeout(r, 0));
    advance(0.05);
    expect(live(content)).toHaveLength(1);
    p.close();
    await new Promise((r) => setTimeout(r, 0));
    expect(live(content)).toHaveLength(0);
    expect(content.style.getPropertyValue('opacity')).toBe('');
    expect(content.style.getPropertyValue('transform')).toBe('');
  });

  // The overlay is hidden in the paint after the rows' hooks ran, so the sweep does not see it: its
  // fade ends on its own (invisible, 0.14 s). Asserted: nothing left once that time has passed.
  it('the overlay hidden again mid-fade: no opacity left once its fade time has passed', async () => {
    const g = await grid();
    const overlay = g.host.querySelector<HTMLElement>('.dzg-overlay')!;
    g.g.update({ rows: [] });
    g.frame();
    await new Promise((r) => setTimeout(r, 0));
    advance(0.05);
    g.g.update({ rows: rowsOf(60) });
    g.frame();
    await new Promise((r) => setTimeout(r, 0));
    expect(overlay.hidden).toBe(true);
    // The next paint's sweep sees it hidden: finished there, before its time.
    g.scroll(32);
    expect(live(overlay)).toHaveLength(0);
    expect(overlay.style.getPropertyValue('opacity')).toBe('');
  });

  // motion.md: a `rows` update that replaces only a few rows marks them (the model's delta); a full
  // reload (more than half new) marks none.
  it('setRows: a big delta (a reset) marks nothing; one that replaces a few rows marks only their changed cells', async () => {
    const seen: string[] = [];
    const g = await grid({ onCell: (_e, c) => void seen.push(`${String(c.key)}:${c.column}`) });
    const big = rowsOf(60).map((r) => ({ ...r, n: r.n + 1 }));
    g.g.update({ rows: big });
    g.frame();
    expect(seen).toEqual([]);
    expect(g.root.querySelectorAll('.dzg-flash').length).toBe(0);
    clock.now += 1000;
    const rows = big.slice();
    rows[2] = { ...rows[2]!, s: 'new' };
    rows[3] = { ...rows[3]! };
    g.g.update({ rows });
    g.frame();
    expect(seen).toEqual([expect.stringMatching(/r2:s$/)]);
  });

  it('a cell element given to another column of the same row mid-flash is finished and cleared', async () => {
    const g = await grid();
    update(g, [{ id: 'r2', n: 77, s: 's2' }]);
    const el = g.cell('r2', 'n')!;
    expect(live(el)).toHaveLength(1);
    advance(0.1);
    // Column n is replaced by m at its place: the row's spare cell (n's) is taken for m in the same paint.
    g.g.update({ columns: [{ id: 'id' }, { id: 'm', field: 's' } as never, { id: 's' }] });
    g.frame();
    expect(el.getAttribute('data-col')).toBe('m');
    expect(live(el)).toHaveLength(0);
    expect(el.classList.contains('dzg-flash')).toBe(false);
    expect(el.style.getPropertyValue('--dzg-flash')).toBe('');
  });

  it('motion turned off then on: animates again, nothing runs while off', async () => {
    const g = await grid();
    g.g.update({ motion: false });
    g.frame();
    sortN(g);
    update(g, [{ id: 'r2', n: 77, s: 's2' }]);
    expect(gsap.globalTimeline.getChildren(true, true, false).filter((t) => t.progress() < 1)).toHaveLength(0);
    g.g.update({ motion: true });
    g.frame();
    clock.now += 1000;
    g.g.kernel.dispatch({ type: 'sort.set', sort: [] }, 'user');
    g.frame();
    expect(live(g.row('r1')!).length).toBe(1);
  });
});

describe('step 26 corrections', () => {
  // guard.ts tracks an element only when the built-in effect plays on it (flash.ts / flip.ts call
  // s.play after the hook); a hook that tweens and returns false is not followed.
  it('onCell tweens and returns false: the pooled cell is finished when it shows another row', async () => {
    let el: HTMLElement | null = null;
    const g = await grid({ onCell: (e) => { el = e; gsap.to(e, { opacity: 0.2, duration: 5 }); return false; } });
    update(g, [{ id: 'r2', n: 77, s: 's2' }]);
    clock.now += 1000;
    g.scroll(32 * 40);
    expect(live(el!)).toHaveLength(0);
  });

  it('onRow tweens and returns false: the pooled row is finished when it shows another row', async () => {
    let el: HTMLElement | null = null;
    const g = await grid({ onRow: (e, c) => { if ((c.row as R).id === 'r1') { el = e; gsap.to(e, { opacity: 0.3, duration: 5 }); return false; } } });
    sortN(g);
    clock.now += 1000;
    g.scroll(32 * 40);
    expect(live(el!)).toHaveLength(0);
  });

  it('destroyed while a hook’s own tween runs (hook returned false): nothing left', async () => {
    const g = await grid({ onCell: (e) => { gsap.to(e, { opacity: 0.2, duration: 5 }); return false; } });
    update(g, [{ id: 'r2', n: 77, s: 's2' }]);
    const c = g.cell('r2', 'n')!;
    g.g.destroy();
    made = [];
    expect(live(c)).toHaveLength(0);
  });

  it('a hook tween that ended leaves its end value inline only until the cell shows another row', async () => {
    let el: HTMLElement | null = null;
    const g = await grid({ onCell: (e) => { el = e; gsap.to(e, { opacity: 0.4, duration: 0.1 }); return false; } });
    update(g, [{ id: 'r2', n: 77, s: 's2' }]);
    advance(0.5);
    expect(el!.style.getPropertyValue('opacity')).toBe('0.4');
    clock.now += 1000;
    g.scroll(32 * 40);
    expect(g.cell('r2', 'n')).not.toBe(el);
    expect(el!.style.getPropertyValue('opacity')).toBe('');
  });

  // guard.ts release() runs on the built-in tween's onComplete and forgets the element, while a hook
  // tween longer than it still runs: a rebind later finds nothing to finish.
  it('a hook tween longer than the glide is still finished when the row is rebound', async () => {
    let el: HTMLElement | null = null;
    const g = await grid({ onRow: (e, c) => { if ((c.row as R).id === 'r1') { el = e; gsap.to(e, { opacity: 0.5, duration: 3 }); } } });
    sortN(g);
    advance(0.5); // the glide (0.3 s) is over, the hook's tween is not
    clock.now += 1000;
    g.scroll(32 * 40);
    expect(live(el!)).toHaveLength(0);
  });

  // flash.ts: guard.track replaces the entry without killing the first delayed call, which then
  // releases the element (and kills the second call) 0.1 s into the second mark.
  it('reduced motion: a second still mark, 0.5 s after the first, is held its 0.6 s', async () => {
    media.reduce = true;
    const g = await grid();
    update(g, [{ id: 'r2', n: 77, s: 's2' }]);
    advance(0.52);
    clock.now += 520;
    update(g, [{ id: 'r2', n: 78, s: 's2' }]);
    const c = g.cell('r2', 'n')!;
    expect(c.classList.contains('dzg-flash')).toBe(true);
    advance(0.2);
    expect(c.classList.contains('dzg-flash')).toBe(true);
  });

  // flash.ts: the 500 ms cap is kept per element (WeakMap<Element>), and elements are pooled: a
  // cell shown for another row inherits the cap of the one it showed before.
  it('the 500 ms cap is per cell, not per pooled element', async () => {
    const g = await grid();
    update(g, [{ id: 'r2', n: 77, s: 's2' }]);
    const el = g.cell('r2', 'n')!;
    advance(1);
    clock.now += 160;
    g.scroll(32 * 40);
    clock.now += 160;
    const id = el.closest('.dzg-row')?.querySelector('[data-col="id"]')?.textContent;
    expect(id && id !== 'r2').toBeTruthy();
    const r = rowsOf(60).find((x) => x.id === id)!;
    update(g, [{ ...r, n: 9999 }]);
    expect(g.cell(id!, 'n')!.classList.contains('dzg-flash')).toBe(true);
  });
});
