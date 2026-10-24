// Phase 5 step 7, the saves' motion (D9, Q10 B, owner S7-O5; edit-save.md 11, motion.md; step07-plan.md finding 7,
// « Motion reasons »): `onCell(el, c, 'saving' | 'saved' | 'failed')` after the grid's guards, the built-in saved
// flash (the live flash, under its caps), reduced motion, `motion: false`, pooled cells, destroy. Real GSAP in jsdom,
// matchMedia stubbed, frames by hand.
import { describe, it, expect, afterEach, afterAll, beforeEach, vi } from 'vitest';
import { gsap } from 'gsap';
import { dataKey, type ColumnDef } from '@dzgrid/core';
import type { SaveRequest } from '@dzgrid/core/edit';
import { motion, type CellMotion, type MotionOptions } from '../src/motion-gsap.js';
import { edit, type EditApi } from '../src/edit.js';
import { EN } from '../src/locales/en.js';
import { EN_EDIT } from '../src/locales/en-edit.js';
import { EN_PAGINATION } from '../src/locales/en-pagination.js';
import { changeMedia, clock, leftovers, media, mount, rowsOf, stubMedia, type Made, type R } from './support-motion.js';

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

const k = (id: string) => dataKey(id)!;
const later = (ms = 1000) => void (clock.now += ms);
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const running = (el: Element | null): number => (el ? gsap.getTweensOf(el).filter((t) => t.progress() < 1).length : 0);
const COLS: ColumnDef<R, any>[] = [{ id: 'id' }, { id: 'n', type: 'number', editable: true }, { id: 's', editable: true }];

interface Seen { key: string; column: string; reason: string; value: unknown; text: string; previousText: string; reduced: boolean; el: HTMLElement }

async function grid(o: MotionOptions = {}, settings: Parameters<typeof mount>[0] = {}, mo: Parameters<typeof mount>[1] = {}) {
  const held: { req: SaveRequest<R>; ok(): void; no(e: unknown): void }[] = [];
  const save = (req: SaveRequest<R>) => new Promise<void>((ok, no) => void held.push({ req, ok: () => ok(), no }));
  const seen: Seen[] = [];
  const hook = o.onCell;
  const m = motion({
    gsap, ...o,
    onCell: (el, c: CellMotion, reason) => {
      seen.push({ key: String(c.key).replace(/^d:\d+:/, ''), column: c.column, reason, value: c.value, text: c.text, previousText: c.previousText, reduced: c.reduced, el });
      return hook?.(el, c, reason as never);
    },
  });
  const e = edit<R>({ save });
  const g = mount({ features: [e, m], columns: COLS, messages: { ...EN, text: { ...EN.text, ...EN_EDIT.text, ...EN_PAGINATION.text } }, ...settings }, mo);
  made.push(g);
  await m.load();
  later();
  g.frame();
  const api = e.api(g.g as never)! as EditApi<R>;
  const put = (id: string, text: string, col = 'n') => api.commit([{ key: k(id), column: col, input: { text } }]);
  const settle = async (i: number, err?: unknown) => {
    if (err === undefined) held[i]!.ok();
    else held[i]!.no(err);
    await flush();
    g.frame();
  };
  const why = () => seen.map((x) => `${x.key}/${x.column}:${x.reason}`);
  return { ...g, m, api, held, put, settle, seen, why };
}

