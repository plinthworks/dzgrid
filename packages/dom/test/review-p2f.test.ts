import { describe, it, expect, afterEach } from 'vitest';
import { dataKey, type ColumnDef } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import type { GridSettings } from '../src/settings.js';
import { EN } from '../src/locales/en.js';

type R = { id: string; name: string; n: number; t: string };
let grids: GridInstance<R>[] = [];
afterEach(() => { for (const g of grids) g.destroy(); grids = []; document.body.innerHTML = ''; });
const tick = (ms = 80) => new Promise((r) => setTimeout(r, ms));
const COLS: ColumnDef<R, any>[] = [
  { id: 'name', header: 'Name', width: 100, pinned: 'start' }, { id: 'n', header: 'Count', type: 'number', width: 100 }, { id: 't', header: 'Kind', width: 100 },
  ...Array.from({ length: 20 }, (_, i): ColumnDef<R, any> => ({ id: `x${i}`, value: () => i, width: 100 })),
  { id: 'z', header: 'Z', width: 80, pinned: 'end', value: () => 1 },
];
function make(over: Partial<GridSettings<R>> = {}, count = 1000, env: { maxPhysical?: number; raf?: any } = {}) {
  const max = env.maxPhysical ?? Infinity;
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: 320, inline: 600, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = Math.max(0, Math.min(px, max - box.block)); }, writeScrollInline: (px) => { box.scrollInline = px; } };
  const host = document.createElement('div');
  document.body.append(host);
  const events: any[] = [];
  const g = createGrid<R>(host, { rows: Array.from({ length: count }, (_, i) => ({ id: `r${i}`, name: `n${i}`, n: i, t: i % 2 ? 'odd' : 'even' })), getRowId: (r) => r.id, columns: COLS, messages: EN, onEvent: (e) => events.push(e), ...over },
    { geometry, ...(env.raf ? { raf: env.raf } : { sync: true }), ...(env.maxPhysical ? { maxPhysical: env.maxPhysical } : {}) });
  grids.push(g);
  const vp = host.querySelector<HTMLElement>('.dzg-viewport')!;
  const s = (g as any).scroll as { logicalTop: number; mapper: any; scrollTo(l: number): void };
  const active = () => document.activeElement as HTMLElement;
  const where = () => `${active().closest('[role=row]')?.getAttribute('aria-rowindex')}/${active().dataset['col']}`;
  const press = (key: string, mods: KeyboardEventInit = {}) => active().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mods }));
  const head = (c: string) => host.querySelector<HTMLElement>(`.dzg-header .dzg-hcell[data-col="${c}"]`)!;
  const click = (el: Element, init: MouseEventInit = {}) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init }));
  const rowEl = (id: string) => host.querySelector<HTMLElement>(`.dzg-layer > .dzg-row[aria-rowindex="${g.kernel.rows.displayed.indexOf(dataKey(id)!) + 2}"]`)!;
  const pdown = (el: Element, x: number, o: PointerEventInit = {}) => el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: x, pointerId: 1, button: 0, ...o }));
  const pmove = (el: Element, x: number, o: PointerEventInit = {}) => el.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: x, pointerId: 1, ...o }));
  const pup = (el: Element, x: number, type = 'pointerup', o: PointerEventInit = {}) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, pointerId: 1, ...o }));
  const width = (id: string) => { const L = g.kernel.columns.layout; for (const sl of [L.start, L.center, L.end]) { const i = sl.columns.findIndex((c) => c.id === id); if (i !== -1) return sl.widths.sizeAt(i); } return -1; };
  return { g, host, vp, box, s, events, active, where, press, head, click, rowEl, pdown, pmove, pup, width };
}

