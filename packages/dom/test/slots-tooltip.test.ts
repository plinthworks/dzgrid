// Tooltip parts through `slots()` (docs/behaviors/tooltips.md, step 11 decision O5).
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { dataKey, type ColumnDef, type GridEvent } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import type { GridSettings } from '../src/settings.js';
import { definePart, type SlotContext } from '../src/part.js';
import { slots } from '../src/slots.js';
import { EN } from '../src/locales/en.js';

type R = { id: string; n: number };
type TC = SlotContext['tooltip'];
let grids: GridInstance<R>[] = [];
beforeEach(() => vi.useFakeTimers());
afterEach(() => { for (const g of grids) g.destroy(); grids = []; document.body.innerHTML = ''; vi.useRealTimers(); vi.restoreAllMocks(); });

function tipPart(tag = 't') {
  const calls = { mount: 0, update: 0, destroy: 0, all: [] as TC[], hostAtMount: null as HTMLElement | null };
  const part = definePart('tooltip', {
    mount(host, c) {
      calls.mount++;
      calls.all.push(c);
      calls.hostAtMount = host;
      const b = document.createElement('b');
      b.className = `rich-${tag}`;
      b.textContent = `${c.text} [${String(c.value)}]`;
      host.append(b);
      return { update() { calls.update++; }, destroy() { calls.destroy++; } };
    },
  });
  return { calls, part };
}

function make(settings: Partial<GridSettings<R>> = {}) {
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: 320, inline: 600, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
  const host = document.createElement('div');
  document.body.append(host);
  const events: GridEvent<R>[] = [];
  const columns: ColumnDef<R, any>[] = [
    { id: 'n', header: 'N', type: 'number', headerTooltip: 'How many', tooltip: (v: number | null) => (v === null ? null : `Value ${v}`) },
    { id: 'plain', header: 'P', value: () => 'x' },
    { id: 'm', header: 'M', type: 'number', value: (r: R) => r.n * 2, tooltip: (v: number | null) => (v ? `Double ${v}` : ''), ui: { tooltip: 'special' } },
  ];
  const g = createGrid<R>(host, { rows: Array.from({ length: 50 }, (_, i) => ({ id: `r${i}`, n: i })), getRowId: (r) => r.id, columns, messages: EN, features: [slots()], onEvent: (e) => events.push(e), ...settings }, { geometry, sync: true });
  grids.push(g);
  const tip = host.querySelector<HTMLElement>('.dzg-tooltip')!;
  const head = (c: string) => host.querySelector<HTMLElement>(`.dzg-hcell[data-col="${c}"]`)!;
  const cell = (row: number, c: string) => host.querySelector<HTMLElement>(`.dzg-row[aria-rowindex="${row + 2}"] [data-col="${c}"]`)!;
  const over = (el: HTMLElement) => el.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }));
  const key = (k: string) => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  return { g, host, tip, head, cell, over, key, events };
}