describe('the reasons (D9)', () => {
  it('saving once per gesture and cell, then saved; the built-in saved flash; the values and texts', async () => {
    const g = await grid();
    g.put('r1', '42');
    g.frame();
    expect(g.why()).toEqual(['r1/n:saving']);
    expect(g.seen[0]).toMatchObject({ value: 42, text: '42', previousText: '0', reduced: false });
    // Another paint (a scroll, a refresh): not again.
    g.g.api.refresh();
    g.frame();
    g.scroll(32);
    g.scroll(0);
    later(200);
    expect(g.why()).toEqual(['r1/n:saving']);
    await g.settle(0);
    expect(g.why()).toEqual(['r1/n:saving', 'r1/n:saved']);
    // previousText: the row's own value under the edit (the rows are never written).
    expect(g.seen[1]).toMatchObject({ value: 42, text: '42', previousText: '0' });
    const cell = g.cell('r1', 'n')!;
    expect(cell.classList.contains('dzg-flash')).toBe(true);
    expect(running(cell)).toBe(1);
    // A new gesture on the same cell: saving again.
    later(1000);
    g.put('r1', '43');
    g.frame();
    expect(g.why().at(-1)).toBe('r1/n:saving');
  });

  it('failed: the refused value and text (shown during the hold), previousText the last saved text', async () => {
    const g = await grid();
    g.put('r1', '42');
    g.frame();
    await g.settle(0);
    later(1000);
    g.put('r1', '17');
    g.frame();
    await g.settle(1, { reason: 'no' });
    expect(g.why()).toEqual(['r1/n:saving', 'r1/n:saved', 'r1/n:saving', 'r1/n:failed']);
    expect(g.seen.at(-1)).toMatchObject({ value: 17, text: '17', previousText: '42' });
    // No built-in for failed (the CSS blink).
    expect(g.cell('r1', 'n')!.classList.contains('dzg-flash')).toBe(false);
  });

  it('pending says nothing; a gesture waiting then sent says saving', async () => {
    const g = await grid();
    g.put('r1', '42');
    g.frame();
    g.put('r1', '43');
    g.frame();
    expect(g.why()).toEqual(['r1/n:saving']);
    g.held[0]!.ok();
    await flush();
    g.frame();
    expect(g.why()).toEqual(['r1/n:saving', 'r1/n:saving']);
    expect(g.seen[1]!.value).toBe(43);
  });

  it('a transition first finishes what the previous reason started (the host\'s own tweens too)', async () => {
    let tween: gsap.core.Tween | null = null;
    const g = await grid({ onCell: (el, _c, reason) => void (reason === 'saving' && (tween = gsap.to(el, { opacity: 0.5, duration: 30 }))) });
    g.put('r1', '42');
    g.frame();
    expect(tween!.progress()).toBeLessThan(1);
    await g.settle(0);
    expect(tween!.progress()).toBe(1);
  });

  it('false from the hook skips the built-in saved flash; effects.flash false too (the hook still called)', async () => {
    const a = await grid({ onCell: () => false });
    a.put('r1', '42');
    a.frame();
    await a.settle(0);
    expect(a.why()).toEqual(['r1/n:saving', 'r1/n:saved']);
    expect(a.cell('r1', 'n')!.classList.contains('dzg-flash')).toBe(false);
    const b = await grid({ effects: { flash: false } });
    b.put('r1', '42');
    b.frame();
    await b.settle(0);
    expect(b.why()).toEqual(['r1/n:saving', 'r1/n:saved']);
    expect(b.cell('r1', 'n')!.classList.contains('dzg-flash')).toBe(false);
  });

  it('reduced motion: the hooks told reduced: true; the saved mark still for 0.6 s, nothing moves', async () => {
    media.reduce = true;
    const g = await grid();
    changeMedia(true);
    g.put('r1', '42');
    g.frame();
    await g.settle(0);
    expect(g.seen.map((x) => x.reduced)).toEqual([true, true]);
    const cell = g.cell('r1', 'n')!;
    expect(cell.classList.contains('dzg-flash')).toBe(true);
    expect(cell.style.getPropertyValue('--dzg-flash')).toBe('1');
    expect(gsap.getTweensOf(cell).filter((t) => t.progress() < 1 && t.duration() > 0)).toHaveLength(0);
    gsap.globalTimeline.getChildren(true, true, false).forEach((t) => t.progress(1));
    expect(cell.classList.contains('dzg-flash')).toBe(false);
    expect(leftovers(g.host)).toEqual([]);
  });

  it('motion: false: nothing called, what runs finished', async () => {
    const g = await grid();
    g.put('r1', '42');
    g.frame();
    g.g.update({ motion: false });
    g.frame();
    await g.settle(0);
    expect(g.why()).toEqual(['r1/n:saving']);
    expect(leftovers(g.host)).toEqual([]);
  });
});

