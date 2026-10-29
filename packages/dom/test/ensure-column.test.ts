// Scrolling to a column without naming a row (docs/behaviors/column-layout.md, step 16d, forecast F:P2):
// `ensureColumnVisible(column)` (1.0.0's `ensureVisible(row, column)` keeps its type: check:api). Expectations by hand: 200 columns of 100 px in a 600 px view.
import { describe, it, expect, afterEach } from 'vitest';
import { dataKey, type ColumnDef } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import type { GridSettings } from '../src/settings.js';
import { spans } from '../src/spans.js';
import { EN } from '../src/locales/en.js';
import { AR } from '../src/locales/ar.js';

type R = Record<string, string>;
const COLS: ColumnDef<R, any>[] = Array.from({ length: 200 }, (_, i) => ({ id: `c${i}`, header: `C${i}`, width: 100, value: () => `v${i}` }));
const grids: GridInstance<R>[] = [];
afterEach(() => { for (const g of grids.splice(0)) g.destroy(); document.body.innerHTML = ''; });

function make(over: Partial<GridSettings<R>> = {}) {
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: 320, inline: 600, scrollTop: 64, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
  const host = document.createElement('div');
  document.body.append(host);
  const g = createGrid<R>(host, { rows: Array.from({ length: 100 }, (_, i) => ({ id: `r${i}` })), getRowId: (r) => r['id']!, columns: COLS, messages: EN, ...over }, { geometry, sync: true });
  grids.push(g);
  return { g, box };
}

describe('ensureColumnVisible(column)', () => {
  it('brings column 150 into view sideways; the block scroll and the focus unchanged', () => {
    const t = make();
    t.g.kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: dataKey('r2')!, column: 'c0' } }, 'api');
    const top = t.box.scrollTop;
    t.g.api.ensureColumnVisible!('c150');
    // Column 150 spans 15 000–15 100 px: the view's 600 px end at or after 15 100, start at or before 15 000.
    expect(t.box.scrollInline).toBeGreaterThanOrEqual(15100 - 600);
    expect(t.box.scrollInline).toBeLessThanOrEqual(15000);
    expect(t.box.scrollTop).toBe(top);
    expect(t.g.kernel.focus).toEqual({ kind: 'cell', row: dataKey('r2')!, column: 'c0' });
  });

  it('right to left, in Arabic: the same column into view from the other side', () => {
    const t = make({ messages: AR, locale: 'ar', direction: 'rtl' });
    t.g.api.ensureColumnVisible!('c150');
    // The logical offset is the same distance from the start (the inline-start edge is on the right).
    expect(Math.abs(t.box.scrollInline)).toBeGreaterThanOrEqual(15100 - 600);
    expect(Math.abs(t.box.scrollInline)).toBeLessThanOrEqual(15000);
  });

  it('with merged cells (spans) too: no row is looked for, nothing thrown', () => {
    const t = make({ features: [spans()] });
    expect(() => t.g.api.ensureColumnVisible!('c150')).not.toThrow();
    expect(t.box.scrollInline).toBeGreaterThanOrEqual(15100 - 600);
  });
});
