// `@dzgrid/dom/motion-gsap` (step 26; docs/behaviors/motion.md): real GSAP in jsdom, matchMedia
// stubbed, frames run by hand (the paint follows the model's events, as in a browser).
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { gsap } from 'gsap';
import { dataKey, idOfDataKey, type RowKey } from '@dzgrid/core';
import { motion, type Motion } from '../src/motion-gsap.js';
import { popupsFor } from '../src/popup.js';
import type { GridContext } from '../src/context.js';
import { changeMedia, clock, leftovers, media, mount, rowsOf, stubMedia, type Made, type R } from './support-motion.js';

let made: Made[] = [];
beforeEach(() => {
  media.reduce = false;
  clock.now = 1000;
  stubMedia();
});
afterEach(() => {
  for (const m of made) m.g.destroy();
  made = [];
  document.body.innerHTML = '';
  gsap.globalTimeline.clear();
  vi.restoreAllMocks();
  delete (window as { reportError?: unknown }).reportError;
});

const running = (el: Element | null): number => (el ? gsap.getTweensOf(el).filter((t) => t.progress() < 1).length : 0);
/** Finishes every tween and delayed call (as time passing would). */
const finish = (): void => {
  for (let i = 0; i < 5; i++) for (const t of gsap.globalTimeline.getChildren(true, true, false)) if (t.progress() < 1) t.progress(1);
};
const y = (el: Element | null): number => Number(gsap.getProperty(el as Element, 'y'));
const later = (ms = 1000) => void (clock.now += ms);

async function grid(o: Parameters<typeof motion>[0] = {}, settings: Parameters<typeof mount>[0] = {}, mo: Parameters<typeof mount>[1] = {}, m: Motion = motion({ gsap, ...o })) {
  const g = mount({ features: [m], ...settings }, mo);
  made.push(g);
  await m.load();
  later();
  return { ...g, m };
}
const sortN = (g: Made, dir: 'asc' | 'desc' = 'asc') => {
  g.g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'n', dir }] }, 'user');
  g.frame();
};
const update = (g: Made, rows: R[]) => {
  g.g.kernel.rows.applyTransaction({ update: rows });
  g.frame();
};

describe('loading', () => {
  it('animates nothing before its chunk is loaded (the first instants: owner Q1)', () => {
    const m = motion({ gsap });
    const g = mount({ features: [m] });
    made.push(g);
    expect(m.loaded).toBe(false);
    sortN(g);
    expect(gsap.globalTimeline.getChildren().length).toBe(0);
    expect(leftovers(g.host)).toEqual([]);
  });

  it('loads at idle once the first rows are painted, then animates', async () => {
    const m = motion({ gsap });
    const g = mount({ features: [m] });
    made.push(g);
    await vi.waitFor(() => expect(m.loaded).toBe(true));
    later();
    sortN(g);
    expect(running(g.row('r1'))).toBe(1);
  });

  it('does not load while settings.motion is false', async () => {
    const m = motion({ gsap });
    const g = mount({ features: [m], motion: false });
    made.push(g);
    await new Promise((r) => setTimeout(r, 30));
    expect(m.loaded).toBe(false);
  });

  it('animates nothing on the first paint, a scroll, or a plain reload', async () => {
    const g = await grid();
    expect(gsap.globalTimeline.getChildren().length).toBe(0);
    g.scroll(64);
    later();
    g.g.update({ rows: rowsOf(60).map((r) => ({ ...r, s: `${r.s}!` })) });
    g.frame();
    expect(gsap.globalTimeline.getChildren().length).toBe(0);
    expect(g.root.querySelectorAll('.dzg-flash').length).toBe(0);
  });
});