describe('tooltip parts', () => {
  it('draw a cell’s tooltip with the host’s text, the value, the row and the column', () => {
    const { calls, part } = tipPart();
    const t = make({ parts: { tooltip: part } });
    t.over(t.cell(3, 'n'));
    vi.advanceTimersByTime(600);
    expect(t.tip.hidden).toBe(false);
    expect(t.tip.querySelector('.rich-t')!.textContent).toBe('Value 3 [3]');
    expect(calls.hostAtMount).toBe(t.tip);
    const c = calls.all[0]!;
    expect(c.text).toBe('Value 3');
    expect(c.value).toBe(3);
    expect(c.row).toEqual({ id: 'r3', n: 3 });
    expect(c.column.id).toBe('n');
    expect(c.dir).toBe('ltr');
    expect(t.cell(3, 'n').getAttribute('aria-describedby')).toBe(t.tip.id);
    expect(t.tip.getAttribute('role')).toBe('tooltip');
  });

  it('for a header: null row and value', () => {
    const { calls, part } = tipPart();
    const t = make({ parts: { tooltip: part } });
    t.over(t.head('n'));
    vi.advanceTimersByTime(600);
    const c = calls.all[0]!;
    expect(c.text).toBe('How many');
    expect(c.row).toBeNull();
    expect(c.value).toBeNull();
    expect(c.column.id).toBe('n');
  });

  it('show only where the host gave text', () => {
    const { calls, part } = tipPart();
    const t = make({ parts: { tooltip: part } });
    t.over(t.head('plain'));
    t.over(t.cell(1, 'plain'));
    // A tooltip function giving '' (row 0 of m: 0 → '') shows nothing either.
    t.over(t.cell(0, 'm'));
    vi.advanceTimersByTime(1000);
    expect(t.tip.hidden).toBe(true);
    expect(calls.mount).toBe(0);
  });

  it('are destroyed at hide, holding nothing; Escape hides without moving the focus', () => {
    const { calls, part } = tipPart();
    const t = make({ parts: { tooltip: part } });
    t.g.api.focusCell(dataKey('r2')!, 'n');
    t.key('ArrowDown');
    expect(t.tip.hidden).toBe(false);
    expect(calls.mount).toBe(1);
    expect(calls.all[0]!.row).toEqual({ id: 'r3', n: 3 });
    const focused = document.activeElement;
    t.key('Escape');
    expect(t.tip.hidden).toBe(true);
    expect(calls.destroy).toBe(1);
    expect(t.tip.childNodes).toHaveLength(0);
    expect(document.activeElement).toBe(focused);
    expect(t.cell(3, 'n').hasAttribute('aria-describedby')).toBe(false);
  });

  it('another anchor: destroyed, then mounted afresh with its context', () => {
    const { calls, part } = tipPart();
    const t = make({ parts: { tooltip: part }, tooltips: { delayMs: 0 } });
    t.over(t.cell(3, 'n'));
    t.over(t.cell(4, 'n'));
    expect(calls.mount).toBe(2);
    expect(calls.destroy).toBe(1);
    expect(calls.update).toBe(0);
    expect(t.tip.querySelectorAll('b')).toHaveLength(1);
    expect(t.tip.textContent).toBe('Value 4 [4]');
    expect(t.cell(3, 'n').hasAttribute('aria-describedby')).toBe(false);
    expect(t.cell(4, 'n').getAttribute('aria-describedby')).toBe(t.tip.id);
  });

  it('are found by ui.tooltip, then tooltip.<type>, then tooltip; none: the grid’s text', () => {
    const special = tipPart('special');
    const typed = tipPart('typed');
    const t = make({ parts: { special: special.part, 'tooltip.number': typed.part }, tooltips: { delayMs: 0 } });
    t.over(t.cell(2, 'm'));
    expect(t.tip.querySelector('.rich-special')!.textContent).toBe('Double 4 [4]');
    t.over(t.cell(2, 'n'));
    expect(t.tip.querySelector('.rich-typed')).not.toBeNull();
    // No part for the header of a text column: the host's text, as plain text.
    const u = make({ parts: { 'tooltip.number': typed.part }, tooltips: { delayMs: 0 }, columns: [{ id: 'txt', header: 'T', headerTooltip: 'About T' }] as never });
    u.over(u.head('txt'));
    expect(u.tip.textContent).toBe('About T');
    expect(u.tip.querySelector('b')).toBeNull();
  });

  it('a part that throws: the host’s text shown instead, the error reported', () => {
    const reported: unknown[] = [];
    const had = (window as unknown as { reportError?: unknown }).reportError;
    (window as unknown as { reportError: unknown }).reportError = (e: unknown) => { reported.push(e); };
    try {
      const part = definePart('tooltip', { mount: () => { throw new Error('tip broke'); } });
      const t = make({ parts: { tooltip: part }, tooltips: { delayMs: 0 } });
      t.over(t.cell(3, 'n'));
      expect(t.tip.hidden).toBe(false);
      expect(t.tip.textContent).toBe('Value 3');
      expect((reported[0] as Error).message).toBe('tip broke');
    } finally {
      (window as unknown as { reportError?: unknown }).reportError = had;
    }
  });

  it('are placed after they drew: the size measured is the part’s, at the start edge in RTL', () => {
    const { part } = tipPart();
    const t = make({ parts: { tooltip: part }, tooltips: { delayMs: 0 }, direction: 'rtl' });
    const anchor = t.cell(3, 'n');
    anchor.getBoundingClientRect = () => ({ left: 700, right: 800, top: 100, bottom: 130, width: 100, height: 30, x: 700, y: 100, toJSON() {} }) as DOMRect;
    // The tooltip measures wide once the part has drawn its content, empty otherwise.
    t.tip.getBoundingClientRect = () => {
      const w = t.tip.querySelector('.rich-t') ? 300 : 0;
      return { left: 0, right: w, top: 0, bottom: 20, width: w, height: 20, x: 0, y: 0, toJSON() {} } as DOMRect;
    };
    t.over(anchor);
    // RTL: the start is the right; from the window's right edge (1024 - 800 = 224), within the window.
    expect(window.innerWidth).toBe(1024);
    expect(t.tip.style.getPropertyValue('inset-inline-start')).toBe('224px');
    expect(t.tip.style.getPropertyValue('inset-block-start')).toBe('134px');
    // Near the window's start edge: clamped by the part's width (300), not by an empty box.
    anchor.getBoundingClientRect = () => ({ left: 0, right: 100, top: 100, bottom: 130, width: 100, height: 30, x: 0, y: 100, toJSON() {} }) as DOMRect;
    t.g.update({ direction: 'ltr' });
    t.over(t.cell(4, 'n'));
    const a4 = t.cell(4, 'n');
    a4.getBoundingClientRect = () => ({ left: 900, right: 1000, top: 100, bottom: 130, width: 100, height: 30, x: 900, y: 100, toJSON() {} }) as DOMRect;
    t.over(t.cell(5, 'n'));
    t.over(a4);
    expect(t.tip.style.getPropertyValue('inset-inline-start')).toBe(`${1024 - 300}px`);
    expect(t.tip.dir === '' || t.tip.dir === 'ltr').toBe(true);
  });

  it('are destroyed with the grid', () => {
    const { calls, part } = tipPart();
    const t = make({ parts: { tooltip: part }, tooltips: { delayMs: 0 } });
    t.over(t.cell(3, 'n'));
    t.g.destroy();
    grids = [];
    expect(calls.destroy).toBe(calls.mount);
  });
});
