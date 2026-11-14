// A cell's or a header's tooltip waiting for its delay never appears late (docs/behaviors/tooltips.md 12; owner
// 2026-11-14, « oui », in 1.12.0). Expectations written by hand. A popover over a cell is DzTooltip's (its bridge's tests).
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import type { ColumnDef } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import { EN } from '../src/locales/en.js';

let grids: GridInstance<R>[] = [];
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  for (const g of grids) g.destroy();
  grids = [];
  document.body.innerHTML = '';
  vi.useRealTimers();
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

describe('the grid\'s cell and header tooltips waiting for their delay (sheet 12)', () => {
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
});