describe('rows glide after a sort or a filter (FLIP)', () => {
  it('moves each row from its old offset to the new one, y only, from the offset the grid wrote (no layout read)', async () => {
    const g = await grid();
    const r1 = g.row('r1')!;
    const r0 = g.row('r0')!;
    const top = r1.style.getPropertyValue('inset-block-start');
    sortN(g);
    // r1 (n 0) is now first: it came from one row lower; r0 went one row down.
    expect(y(r1)).toBe(32);
    expect(y(r0)).toBe(-32);
    expect(gsap.getProperty(r1, 'x')).toBe(0);
    finish();
    expect(leftovers(g.host)).toEqual([]);
    // Its layout, written by the grid, untouched: its new place.
    expect(r1.style.getPropertyValue('inset-block-start')).not.toBe(top);
    expect(r1.style.getPropertyValue('inset-block-start')).toBe('0px');
  });

  it('fades in rows that enter the window after a filter; leaving rows just go', async () => {
    const g = await grid();
    g.g.kernel.dispatch({ type: 'filter.column', column: 's', filter: { type: 'text', op: 'notEqual', value: 's0' } }, 'user');
    g.frame();
    const entered = [...g.host.querySelectorAll<HTMLElement>('.dzg-row')].filter((r) => gsap.getTweensOf(r).some((t) => t.vars['opacity'] === 1));
    expect(entered.length).toBeGreaterThan(0);
    expect(Number(gsap.getProperty(entered[0]!, 'opacity'))).toBe(0);
    expect(y(g.row('r1'))).toBe(32);
  });

  it('fades no entering row when more than 20 enter (the window is mostly new: it simply shows)', async () => {
    const g = await grid({}, {}, { block: 1700, rows: rowsOf(200) });
    sortN(g, 'desc');
    const fading = [...g.host.querySelectorAll<HTMLElement>('.dzg-row')].filter((r) => gsap.getTweensOf(r).length > 0);
    expect(fading).toEqual([]);
  });

  it('skips more than 60 moving rows', async () => {
    const g = await grid({}, {}, { block: 3200, rows: rowsOf(200) });
    expect(g.host.querySelectorAll('.dzg-row').length).toBeGreaterThan(60);
    sortN(g);
    expect(gsap.globalTimeline.getChildren().length).toBe(0);
  });

  it('skips a paint less than 150 ms after the previous armed one (typing)', async () => {
    const g = await grid();
    sortN(g);
    finish();
    clock.now += 100;
    // Back to the rows' own order: r1 moves again, but too soon after the last change.
    g.g.kernel.dispatch({ type: 'sort.set', sort: [] }, 'user');
    g.frame();
    expect(running(g.row('r1'))).toBe(0);
    clock.now += 1000;
    sortN(g);
    expect(running(g.row('r1'))).toBe(1);
  });

  it('does not glide a row moving more than a screen (the focused row, kept mounted far away)', async () => {
    const g = await grid({}, {}, { rows: rowsOf(200) });
    g.g.api.focusCell(dataKey('r1')!, 'n');
    g.frame();
    later();
    sortN(g, 'desc');
    const r1 = g.row('r1')!;
    expect(r1).not.toBeNull();
    expect(running(r1)).toBe(0);
  });

  it('skips when the view scrolled between the change and the paint', async () => {
    const g = await grid();
    g.g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'n', dir: 'asc' }] }, 'user');
    clock.now += 5;
    g.scroll(32);
    expect(gsap.globalTimeline.getChildren().length).toBe(0);
  });

  it('is switched off by effects, by settings.motion (live) and by reduced motion', async () => {
    const a = await grid({ effects: { flip: false } });
    sortN(a);
    expect(running(a.row('r1'))).toBe(0);
    const b = await grid({}, { motion: false });
    sortN(b);
    expect(running(b.row('r1'))).toBe(0);
    media.reduce = true;
    const c = await grid();
    sortN(c);
    expect(gsap.globalTimeline.getChildren().length).toBe(0);
  });

  it('settings.motion turned off mid-glide finishes it and clears its props', async () => {
    const g = await grid();
    sortN(g);
    expect(running(g.row('r1'))).toBe(1);
    g.g.update({ motion: false });
    g.frame();
    expect(running(g.row('r1'))).toBe(0);
    expect(leftovers(g.host)).toEqual([]);
    expect(g.root.getAttribute('data-motion')).toBe('off');
  });

  it('pooled-row guard: a row element shown for another row mid-glide is finished and cleared first', async () => {
    const g = await grid();
    sortN(g);
    const el = g.row('r1')!;
    expect(running(el)).toBe(1);
    g.scroll(32 * 40);
    // The element now shows another row (or waits in the pool): no transform left, its layout intact.
    expect(running(el)).toBe(0);
    expect(el.style.getPropertyValue('transform')).toBe('');
    expect(el.style.getPropertyValue('block-size')).toBe('32px');
  });
});

