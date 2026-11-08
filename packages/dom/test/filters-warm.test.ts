// Phase 11 L3 (filter-ui.md « Preparing the text filter »; docs/phase-11-steps/decisions.md « L3 »): at 4× CPU the first
// keystroke in a floating text box folded every cell of its column in its frame (126 ms over dataset A). The floating row
// asks for the quick search's idle preparation the first time a box takes focus, so that keystroke reads it ready.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import type { ColumnDef } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import type { GridSettings } from '../src/settings.js';
import { filters } from '../src/filters.js';
import { EN } from '../src/locales/en.js';
import { EN_FILTERS } from '../src/locales/en-filters.js';

type R = { id: string; a: string; n: number };
let grids: GridInstance<R>[] = [];
beforeEach(() => vi.useFakeTimers());
afterEach(() => { for (const g of grids) g.destroy(); grids = []; document.body.innerHTML = ''; vi.useRealTimers(); });

function make(o: { floating?: boolean; settings?: Partial<GridSettings<R>> } = {}) {
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: 320, inline: 600, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
  const host = document.createElement('div');
  document.body.append(host);
  const columns: ColumnDef<R>[] = [{ id: 'a' }, { id: 'n', type: 'number' }];
  const f = filters({ floating: o.floating ?? true });
  const g = createGrid<R>(host, { rows: Array.from({ length: 20000 }, (_, i) => ({ id: `r${i}`, a: `Hélène ${i}`, n: i })), getRowId: (r) => r.id, columns, messages: { ...EN, text: { ...EN.text, ...EN_FILTERS.text } }, features: [f], ...o.settings }, { geometry, sync: true });
  grids.push(g);
  const box0 = () => host.querySelector<HTMLInputElement>('.dzg-hextra[data-col="a"] input')!;
  const folds = () => g.kernel.rows.diagnostics.foldBuilds;
  const type = (v: string) => g.kernel.dispatch({ type: 'filter.column', column: 'a', filter: { type: 'text', op: 'contains', value: v } }, 'user');
  return { g, f, box0, folds, type };
}

describe('the floating row prepares the text filter in idle time', () => {
  it('a box taking focus: the column folded in idle slices, the first keystroke folds nothing', () => {
    const t = make();
    vi.advanceTimersByTime(5000);
    t.box0().focus();
    vi.advanceTimersByTime(5000);
    const before = t.folds();
    t.type('hél');
    expect(t.folds()).toBe(before);
    expect(t.g.kernel.rows.displayed.count).toBe(20000);
  });

  it('never at load, nor without a focus in the row: the first keystroke folds the column', () => {
    const t = make();
    vi.advanceTimersByTime(5000);
    const before = t.folds();
    t.type('hél');
    expect(t.folds()).toBe(before + 1);
  });

  it('a focus on a header cell (not in the floating row) asks nothing', () => {
    const t = make();
    document.querySelector<HTMLElement>('.dzg-hcell[data-col="a"]')!.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    vi.advanceTimersByTime(5000);
    const before = t.folds();
    t.type('hél');
    expect(t.folds()).toBe(before + 1);
  });

  it('the grid destroyed while it prepares: it stops', () => {
    const t = make();
    t.box0().focus();
    t.g.destroy();
    grids = [];
    expect(() => vi.advanceTimersByTime(5000)).not.toThrow();
  });
});