describe('resize gaps', () => {
  it('G1 does not sort on the click that ends a drag, even when it lands on the header cell, and the next click sorts', () => {
    const k = make({}, 3);
    const grip = k.head('n').querySelector('.dzg-resize')!;
    k.pdown(grip, 300); k.pup(grip, 330);
    k.click(k.head('n'));
    expect(k.g.kernel.rows.query.sort).toEqual([]);
    k.click(k.head('n'));
    expect(k.g.kernel.rows.query.sort).toEqual([{ column: 'n', dir: 'asc' }]);
  });
  it('G2 puts the width back on pointercancel, finished, at the start width', () => {
    const k = make({}, 3);
    const grip = k.head('n').querySelector('.dzg-resize')!;
    k.pdown(grip, 300); k.pmove(grip, 360);
    expect(k.width('n')).toBe(160);
    k.pup(grip, 360, 'pointercancel');
    expect(k.width('n')).toBe(100);
    const last = k.events.filter((e) => e.type === 'columnResized').at(-1);
    expect(last).toMatchObject({ column: 'n', width: 100, finished: true });
  });
  it('G3 ignores a secondary button and another pointer', () => {
    const k = make({}, 3);
    const grip = k.head('n').querySelector('.dzg-resize')!;
    k.pdown(grip, 300, { button: 2 }); k.pmove(grip, 360); k.pup(grip, 360);
    expect(k.width('n')).toBe(100);
    k.pdown(grip, 300); k.pmove(grip, 360, { pointerId: 2 }); k.pup(grip, 360, 'pointerup', { pointerId: 2 });
    expect(k.width('n')).toBe(100);
    k.pup(grip, 300);
  });
  it('G4 emits nothing after the finished resize when a frame was still queued', () => {
    const frames: (() => void)[] = [];
    const raf = { requestAnimationFrame: (f: FrameRequestCallback) => { frames.push(() => f(0)); return frames.length; }, cancelAnimationFrame: () => {} };
    const k = make({}, 3, { raf });
    while (frames.length) frames.shift()!();
    const grip = k.head('n').querySelector('.dzg-resize')!;
    k.pdown(grip, 300); k.pmove(grip, 340); k.pup(grip, 350);
    while (frames.length) frames.shift()!();
    const rs = k.events.filter((e) => e.type === 'columnResized');
    expect(rs.at(-1)).toMatchObject({ width: 150, finished: true });
    expect(rs.filter((e) => e.finished).length).toBe(1);
  });
});

describe('keyboard gaps', () => {
  it('G5 Home/End stay in the header; Ctrl+Home/End and PageDown go into the body', () => {
    const k = make();
    k.head('n').focus(); k.press('Home'); expect(k.where()).toBe('1/name');
    k.press('End'); expect(k.where()).toBe('1/z');
    k.press('ArrowRight'); expect(k.where()).toBe('1/z');
    k.head('n').focus(); k.press('Home', { ctrlKey: true }); expect(k.where()).toBe('2/name');
    k.head('n').focus(); k.press('End', { ctrlKey: true }); expect(k.where()).toBe('1001/z');
    k.head('n').focus(); k.press('PageDown'); expect(k.where()).toBe('10/n');
  });
  it('G6 clamps at the edges: PageUp on the first row, ArrowRight on the last column, ArrowDown/PageDown on the last row', () => {
    const k = make();
    k.g.api.focusCell(dataKey('r0')!, 'n'); k.press('PageUp'); expect(k.where()).toBe('2/n');
    k.g.api.focusCell(dataKey('r0')!, 'z'); k.press('ArrowRight'); expect(k.where()).toBe('2/z');
    k.g.api.focusCell(dataKey('r999')!, 'n'); k.press('ArrowDown'); expect(k.where()).toBe('1001/n');
    k.press('PageDown'); expect(k.where()).toBe('1001/n');
  });
  it('G7 mirrors the edges in RTL', () => {
    const k = make({ direction: 'rtl' });
    k.g.api.focusCell(dataKey('r0')!, 'z'); k.press('ArrowLeft'); expect(k.where()).toBe('2/z');
    k.g.api.focusCell(dataKey('r0')!, 'name'); k.press('ArrowRight'); expect(k.where()).toBe('2/name');
    k.g.api.focusCell(dataKey('r5')!, 'n'); k.press('ArrowLeft', { ctrlKey: true }); expect(k.where()).toBe('7/z');
    k.press('ArrowRight', { ctrlKey: true }); expect(k.where()).toBe('7/name');
  });
});