describe('the value flash', () => {
  it('marks a cell whose text a transaction changed: class dzg-flash and --dzg-flash 1 → 0', async () => {
    const g = await grid();
    update(g, [{ id: 'r2', n: 77, s: 's2' }]);
    const c = g.cell('r2', 'n')!;
    expect(c.classList.contains('dzg-flash')).toBe(true);
    expect(Number(c.style.getPropertyValue('--dzg-flash'))).toBe(1);
    // Same row, a column whose text did not change: no mark.
    expect(g.cell('r2', 's')!.classList.contains('dzg-flash')).toBe(false);
    finish();
    expect(leftovers(g.host)).toEqual([]);
  });

  it('marks an added row’s cells; not a plain reload', async () => {
    const g = await grid({}, {}, { rows: rowsOf(5) });
    g.g.kernel.rows.applyTransaction({ add: [{ id: 'x', n: 99, s: 'new' }] });
    g.frame();
    expect(g.cell('x', 's')!.classList.contains('dzg-flash')).toBe(true);
  });

  it('marks none over 50 cells in one paint (bulk), and none within 150 ms of a scroll', async () => {
    const g = await grid({}, {}, { block: 3200, rows: rowsOf(200) });
    update(g, rowsOf(30).map((r) => ({ ...r, n: r.n + 1000, s: `${r.s}+` })));
    expect(g.root.querySelectorAll('.dzg-flash').length).toBe(0);
    later();
    g.scroll(32);
    clock.now += 50;
    update(g, [{ id: 'r5', n: 555, s: 's5' }]);
    expect(g.root.querySelectorAll('.dzg-flash').length).toBe(0);
  });

  it('marks a cell at most once per 500 ms', async () => {
    const g = await grid();
    update(g, [{ id: 'r2', n: 77, s: 's2' }]);
    finish();
    clock.now += 200;
    update(g, [{ id: 'r2', n: 78, s: 's2' }]);
    expect(g.cell('r2', 'n')!.classList.contains('dzg-flash')).toBe(false);
    clock.now += 600;
    update(g, [{ id: 'r2', n: 79, s: 's2' }]);
    expect(g.cell('r2', 'n')!.classList.contains('dzg-flash')).toBe(true);
  });

  it('under reduced motion: no tween, a still mark held 0.6 s by a delayed call', async () => {
    media.reduce = true;
    const g = await grid();
    update(g, [{ id: 'r2', n: 77, s: 's2' }]);
    const c = g.cell('r2', 'n')!;
    expect([c.classList.contains('dzg-flash'), c.style.getPropertyValue('--dzg-flash')]).toEqual([true, '1']);
    expect(gsap.getTweensOf(c).length).toBe(0);
    const calls = gsap.globalTimeline.getChildren(false, true, false).filter((t) => t.duration() === 0.6 || t.vars.delay === 0.6);
    expect(calls.length).toBe(1);
    finish();
    expect(c.classList.contains('dzg-flash')).toBe(false);
    expect(leftovers(g.host)).toEqual([]);
  });

  it('effects.flash false: no mark', async () => {
    const g = await grid({ effects: { flash: false } });
    update(g, [{ id: 'r2', n: 77, s: 's2' }]);
    expect(g.root.querySelectorAll('.dzg-flash').length).toBe(0);
  });
});

describe('the page slide', () => {
  it('slides the layer from the end side for the next page (left to right: +24 px), the start side back', async () => {
    const g = await grid({}, { pagination: { pageSize: 10 } });
    g.g.kernel.dispatch({ type: 'page.go', index: 1 }, 'user');
    g.frame();
    expect(gsap.getProperty(g.layer, 'x')).toBe(24);
    expect(Number(gsap.getProperty(g.layer, 'opacity'))).toBeCloseTo(0.4);
    finish();
    later();
    g.g.kernel.dispatch({ type: 'page.go', index: 0 }, 'user');
    g.frame();
    expect(gsap.getProperty(g.layer, 'x')).toBe(-24);
    finish();
    expect(leftovers(g.host)).toEqual([]);
    expect(g.layer.style.getPropertyValue('inset-block-start')).not.toBe('');
  });

  it('flips its sign right to left', async () => {
    const g = await grid({}, { pagination: { pageSize: 10 }, direction: 'rtl' });
    g.g.kernel.dispatch({ type: 'page.go', index: 1 }, 'user');
    g.frame();
    expect(gsap.getProperty(g.layer, 'x')).toBe(-24);
  });
});

