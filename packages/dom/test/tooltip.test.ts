import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { dataKey, type ColumnDef } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import type { GridSettings } from '../src/settings.js';
import { EN } from '../src/locales/en.js';

type R = { id: string; n: number };
let grids: GridInstance<R>[] = [];
beforeEach(() => vi.useFakeTimers());
afterEach(() => { for (const g of grids) g.destroy(); grids = []; document.body.innerHTML = ''; vi.useRealTimers(); });

function make(settings: Partial<GridSettings<R>> = {}) {
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: 320, inline: 600, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
  const host = document.createElement('div');
  document.body.append(host);
  const columns: ColumnDef<R, any>[] = [
    { id: 'n', header: 'N', type: 'number', headerTooltip: 'How many', tooltip: (v: number | null) => (v === null ? null : `Value ${v}`) },
    { id: 'plain', header: 'P', value: () => 'x' },
  ];
  const g = createGrid<R>(host, { rows: Array.from({ length: 50 }, (_, i) => ({ id: `r${i}`, n: i })), getRowId: (r) => r.id, columns, messages: EN, ...settings }, { geometry, sync: true });
  grids.push(g);
  const tip = host.querySelector<HTMLElement>('.dzg-tooltip')!;
  const head = (c: string) => host.querySelector<HTMLElement>(`.dzg-hcell[data-col="${c}"]`)!;
  const cell = (row: number, c: string) => host.querySelector<HTMLElement>(`.dzg-row[aria-rowindex="${row + 2}"] [data-col="${c}"]`)!;
  const over = (el: HTMLElement) => el.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }));
  const out = (el: HTMLElement, to: Element | null) => el.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, relatedTarget: to }));
  return { g, host, tip, head, cell, over, out };
}

describe('tooltips', () => {
  it('appear after the delay on hover, with the host’s text, described by the cell', () => {
    const { tip, head, over } = make();
    over(head('n'));
    vi.advanceTimersByTime(400);
    expect(tip.hidden).toBe(true);
    vi.advanceTimersByTime(150);
    expect(tip.hidden).toBe(false);
    expect(tip.textContent).toBe('How many');
    expect(head('n').getAttribute('aria-describedby')).toBe(tip.id);
    expect(tip.getAttribute('role')).toBe('tooltip');
  });

  it('take the delay from the settings', () => {
    const { tip, cell, over } = make({ tooltips: { delayMs: 100 } });
    over(cell(3, 'n'));
    vi.advanceTimersByTime(120);
    expect(tip.textContent).toBe('Value 3');
  });

  it('appear at once on keyboard focus, and Escape hides them without moving focus', () => {
    const { g, tip, cell } = make();
    g.api.focusCell(dataKey('r2')!, 'n');
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    expect(tip.hidden).toBe(false);
    expect(tip.textContent).toBe('Value 3');
    const focused = document.activeElement;
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(tip.hidden).toBe(true);
    expect(document.activeElement).toBe(focused);
    expect(cell(3, 'n').hasAttribute('aria-describedby')).toBe(false);
  });

  it('stay while the pointer moves onto them, and go when it leaves', () => {
    const { tip, head, over, out } = make();
    over(head('n'));
    vi.advanceTimersByTime(600);
    out(head('n'), tip);
    vi.advanceTimersByTime(300);
    expect(tip.hidden).toBe(false);
    tip.dispatchEvent(new PointerEvent('pointerleave', { relatedTarget: document.body }));
    vi.advanceTimersByTime(300);
    expect(tip.hidden).toBe(true);
    expect(head('n').hasAttribute('aria-describedby')).toBe(false);
  });

  it('show nothing where the host gave no text', () => {
    const { tip, head, cell, over } = make();
    over(head('plain'));
    over(cell(1, 'plain'));
    vi.advanceTimersByTime(1000);
    expect(tip.hidden).toBe(true);
  });

  it('go away when the grid scrolls', () => {
    const { tip, head, over, host } = make();
    over(head('n'));
    vi.advanceTimersByTime(600);
    host.querySelector('.dzg-viewport')!.dispatchEvent(new Event('scroll'));
    expect(tip.hidden).toBe(true);
  });
});

describe('overlays, announced', () => {
  it('announce loading and the error once, from the messages', () => {
    const { g, host } = make();
    const live = () => host.querySelector('.dzg-live')!.textContent;
    g.update({ overlay: 'loading' });
    vi.advanceTimersByTime(100);
    expect(live()).toBe(EN.text['announce.loading']);
    g.update({ overlay: 'error' });
    vi.advanceTimersByTime(100);
    expect(live()).toBe(EN.text['announce.error']);
  });
});