describe('focus retention gaps', () => {
  it('G8 keeps the focused header element when its column scrolls out', () => {
    const k = make();
    k.head('n').focus(); const el = k.active();
    k.box.scrollInline = 1800; k.vp.dispatchEvent(new Event('scroll'));
    expect(k.active()).toBe(el);
    const idx = [...k.host.querySelectorAll('.dzg-header [role=columnheader]')].map((c) => Number(c.getAttribute('aria-colindex')));
    expect(idx).toContain(2);
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
  });
  it('G9 never moves the focused row in the DOM when a reorder puts it before rows that stay', () => {
    const k = make();
    k.g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'n', dir: 'asc' }] }, 'user');
    k.g.api.focusCell(dataKey('r10')!, 'name'); const el = k.active(); const row = el.closest('.dzg-row')!;
    const mo = new MutationObserver(() => {}); mo.observe(k.host.querySelector('.dzg-layer')!, { childList: true });
    k.g.kernel.rows.applyTransaction({ update: [{ id: 'r10', name: 'n10', n: -1, t: 'even' }] });
    const removed = mo.takeRecords().flatMap((m) => [...m.removedNodes]); mo.disconnect();
    expect(k.rowEl('r10')).toBe(row);
    expect(removed).not.toContain(row);
    expect(k.active()).toBe(el);
    const idx = [...k.host.querySelectorAll('.dzg-layer > .dzg-row')].map((r) => Number(r.getAttribute('aria-rowindex')));
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
  });
  it('G10 keeps the focused header through Enter-sort and a resize', () => {
    const k = make();
    k.head('n').focus(); const h = k.active();
    k.press('Enter');
    const grip = k.head('n').querySelector('.dzg-resize')!; k.pdown(grip, 300); k.pmove(grip, 340); k.pup(grip, 340);
    expect(k.active()).toBe(h);
    expect(k.g.kernel.focus).toEqual({ kind: 'header', column: 'n' });
  });
});

describe('selection gaps', () => {
  it('G11 single mode with boxes: a box replaces the selection, the selected row’s box clears it', () => {
    const k = make({ selection: { mode: 'single', checkbox: true } }, 6);
    k.click(k.rowEl('r1').querySelector('.dzg-check')!);
    k.click(k.rowEl('r3').querySelector('.dzg-check')!);
    expect([...k.g.kernel.selection.keys]).toEqual([dataKey('r3')]);
    k.click(k.rowEl('r3').querySelector('.dzg-check')!);
    expect(k.g.kernel.selection.keys.size).toBe(0);
  });
  it('G12 Ctrl+Shift+click adds the range to the selection', () => {
    const k = make({ selection: { mode: 'multi', click: true } }, 20);
    const c = (id: string) => k.rowEl(id).querySelector('[data-col="name"]')!;
    k.click(c('r2')); k.click(c('r6'), { ctrlKey: true }); k.click(c('r8'), { ctrlKey: true, shiftKey: true });
    expect([...k.g.kernel.selection.keys].map(String).sort()).toEqual(['r2', 'r6', 'r7', 'r8'].map((x) => String(dataKey(x))).sort());
  });
  it('G13 carries no aria-selected in mode none, and drops it when the mode goes to none', () => {
    const k = make({}, 5);
    expect(k.host.querySelectorAll('[aria-selected]').length).toBe(0);
    const m = make({ selection: { mode: 'multi', checkbox: true } }, 5);
    m.g.update({ selection: { mode: 'none' } });
    expect(m.host.querySelectorAll('[aria-selected]').length).toBe(0);
    expect(m.host.querySelectorAll('.dzg-check').length).toBe(0);
    expect(m.host.querySelector('.dzg-layer [data-col="name"]')!.getAttribute('aria-colindex')).toBe('1');
  });
  it('G14 counts the box column in every segment, header and body alike, and when switched on later', () => {
    const k = make({}, 3);
    k.g.update({ selection: { mode: 'multi', checkbox: true } });
    const hc = [...k.host.querySelectorAll('.dzg-header [role=columnheader]')].map((x) => x.getAttribute('aria-colindex'));
    const bc = [...k.host.querySelector('.dzg-layer .dzg-row')!.querySelectorAll('[role=gridcell],[role=rowheader]')].map((x) => x.getAttribute('aria-colindex'));
    expect(bc).toEqual(hc);
    expect(hc[0]).toBe('1'); expect(hc[1]).toBe('2'); expect(hc.at(-1)).toBe('25');
    expect(k.vp.getAttribute('aria-colcount')).toBe('25');
  });
});

