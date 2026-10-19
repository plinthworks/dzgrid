import { describe, it, expect, afterEach } from 'vitest';
import { dataKey, type ColumnOrGroup, type RowKey } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import type { GridContext } from '../src/context.js';
import { spans } from '../src/spans.js';
import { EN } from '../src/locales/en.js';

/**
 * Found by the property review of step 9b, commit 3 (spans-property.test.ts).
 * These fail on 4742d93: each names what is expected instead.
 */
type R = { id: string; ward: string; name: string; n: number };
const H = 32;
let grids: GridInstance<R>[] = [];
afterEach(() => { for (const g of grids) g.destroy(); grids = []; document.body.innerHTML = ''; });
const k = (s: string): RowKey => dataKey(s)!;

function make(rows: R[], columns: ColumnOrGroup<R>[], block = 160) {
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block, inline: 600, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
  const host = document.createElement('div');
  document.body.append(host);
  const g = createGrid<R>(host, { rows, getRowId: (r) => r.id, columns, messages: EN, features: [spans()], overscan: { rows: 0 } }, { geometry, sync: true });
  grids.push(g);
  const vp = host.querySelector<HTMLElement>('.dzg-viewport')!;
  const ctx = (g as unknown as { context: GridContext<R> }).context;
  const scrollTo = (top: number) => { box.scrollTop = top; vp.dispatchEvent(new Event('scroll')); };
  return { g, ctx, scrollTo };
}
// Rows 0-3 share ward A; the rest are each their own.
const rows: R[] = Array.from({ length: 200 }, (_, i) => ({ id: `r${i}`, ward: i < 4 ? 'A' : `x${i}`, name: `p${i}`, n: i }));

describe('pooled rows and spare cells', () => {
  it('a pinned cell placed in a spanning row keeps no inset-inline-start once reused in a plain row', () => {
    // The body places the pinned cells of a spanning row (absolute); the row renderer's
    // cache (inlineStart: NaN for a pinned cell) never sees that write, so a row reused
    // for a plain one keeps the stale place on a cell back in the flow. Harmless under the
    // base CSS (static), wrong as soon as a host or theme positions cells (relative).
    const { ctx, scrollTo } = make(rows, [{ id: 'ward', merge: true, pinned: 'start', width: 120 }, { id: 'name', pinned: 'start', width: 80 }, { id: 'n' }]);
    expect(ctx.rowRenderer.cell(k('r1'), 'name')!.style.getPropertyValue('inset-inline-start')).toBe('120px');
    scrollTo(100 * H);
    const stale = [...ctx.el.layer.querySelectorAll<HTMLElement>('.dzg-row:not([data-spans]) .dzg-seg-start > .dzg-cell')]
      .filter((c) => c.style.getPropertyValue('inset-inline-start') !== '')
      .map((c) => `${c.closest('.dzg-row')!.getAttribute('aria-rowindex')}:${c.getAttribute('data-col')}=${c.style.getPropertyValue('inset-inline-start')}`);
    expect(stale).toEqual([]);
  });
});

describe('pooled rows reused for full-width rows', () => {
  it('a full-width row keeps no inset-inline-start of the spanning row its element was', () => {
    // The full-width rule places its cell with !important; an inline place left behind is
    // still state that is not the row's (a theme, a host's rule, the next reuse read it).
    const wide = (r: R) => r.n >= 50;
    const host = document.createElement('div');
    document.body.append(host);
    const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: 160, inline: 600, scrollTop: 0, scrollInline: 0 };
    const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
    const g = createGrid<R>(host, {
      rows, getRowId: (r) => r.id, messages: EN, features: [spans()], overscan: { rows: 0 }, fullWidth: wide,
      columns: [{ id: 'ward', merge: true, pinned: 'start', width: 120 }, { id: 'name', pinned: 'start', width: 80 }, { id: 'n' }],
    }, { geometry, sync: true });
    grids.push(g);
    const ctx = (g as unknown as { context: GridContext<R> }).context;
    const placed = () => [...ctx.el.layer.querySelectorAll<HTMLElement>('.dzg-cell')].filter((c) => c.style.getPropertyValue('inset-inline-start') !== '');
    expect(placed().length).toBeGreaterThan(0);
    box.scrollTop = 100 * H;
    host.querySelector<HTMLElement>('.dzg-viewport')!.dispatchEvent(new Event('scroll'));
    expect(ctx.el.layer.querySelectorAll('.dzg-row[data-full]').length).toBeGreaterThan(0);
    expect(placed().map((c) => `${c.closest('.dzg-row')!.getAttribute('aria-rowindex')}:${c.getAttribute('data-col')}`)).toEqual([]);
  });
});

describe('a focused tall cell far from the window (passes: pins the one-row fallback)', () => {
  it('is drawn on its own first row, one row tall', () => {
    const tall: R[] = Array.from({ length: 300 }, (_, i) => ({ id: `r${i}`, ward: i < 40 ? 'A' : `x${i}`, name: `p${i}`, n: i }));
    const { g, ctx, scrollTo } = make(tall, [{ id: 'ward', merge: true }, { id: 'name' }]);
    g.api.focusCell(k('r0'), 'ward');
    scrollTo(200 * H);
    const cell = ctx.rowRenderer.cell(k('r0'), 'ward')!;
    expect(document.activeElement).toBe(cell);
    expect([cell.style.getPropertyValue('inset-block-start'), cell.style.getPropertyValue('block-size')]).toEqual(['0px', `${H}px`]);
  });
});

describe('a focus asked on a covered slot', () => {
  it('api.focusCell on a slot a tall cell covers focuses the cell owning it', () => {
    // The kernel's focus owner runs on a model change only (a sort, an update), so
    // focusCell(r2, 'ward') leaves the focus on a slot with no element: nothing is
    // focused on screen, the pending focus waits for a cell that never mounts.
    const { g, ctx } = make(rows, [{ id: 'ward', merge: true }, { id: 'name' }]);
    g.api.focusCell(k('r2'), 'ward');
    expect(g.kernel.focus).toEqual({ kind: 'cell', row: k('r0'), column: 'ward' });
    expect(document.activeElement).toBe(ctx.rowRenderer.cell(k('r0'), 'ward'));
  });
});
