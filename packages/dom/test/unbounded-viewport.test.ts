// A host without the layout (docs/behaviors/virtual-scroll.md « A host without the layout »): a viewport that grows with
// its rows is held to the window's height, draws only what that shows, and is told once.
import { describe, it, expect, afterEach } from 'vitest';
import type { ColumnDef, GridEvent } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry } from '../src/render/measure.js';
import { EN } from '../src/locales/en.js';

type R = { id: string; name: string };
let grids: GridInstance<R>[] = [];
afterEach(() => {
  for (const g of grids) g.destroy();
  grids = [];
  document.body.innerHTML = '';
});

const columns: ColumnDef<R, string>[] = [{ id: 'name' }];
const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `r${i}`, name: `n${i}` }));

/**
 * `grown`: the view is as tall as the body the grid wrote (the host without the layout), else `block` px; `room`: the
 * window's height. Each read follows the body's block size as the browser's layout would.
 */
function make(n: number, view: { grown: boolean; block?: number; room?: number }) {
  const host = document.createElement('div');
  document.body.append(host);
  const events: GridEvent<R>[] = [];
  let body: HTMLElement | null = null;
  const geometry: Geometry = {
    read: () => ({
      block: view.grown ? parseFloat(body?.style.blockSize || '0') || 0 : view.block!,
      inline: 600, scrollTop: 0, scrollInline: 0,
      ...(view.room !== undefined && { room: view.room }),
    }),
    writeScrollTop: () => {}, writeScrollInline: () => {},
  };
  const g = createGrid<R>(host, { rows: rows(n), getRowId: (r) => r.id, columns, messages: EN, onEvent: (e) => void events.push(e) }, { geometry, sync: true });
  grids.push(g);
  body = host.querySelector<HTMLElement>('.dzg-body');
  // The browser's resize observer: a second and a third paint, after the body grew.
  g.api.refresh();
  g.api.refresh();
  const told = () => events.flatMap((e) => (e.type === 'problems' ? e.problems : [])).filter((p) => p.code === 'unbounded-viewport');
  const drawn = () => host.querySelectorAll('.dzg-body .dzg-row').length;
  const vp = host.querySelector<HTMLElement>('.dzg-viewport')!;
  return { g, told, drawn, vp };
}

describe('unbounded viewport', () => {
  it('a view grown to 20 000 rows is held to the window: a few rows drawn, told once, path host, no detail', () => {
    const t = make(20_000, { grown: true, room: 800 });
    // 800 px at 32 px a row: 25 rows, plus the overscan; never thousands.
    expect(t.drawn()).toBeGreaterThan(20);
    expect(t.drawn()).toBeLessThan(40);
    expect(t.told()).toEqual([{ code: 'unbounded-viewport', severity: 'warning', path: 'host' }]);
    expect(t.vp.style.maxBlockSize).toBe('800px');
    t.g.api.refresh();
    t.g.api.refresh();
    expect(t.told()).toHaveLength(1);
    expect(t.drawn()).toBeLessThan(40);
  });

  it('a grown view of a million rows: still the window only', () => {
    const t = make(1_000_000, { grown: true, room: 600 });
    expect(t.drawn()).toBeLessThan(35);
    expect(t.told()).toHaveLength(1);
  });

  it('the documented layout: a bounded view taller than its rows is not touched', () => {
    const t = make(20_000, { grown: false, block: 400, room: 800 });
    expect(t.told()).toEqual([]);
    expect(t.vp.style.maxBlockSize).toBe('');
  });

  it('a grid sized taller than the window on purpose, its rows leaving room: not touched', () => {
    // 2 000 px of view, 40 rows (1 280 px), a window of 800.
    const t = make(40, { grown: false, block: 2000, room: 800 });
    expect(t.told()).toEqual([]);
    expect(t.vp.style.maxBlockSize).toBe('');
    expect(t.drawn()).toBe(40);
  });

  it('a bounded view taller than the window by less than a row, at its first paint: not touched (review L9)', () => {
    const t = make(40, { grown: false, block: 810, room: 800 });
    expect(t.told()).toEqual([]);
    expect(t.vp.style.maxBlockSize).toBe('');
  });

  it('a few rows that grow the view but stay under the window: nothing to tell', () => {
    const t = make(10, { grown: true, room: 800 });
    expect(t.told()).toEqual([]);
    expect(t.drawn()).toBe(10);
  });

  it('no window (no room read): nothing measured, nothing told', () => {
    const t = make(200, { grown: true });
    expect(t.told()).toEqual([]);
    expect(t.vp.style.maxBlockSize).toBe('');
  });
});