describe('popups and the overlay (owner Q2)', () => {
  it('a popup opening fades in with a 4 px rise; its focus is the popup host’s, untouched; close is instant', async () => {
    const g = await grid();
    const ctx = (g.g as unknown as { context: GridContext<unknown> }).context;
    const anchor = g.host.querySelector<HTMLElement>('.dzg-hcell')!;
    const content = document.createElement('div');
    content.innerHTML = '<button type="button">ok</button>';
    const p = popupsFor(ctx).open(anchor, content, { placement: 'block-end', modal: true });
    const focused = document.activeElement;
    expect(focused?.textContent).toBe('ok');
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    // Its content moves (the popup itself is fixed: GSAP would move it out of the page to read it),
    // from 0 opacity, 4 px lower.
    const [t] = gsap.getTweensOf(content);
    expect(t?.duration()).toBe(0.14);
    t!.progress(0);
    expect(Number(gsap.getProperty(content, 'opacity'))).toBe(0);
    expect(gsap.getProperty(content, 'y')).toBe(4);
    expect(p.el.style.getPropertyValue('transform')).toBe('');
    expect(document.activeElement).toBe(focused);
    p.close();
    expect(p.el.isConnected).toBe(false);
    await new Promise((r) => setTimeout(r, 0));
    expect(running(content)).toBe(0);
    expect(content.style.getPropertyValue('opacity')).toBe('');
  });

  it('the overlay fades in when it appears; never delayed (hidden is the truth)', async () => {
    const g = await grid();
    const overlay = g.host.querySelector<HTMLElement>('.dzg-overlay')!;
    g.g.update({ rows: [] });
    g.frame();
    expect(overlay.hidden).toBe(false);
    await new Promise((r) => setTimeout(r, 0));
    expect(Number(gsap.getProperty(overlay, 'opacity'))).toBe(0);
    finish();
    expect(overlay.style.getPropertyValue('opacity')).toBe('');
  });
});

describe('the host hook', () => {
  it('onCell gets the element, the change and "changed"; false skips the built-in flash', async () => {
    const seen: unknown[] = [];
    const g = await grid({ onCell: (el, c, reason) => (seen.push({ el: el.dataset['col'], key: c.key, column: c.column, value: c.value, text: c.text, previousText: c.previousText, row: (c.row as R).id, context: c.context, reduced: c.reduced, reason }), false) }, { context: 'ctx' });
    update(g, [{ id: 'r2', n: 77, s: 's2' }]);
    expect(seen).toEqual([{ el: 'n', key: dataKey('r2'), column: 'n', value: 77, text: '77', previousText: '3', row: 'r2', context: 'ctx', reduced: false, reason: 'changed' }]);
    expect(g.root.querySelectorAll('.dzg-flash').length).toBe(0);
  });

  it('onRow gets "moved" and "entered" rows with key, row, index and context; a throw is reported, the effect kept', async () => {
    const reported: unknown[] = [];
    (window as Window & { reportError?: (e: unknown) => void }).reportError = (e) => reported.push(e);
    const seen: string[] = [];
    const g = await grid({ onRow: (_el, c, reason) => {
      seen.push(`${reason}:${String(idOfDataKey(c.key as RowKey))}:${c.index}:${(c.row as R).id}`);
      if ((c.row as R).id === 'r0') throw new Error('hook');
    } });
    sortN(g);
    expect(seen).toContain('moved:r1:0:r1');
    expect(seen).toContain('moved:r0:1:r0');
    expect(reported.length).toBe(1);
    expect(running(g.row('r0'))).toBe(1);
  });

  it('under reduced motion only "changed" is called, with reduced: true', async () => {
    media.reduce = true;
    const rows: string[] = [];
    const cells: boolean[] = [];
    const g = await grid({ onRow: () => void rows.push('row'), onCell: (_e, c) => void cells.push(c.reduced) });
    sortN(g);
    later();
    // Not the sort's column: the row stays in view.
    update(g, [{ id: 'r2', n: 3, s: 'changed' }]);
    expect(rows).toEqual([]);
    expect(cells).toEqual([true]);
  });

  it('is called at most 50 times per paint', async () => {
    let calls = 0;
    // About 56 rows mounted: 55 move (under the cap of 60), one enters.
    const g = await grid({ onRow: () => void calls++ }, {}, { block: 1700, rows: rowsOf(200) });
    expect(g.host.querySelectorAll('.dzg-row').length).toBeGreaterThan(50);
    expect(g.host.querySelectorAll('.dzg-row').length).toBeLessThanOrEqual(61);
    g.g.kernel.dispatch({ type: 'filter.column', column: 's', filter: { type: 'text', op: 'notEqual', value: 's0' } }, 'user');
    g.frame();
    expect(calls).toBe(50);
  });

  it('a hook’s own tween on a pooled element is finished when the element shows another row', async () => {
    let tween: gsap.core.Tween | null = null;
    const g = await grid({ onRow: (el, c) => { if ((c.row as R).id === 'r1') tween = gsap.to(el, { x: 10, duration: 5 }); } });
    sortN(g);
    const el = g.row('r1')!;
    expect(tween!.progress()).toBeLessThan(1);
    g.scroll(32 * 40);
    expect(tween!.progress()).toBe(1);
    expect(el.style.getPropertyValue('transform')).toBe('');
  });
});

