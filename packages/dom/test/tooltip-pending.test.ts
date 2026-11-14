// A tooltip waiting for its delay never appears late, and a page's bubbles follow the colour scheme of their anchor's
// context (docs/behaviors/tooltips-popovers.md 18–19; owner 2026-11-14, « oui », in 1.12.0). Expectations written by
// hand; the colours themselves in real browsers: scripts/browser-1-12.mjs.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import type { ColumnDef } from '@dzgrid/core';
import { tooltip, type TooltipHandle } from '../src/tooltip.js';
import { popover, type PopoverHandle } from '../src/popover.js';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import { EN } from '../src/locales/en.js';

let tips: TooltipHandle[] = [];
let pops: PopoverHandle[] = [];
let grids: GridInstance<R>[] = [];
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  for (const h of tips) h.destroy();
  for (const h of pops) h.destroy();
  for (const g of grids) g.destroy();
  tips = [];
  pops = [];
  grids = [];
  document.body.innerHTML = '';
  vi.useRealTimers();
});

function button(label = 'Edit', parent: HTMLElement = document.body) {
  const b = parent.appendChild(document.createElement('button'));
  b.textContent = label;
  return b;
}
const bubble = () => document.querySelector<HTMLElement>('.dzg-tooltip.dzg-float');
const shown = () => !(bubble()?.hidden ?? true);
const enter = (el: Element) => el.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
const tip = (el: HTMLElement, content = 'Edits the row') => {
  const h = tooltip(el, { content, delayMs: 500 });
  tips.push(h);
  return h;
};

describe('a page tooltip waiting for its delay (sheet 18)', () => {
  it('a press on its anchor drops it', () => {
    const b = button();
    tip(b);
    enter(b);
    vi.advanceTimersByTime(200);
    b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    vi.advanceTimersByTime(1000);
    expect(shown()).toBe(false);
  });

  it('a click on its anchor (Enter or Space too) drops it, and hides it once shown', () => {
    const b = button();
    tip(b);
    enter(b);
    vi.advanceTimersByTime(200);
    b.click();
    vi.advanceTimersByTime(1000);
    expect(shown()).toBe(false);
    enter(b);
    vi.advanceTimersByTime(500);
    expect(shown()).toBe(true);
    b.click();
    expect(shown()).toBe(false);
  });

  it('Escape drops it', () => {
    const b = button();
    tip(b);
    enter(b);
    vi.advanceTimersByTime(200);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    vi.advanceTimersByTime(1000);
    expect(shown()).toBe(false);
  });

  it('the focus leaving its anchor drops it', () => {
    const b = button();
    tip(b);
    // A focus after a press: nothing shown at once (sheet 2), the hover's show waiting.
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    b.focus();
    enter(b);
    expect(shown()).toBe(false);
    vi.advanceTimersByTime(200);
    b.blur();
    vi.advanceTimersByTime(1000);
    expect(shown()).toBe(false);
  });

  it('disabled: true by update() drops it; destroy() drops it', () => {
    const a = button('A');
    const h = tip(a);
    enter(a);
    vi.advanceTimersByTime(200);
    h.update({ disabled: true });
    vi.advanceTimersByTime(1000);
    expect(shown()).toBe(false);
    const b = button('B');
    const k = tip(b);
    enter(b);
    vi.advanceTimersByTime(200);
    k.destroy();
    vi.advanceTimersByTime(1000);
    expect(shown()).toBe(false);
  });

  it('its anchor disabled (the attribute) when the delay ends: nothing shown; enabled again, it shows', () => {
    const b = button();
    tip(b);
    enter(b);
    vi.advanceTimersByTime(200);
    b.disabled = true;
    vi.advanceTimersByTime(1000);
    expect(shown()).toBe(false);
    b.disabled = false;
    enter(b);
    vi.advanceTimersByTime(500);
    expect(shown()).toBe(true);
  });

  it('its anchor taken out of the page: nothing shown', () => {
    const b = button();
    tip(b);
    enter(b);
    vi.advanceTimersByTime(200);
    b.remove();
    vi.advanceTimersByTime(1000);
    expect(shown()).toBe(false);
  });

  it('a popover opened by code from the same trigger drops it; it never appears over the open popover', () => {
    const b = button();
    tip(b);
    const p = popover(b, { content: 'Form' });
    pops.push(p);
    enter(b);
    vi.advanceTimersByTime(200);
    p.open();
    vi.advanceTimersByTime(1000);
    expect(shown()).toBe(false);
    expect(p.isOpen).toBe(true);
  });

  it('a popover opening from its anchor hides it once shown (keyboard focus, then Enter)', () => {
    const b = button();
    tip(b);
    const p = popover(b, { content: 'Words only' });
    pops.push(p);
    b.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    b.focus();
    expect(shown()).toBe(true);
    // Opened by code (a key the app handles): no click on the anchor.
    p.open();
    expect(shown()).toBe(false);
  });

  it('a popover opening from inside its anchor (a wrapper with a tooltip) drops its show too', () => {
    const wrap = document.body.appendChild(document.createElement('div'));
    const b = button('Inside', wrap);
    tip(wrap, 'The card');
    const p = popover(b, { content: 'Form' });
    pops.push(p);
    enter(wrap);
    vi.advanceTimersByTime(200);
    p.open();
    vi.advanceTimersByTime(1000);
    expect(shown()).toBe(false);
  });

  it('another anchor waiting is not dropped by a press on this one', () => {
    const a = button('A');
    const b = button('B');
    tip(a);
    const hb = tip(b, 'B words');
    enter(b);
    vi.advanceTimersByTime(200);
    a.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    vi.advanceTimersByTime(400);
    expect(hb.shown).toBe(true);
    expect(bubble()!.textContent).toBe('B words');
  });
});