describe('the guards', () => {
  it('more than 50 cells in one paint: none (a bulk save); the hook cap of 50 is shared with live changes', async () => {
    const g = await grid({}, {}, { rows: rowsOf(80), block: 3000 });
    g.api.commit(Array.from({ length: 51 }, (_, i) => ({ key: k(`r${i}`), column: 'n', input: { text: String(500 + i) } })));
    g.frame();
    expect(g.why()).toEqual([]);
    await g.settle(0);
    expect(g.why()).toEqual([]);
    expect(g.host.querySelectorAll('.dzg-flash').length).toBe(0);
    // 30 changed live + 30 saving in one paint: 50 hook calls at most.
    later(1000);
    g.api.commit(Array.from({ length: 30 }, (_, i) => ({ key: k(`r${i}`), column: 's', input: { text: `x${i}` } })));
    g.g.kernel.rows.applyTransaction({ update: rowsOf(80).slice(40, 70).map((r) => ({ ...r, s: `${r.s}!` })) });
    g.frame();
    expect(g.seen.length).toBe(50);
  });

  it('one flash per cell per 500 ms: changed live then saved at once: one', async () => {
    const g = await grid();
    g.put('r1', '42');
    g.frame();
    later(1000);
    g.g.kernel.rows.applyTransaction({ update: [{ id: 'r1', n: 0, s: 'live' }] });
    g.frame();
    const cell = g.cell('r1', 's')!;
    expect(cell.classList.contains('dzg-flash')).toBe(true);
    g.api.commit([{ key: k('r1'), column: 's', input: { text: 'mine' } }]);
    g.frame();
    later(100);
    await g.settle(1);
    expect(g.why()).toContain('r1/s:saved');
    expect(gsap.getTweensOf(cell).length).toBeLessThanOrEqual(1);
  });

  it('none within 150 ms of a scroll (the hook still told)', async () => {
    const g = await grid();
    g.put('r1', '42');
    g.frame();
    g.held[0]!.ok();
    await flush();
    g.scroll(4);
    expect(g.why()).toEqual(['r1/n:saving', 'r1/n:saved']);
    expect(g.cell('r1', 'n')!.classList.contains('dzg-flash')).toBe(false);
  });

  it('a cell not mounted is not hooked, then or when it comes back', async () => {
    const g = await grid({}, {}, { rows: rowsOf(200) });
    g.put('r150', '42');
    g.frame();
    await g.settle(0);
    expect(g.why()).toEqual([]);
    g.scroll(140 * 32);
    later(200);
    g.frame();
    expect(g.why()).toEqual([]);
  });

  it('a pooled cell shown for another row is finished (the host\'s saving tween too)', async () => {
    let tween: gsap.core.Tween | null = null;
    const g = await grid({ onCell: (el, _c, r) => void (r === 'saving' && (tween = gsap.to(el, { opacity: 0.5, duration: 30 }))) }, {}, { rows: rowsOf(200) });
    g.put('r1', '42');
    g.frame();
    expect(tween!.progress()).toBeLessThan(1);
    g.scroll(100 * 32);
    later(200);
    g.frame();
    expect(tween!.progress()).toBe(1);
    expect(leftovers(g.host)).toEqual([]);
  });

  it('the chunk not loaded: the marks alone, nothing animated', async () => {
    const m = motion({ gsap });
    const e = edit<R>({ save: () => new Promise(() => {}) });
    const g = mount({ features: [e, m], columns: COLS, messages: { ...EN, text: { ...EN.text, ...EN_EDIT.text, ...EN_PAGINATION.text } } });
    made.push(g);
    e.api(g.g as never)!.commit([{ key: k('r1'), column: 'n', input: { text: '42' } }]);
    g.frame();
    expect(g.cell('r1', 'n')!.classList.contains('dzg-cell--saving')).toBe(true);
    expect(gsap.globalTimeline.getChildren().length).toBe(0);
  });

  it('two grids on one motion(): each its own reasons', async () => {
    const seen: string[] = [];
    const m = motion({ gsap, onCell: (el, c, r) => void seen.push(`${el.closest('.dzg')!.getAttribute('data-name')}:${String(c.key).replace(/^d:\d+:/, '')}:${r}`) });
    const mk = (name: string) => {
      const e = edit<R>({});
      const g = mount({ features: [e, m], columns: COLS, messages: { ...EN, text: { ...EN.text, ...EN_EDIT.text, ...EN_PAGINATION.text } } });
      g.root.setAttribute('data-name', name);
      made.push(g);
      return { g, e };
    };
    const a = mk('a');
    const b = mk('b');
    await m.load();
    later();
    a.e.api(a.g.g as never)!.commit([{ key: k('r1'), column: 'n', input: { text: '42' } }]);
    a.g.frame();
    b.g.frame();
    expect(seen).toEqual(['a:r1:saved']);
  });

  it('destroyed mid-tween: no transform, opacity or --dzg-flash left', async () => {
    const g = await grid();
    g.put('r1', '42');
    g.frame();
    await g.settle(0);
    const cell = g.cell('r1', 'n')!;
    expect(running(cell)).toBe(1);
    g.g.destroy();
    made = made.filter((x) => x !== g);
    expect(cell.style.getPropertyValue('--dzg-flash')).toBe('');
    expect(cell.classList.contains('dzg-flash')).toBe(false);
  });

  it('reads no layout', async () => {
    const reads: string[] = [];
    const g = await grid();
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(() => (reads.push('rect'), new DOMRect()));
    for (const p of ['offsetTop', 'offsetHeight', 'offsetWidth', 'clientHeight'] as const) vi.spyOn(HTMLElement.prototype, p, 'get').mockImplementation(() => (reads.push(p), 0));
    // GSAP reads an element's offset parent to parse a transform it clears (found in Chrome, step 7): none either.
    vi.spyOn(HTMLElement.prototype, 'offsetParent', 'get').mockImplementation(function (this: HTMLElement) { reads.push('offsetParent'); return this.parentElement; });
    g.put('r1', '42');
    g.frame();
    await g.settle(0);
    g.put('r2', '17');
    g.frame();
    await g.settle(1, { reason: 'no' });
    expect(g.why()).toEqual(['r1/n:saving', 'r1/n:saved', 'r2/n:saving', 'r2/n:failed']);
    expect(reads).toEqual([]);
  });

describe('analyser 9–10, 12 (step 7)', () => {
  it('9: motion off while saving, then on again: no stale hook for what happened meanwhile', async () => {
    const g = await grid();
    g.put('r1', '42');
    g.g.update({ motion: false });
    g.frame();
    await g.settle(0);
    g.g.update({ motion: true });
    g.frame();
    g.g.api.refresh();
    g.frame();
    expect(g.why()).toEqual([]);
  });

  it('10: a save within 150 ms of a scroll does not use up the cell\'s 500 ms mark: a save just after flashes', async () => {
    const g = await grid();
    g.put('r1', '42');
    g.frame();
    g.held[0]!.ok();
    await flush();
    g.scroll(4);
    expect(g.cell('r1', 'n')!.classList.contains('dzg-flash')).toBe(false);
    later(200);
    g.put('r1', '43');
    g.frame();
    await g.settle(1);
    expect(g.cell('r1', 'n')!.classList.contains('dzg-flash')).toBe(true);
  });

  it('12: failed told once per refusal (another paint, a scroll: not again)', async () => {
    const g = await grid();
    g.put('r1', '17');
    g.frame();
    await g.settle(0, { reason: 'no' });
    g.g.api.refresh();
    g.frame();
    later(600);
    g.frame();
    expect(g.why().filter((x) => x.endsWith(':failed'))).toEqual(['r1/n:failed']);
  });
});
});