describe('destroy and sharing', () => {
  it('destroyed mid-tween: no motion prop left, the layout props intact, the delayed calls killed', async () => {
    media.reduce = false;
    const g = await grid();
    sortN(g);
    later();
    update(g, [{ id: 'r2', n: 77, s: 's2' }]);
    const rowsEls = [...g.host.querySelectorAll<HTMLElement>('.dzg-row')];
    const cells = [...g.host.querySelectorAll<HTMLElement>('.dzg-cell')];
    g.g.destroy();
    made = made.filter((x) => x !== g);
    for (const el of [...rowsEls, ...cells]) {
      expect(el.style.getPropertyValue('transform')).toBe('');
      expect(el.style.getPropertyValue('opacity')).toBe('');
      expect(el.style.getPropertyValue('--dzg-flash')).toBe('');
      expect(el.classList.contains('dzg-flash')).toBe(false);
    }
    expect(rowsEls.every((r) => r.style.getPropertyValue('inline-size') !== '')).toBe(true);
    expect(gsap.globalTimeline.getChildren().filter((t) => t.progress() < 1).length).toBe(0);
  });

  it('destroyed during a still mark (reduced motion): its delayed call is killed', async () => {
    media.reduce = true;
    const g = await grid();
    update(g, [{ id: 'r2', n: 77, s: 's2' }]);
    const calls = () => gsap.globalTimeline.getChildren(false, true, false).filter((t) => t.vars.delay === 0.6);
    expect(calls()).toHaveLength(1);
    g.g.destroy();
    made = made.filter((x) => x !== g);
    expect(calls()).toHaveLength(0);
  });

  it('one motion() serves two grids; one destroyed, the other still animates', async () => {
    const m = motion({ gsap });
    const a = await grid({}, {}, {}, m);
    const b = await grid({}, {}, {}, m);
    sortN(a);
    sortN(b);
    expect([running(a.row('r1')), running(b.row('r1'))]).toEqual([1, 1]);
    a.g.destroy();
    made = made.filter((x) => x !== a);
    finish();
    later();
    sortN(b, 'desc');
    expect(gsap.globalTimeline.getChildren().filter((t) => t.progress() < 1).length).toBeGreaterThan(0);
  });

  it('a change of the reduced-motion setting finishes what runs', async () => {
    const g = await grid();
    sortN(g);
    expect(running(g.row('r1'))).toBe(1);
    changeMedia(true);
    expect(running(g.row('r1'))).toBe(0);
  });
});