describe('sort label gaps', () => {
  it('G15 announces descending; the precedence leaves the name when one key is left', async () => {
    const k = make({}, 10);
    k.click(k.head('n')); k.click(k.head('n'));
    await tick();
    expect(k.host.querySelector('.dzg-live')!.textContent).toBe('Sorted by Count, descending. 10 rows');
    k.click(k.head('name'), { shiftKey: true });
    expect(k.head('n').getAttribute('aria-label')).toBe('Count, Sort 1');
    k.click(k.head('name'), { shiftKey: true }); k.click(k.head('name'), { shiftKey: true });
    expect(k.g.kernel.rows.query.sort).toEqual([{ column: 'n', dir: 'desc' }]);
    expect(k.head('n').hasAttribute('aria-label')).toBe(false);
    expect(k.head('n').querySelector('.dzg-sort')!.textContent).toBe('');
    expect(k.head('name').querySelector('.dzg-sort')).toBeNull();
    expect(k.head('name').hasAttribute('aria-label')).toBe(false);
  });
});

describe('scroll gaps', () => {
  it('G16 scales a page-mode wheel by the view, and moves inline logically in both directions', () => {
    const k = make({}, 5000, { maxPhysical: 40_000 });
    k.vp.dispatchEvent(new WheelEvent('wheel', { deltaY: 1, deltaMode: 2, cancelable: true }));
    expect(k.s.logicalTop).toBe(320 - 32);
    k.box.scrollInline = 100;
    k.vp.dispatchEvent(new WheelEvent('wheel', { deltaX: 50, cancelable: true }));
    expect(k.box.scrollInline).toBe(150);
    const r = make({ direction: 'rtl' }, 5000, { maxPhysical: 40_000 });
    r.box.scrollInline = 100;
    r.vp.dispatchEvent(new WheelEvent('wheel', { deltaX: 50, cancelable: true }));
    expect(r.box.scrollInline).toBe(50);
  });
  it('G17 keeps the top row in place when rows are removed above it', () => {
    const k = make({ columns: [{ id: 'n', type: 'number' }] }, 2000);
    k.g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'n', dir: 'asc' }] }, 'user');
    k.s.scrollTo(500 * 32 + 10);
    k.g.kernel.rows.applyTransaction({ remove: Array.from({ length: 10 }, (_, i) => `r${i}`) });
    expect(k.s.logicalTop).toBe(490 * 32 + 10);
  });
  it('G18 clamps and rewrites the physical offset when a filter shrinks a scaled list while deep in it', () => {
    const k = make({}, 5000, { maxPhysical: 40_000 });
    k.s.scrollTo(150_000);
    k.g.kernel.dispatch({ type: 'query.set', query: { sort: [], filter: { t: { type: 'text', op: 'equals', value: 'odd' } }, quick: '', key: 'odd' } }, 'user');
    const m = k.s.mapper;
    expect(k.s.logicalTop).toBe(m.maxLogical);
    expect(k.box.scrollTop).toBeCloseTo(m.toPhysical(m.maxLogical), 3);
    const last = [...k.host.querySelectorAll('.dzg-layer > .dzg-row')].map((r) => Number(r.getAttribute('aria-rowindex'))).at(-1);
    expect(last).toBe(2500 + 1);
    // Our own write is not taken for a user scroll.
    k.vp.dispatchEvent(new Event('scroll'));
    expect(k.s.logicalTop).toBe(m.maxLogical);
  });
  it('G19 puts a focused cell back in view when the browser scrolls physically for focus above the cap (D4)', () => {
    const k = make({}, 5000, { maxPhysical: 40_000 });
    k.g.api.focusCell(dataKey('r3000')!, 'name');
    // The browser's own scrollIntoView for the focus: physical 3000*32, far off once scaled.
    k.box.scrollTop = 30_000; k.vp.dispatchEvent(new Event('scroll'));
    const off = 3000 * 32;
    expect(off).toBeGreaterThanOrEqual(k.s.logicalTop);
    expect(off + 32).toBeLessThanOrEqual(k.s.logicalTop + 320);
  });
});
