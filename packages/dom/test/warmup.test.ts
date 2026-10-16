import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { makeQuery, type ColumnDef } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import type { GridSettings } from '../src/settings.js';
import { EN } from '../src/locales/en.js';

type R = { id: string; a: string; n: number };
let grids: GridInstance<R>[] = [];
beforeEach(() => vi.useFakeTimers());
afterEach(() => { for (const g of grids) g.destroy(); grids = []; document.body.innerHTML = ''; vi.useRealTimers(); });

function make(settings: Partial<GridSettings<R>> = {}) {
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: 320, inline: 600, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
  const host = document.createElement('div');
  document.body.append(host);
  const columns: ColumnDef<R, any>[] = [{ id: 'a' }, { id: 'n', type: 'number' }];
  const g = createGrid<R>(host, { rows: Array.from({ length: 20000 }, (_, i) => ({ id: `r${i}`, a: `Hélène ${i}`, n: i })), getRowId: (r) => r.id, columns, messages: EN, ...settings }, { geometry, sync: true });
  grids.push(g);
  return { g, host, box };
}

describe('quick-search warm-up in idle time', () => {
  it('prepares the search after load, in slices, so the first keystroke builds nothing', () => {
    const { g } = make({ searchWarmup: 'idle' });
    vi.advanceTimersByTime(5000);
    const before = g.kernel.rows.diagnostics.foldBuilds;
    g.kernel.dispatch({ type: 'query.set', query: makeQuery({ quick: 'hel' }) }, 'user');
    expect(g.kernel.rows.diagnostics.foldBuilds).toBe(before);
    expect(g.kernel.rows.displayed.count).toBe(20000);
  });

  it('does nothing when off, which is the default', () => {
    const { g } = make();
    vi.advanceTimersByTime(5000);
    const before = g.kernel.rows.diagnostics.foldBuilds;
    g.kernel.dispatch({ type: 'query.set', query: makeQuery({ quick: 'hel' }) }, 'user');
    expect(g.kernel.rows.diagnostics.foldBuilds).toBe(before + 1);
  });

  it('prepares again after the rows change', () => {
    const { g } = make({ searchWarmup: 'idle' });
    vi.advanceTimersByTime(5000);
    g.update({ rows: Array.from({ length: 100 }, (_, i) => ({ id: `n${i}`, a: `Zoé ${i}`, n: i })) });
    vi.advanceTimersByTime(5000);
    const before = g.kernel.rows.diagnostics.foldBuilds;
    g.kernel.dispatch({ type: 'query.set', query: makeQuery({ quick: 'zoe' }) }, 'user');
    expect(g.kernel.rows.diagnostics.foldBuilds).toBe(before);
    expect(g.kernel.rows.displayed.count).toBe(100);
  });

  it('stops when the grid is destroyed', () => {
    const { g } = make({ searchWarmup: 'idle' });
    g.destroy();
    grids = [];
    expect(() => vi.advanceTimersByTime(5000)).not.toThrow();
  });
});
