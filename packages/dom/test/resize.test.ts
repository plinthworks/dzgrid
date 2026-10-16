import { describe, it, expect, afterEach } from 'vitest';
import type { ColumnDef, GridEvent } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import type { GridSettings } from '../src/settings.js';
import { EN } from '../src/locales/en.js';

type R = { id: string; a: string };
let grids: GridInstance<R>[] = [];
afterEach(() => { for (const g of grids) g.destroy(); grids = []; document.body.innerHTML = ''; });

function make(over: Partial<GridSettings<R>> = {}) {
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: 320, inline: 900, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
  const host = document.createElement('div');
  document.body.append(host);
  const events: GridEvent<R>[] = [];
  const columns: ColumnDef<R, any>[] = [
    { id: 'a', width: 100 },
    { id: 'b', width: 100, maxWidth: 140, value: () => 1 },
    { id: 'fixed', width: 100, resizable: false, value: () => 1 },
    { id: 'z', width: 80, pinned: 'end', value: () => 1 },
  ];
  const g = createGrid<R>(host, { rows: [{ id: 'r', a: 'x' }], getRowId: (r) => r.id, columns, messages: EN, onEvent: (e) => events.push(e), ...over }, { geometry, sync: true });
  grids.push(g);
  const handle = (col: string) => host.querySelector<HTMLElement>(`.dzg-hcell[data-col="${col}"] .dzg-resize`);
  // The width drawn: the last resize event's, the layout's.
  const width = (col: string) => {
    const L = g.kernel.columns.layout;
    for (const slice of [L.start, L.center, L.end]) {
      const i = slice.columns.findIndex((c) => c.id === col);
      if (i !== -1) return slice.widths.sizeAt(i);
    }
    return undefined;
  };
  const drag = (el: HTMLElement, from: number, to: number) => {
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: from, pointerId: 1, button: 0 }));
    el.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: (from + to) / 2, pointerId: 1 }));
    el.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: to, pointerId: 1 }));
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: to, pointerId: 1 }));
  };
  return { g, host, events, handle, width, drag };
}

describe('column resize', () => {
  it('widens by the logical distance in LTR', () => {
    const { handle, width, drag, events } = make();
    drag(handle('a')!, 500, 560);
    expect(width('a')).toBe(160);
    const done = events.filter((e) => e.type === 'columnResized' && e.finished);
    expect(done.length).toBe(1);
    expect(events.filter((e) => e.type === 'columnResized').every((e) => e.source === 'user')).toBe(true);
  });

  it('widens by the logical distance in RTL: the pointer moves toward the left', () => {
    const { handle, width, drag } = make({ direction: 'rtl' });
    drag(handle('a')!, 500, 440);
    expect(width('a')).toBe(160);
  });

  it('stops at the maximum width, and never goes under the minimum', () => {
    const { handle, width, drag } = make();
    drag(handle('b')!, 500, 600);
    expect(width('b')).toBe(140);
    drag(handle('a')!, 500, 0);
    expect(width('a')).toBeGreaterThanOrEqual(40);
  });

  it('puts no handle on a column that cannot be resized, and hides handles from assistive technologies', () => {
    const { handle } = make();
    expect(handle('fixed')).toBeNull();
    expect(handle('a')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('reverses the drag for the last column pinned to the end (its handle is on its start edge)', () => {
    const { handle, width, drag } = make();
    expect(handle('z')!.classList.contains('dzg-resize-start')).toBe(true);
    drag(handle('z')!, 500, 440);
    expect(width('z')).toBe(140);
  });

  it('does not sort when a resize ends on the header', () => {
    const { g, handle, drag, host } = make();
    drag(handle('a')!, 500, 520);
    handle('a')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(g.kernel.rows.query.sort).toEqual([]);
    expect(host.querySelector('.dzg-hcell[data-col="a"]')!.hasAttribute('aria-sort')).toBe(false);
  });
});