type R = { id: string; n: number };
const COLS: ColumnDef<R, any>[] = [{ id: 'n', header: 'N', type: 'number', headerTooltip: 'How many', tooltip: (v: number | null) => `Value ${v}` }];
function grid() {
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: 320, inline: 600, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
  const host = document.body.appendChild(document.createElement('div'));
  const g = createGrid<R>(host, {
    rows: Array.from({ length: 5 }, (_, i) => ({ id: `r${i}`, n: i })), getRowId: (r) => r.id, columns: COLS,
    messages: { locale: 'en', text: EN.text },
  }, { geometry, sync: true });
  grids.push(g);
  const t = host.querySelector<HTMLElement>('.dzg-tooltip')!;
  const cell = (row: number) => host.querySelector<HTMLElement>(`.dzg-row[aria-rowindex="${row + 2}"] [data-col="n"]`)!;
  const over = (el: Element) => el.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }));
  return { host, t, cell, over };
}

describe('the grid\'s cell and header tooltips waiting for their delay (sheet 18)', () => {
  it('a press on the cell drops it', () => {
    const { t, cell, over } = grid();
    over(cell(0));
    vi.advanceTimersByTime(200);
    cell(0).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    vi.advanceTimersByTime(1000);
    expect(t.hidden).toBe(true);
  });

  it('Escape drops it (nothing shown yet), on a header too', () => {
    const { host, t, over } = grid();
    const head = host.querySelector<HTMLElement>('.dzg-hcell[data-col="n"]')!;
    over(head);
    vi.advanceTimersByTime(200);
    head.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    vi.advanceTimersByTime(1000);
    expect(t.hidden).toBe(true);
  });

  it('the focus leaving drops it', () => {
    const { t, cell, over } = grid();
    cell(1).focus();
    over(cell(0));
    vi.advanceTimersByTime(200);
    cell(1).blur();
    vi.advanceTimersByTime(1000);
    expect(t.hidden).toBe(true);
  });

  it('a popover opening from a cell\'s button drops the cell\'s show, and hides it once shown', () => {
    const { t, cell, over } = grid();
    const b = button('More', cell(0));
    const p = popover(b, { content: 'About the row' });
    pops.push(p);
    over(b);
    vi.advanceTimersByTime(200);
    p.open();
    vi.advanceTimersByTime(1000);
    expect(t.hidden).toBe(true);
    p.close();
    over(cell(2));
    over(b);
    vi.advanceTimersByTime(600);
    expect(t.hidden).toBe(false);
    p.open();
    expect(t.hidden).toBe(true);
  });

  it('a cell holding an open popover\'s trigger shows no tooltip when its delay ends', () => {
    const { t, cell, over } = grid();
    const b = button('More', cell(0));
    const p = popover(b, { content: 'About the row', openOn: 'manual' });
    pops.push(p);
    p.open();
    over(b);
    vi.advanceTimersByTime(1000);
    expect(t.hidden).toBe(true);
  });
});

describe('the colour scheme of the anchor\'s context (sheet 19)', () => {
  it('the injected layout gives the page\'s bubbles the grid\'s color-scheme rule', () => {
    const b = button();
    tip(b).show();
    const css = document.querySelector('style[data-dzgrid-float]')!.textContent!;
    expect(css).toMatch(/:where\(\.dzg-float\)\{[^}]*color-scheme:var\(--tz-color-scheme,light dark\)/);
  });

  it('an anchor in a wrapper with its own --tz-color-scheme: the tooltip and the popover take it; in the page\'s, they inherit', () => {
    const wrap = document.body.appendChild(document.createElement('div'));
    wrap.style.setProperty('--tz-color-scheme', 'dark');
    const inside = button('In', wrap);
    const outside = button('Out');
    const hi = tip(inside, 'In');
    const ho = tip(outside, 'Out');
    hi.show();
    expect(bubble()!.style.getPropertyValue('--tz-color-scheme')).toBe('dark');
    ho.show();
    expect(bubble()!.style.getPropertyValue('--tz-color-scheme')).toBe('');
    const p = popover(inside, { content: 'Form', openOn: 'manual' });
    pops.push(p);
    p.open();
    expect(p.el!.style.getPropertyValue('--tz-color-scheme')).toBe('dark');
  });
});
