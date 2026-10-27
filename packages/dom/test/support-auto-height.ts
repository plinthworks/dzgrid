// Shared fixtures for automatic row height (Phase 6 step 9, docs/behaviors/auto-height.md): rows of long and short notes,
// a measure stub for jsdom (no layout), a grid maker.
import { vi } from 'vitest';
import { dataKey, type ColumnDef, type GridEvent, type Problem, type RowKey } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { GridSettings } from '../src/settings.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import type { GridContext } from '../src/context.js';
import type { GridFeature } from '../src/features.js';
import { autoHeight } from '../src/auto-height.js';
import { EN } from '../src/locales/en.js';

export type N = { id: string; name: string; note: string };
/** Every fifth row a long note (150 characters: 7 lines at 200 px), the others a short one. */
export const NOTES = (n: number, long = (i: number) => i % 5 === 0): N[] => Array.from({ length: n }, (_, i) => ({ id: `R${i}`, name: `Row ${i}`, note: long(i) ? 'word '.repeat(30) : 'short' }));
export const NCOLS: ColumnDef<N, any>[] = [
  { id: 'name', header: 'Name', width: 120 },
  { id: 'note', header: 'Note', width: 200, wrap: true },
];
export const k = (id: string): RowKey => dataKey(id)!;
export const problemsOf = (events: GridEvent<N>[]): Problem[] => events.filter((e) => e.type === 'problems').flatMap((e) => (e as unknown as { problems: Problem[] }).problems);

/** Lines of a text in a box `w` wide (16 px of padding), 8 px a character. */
export const lines = (text: string, w: number) => Math.max(1, Math.ceil((text.length * 8) / Math.max(8, w - 16)));
/** The stub's height for a probe: 20 px a line, 9 px of padding and line (one line: 29, under every density's floor but compact's 28). */
export const tall = (text: string, w: number) => lines(text, w) * 20 + 9;

/**
 * The measure stub: a hidden element (a probe) is as tall as its text needs at its inline size; anything else
 * is 0 × 0 (jsdom's). `reads[i]`: how many hidden elements were in the page at the i-th probe read.
 */
export function measureStub() {
  const reads: number[] = [];
  const hidden = () => document.querySelectorAll('[style*="visibility: hidden"]').length;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const s = (this as HTMLElement).style;
    if (s?.visibility !== 'hidden') return { top: 0, bottom: 0, left: 0, right: 0, x: 0, y: 0, width: 0, height: 0, toJSON() {} } as DOMRect;
    reads.push(hidden());
    const w = parseFloat(s.inlineSize) || 0;
    const h = tall(this.textContent ?? '', w) + 0.4;
    return { top: 0, bottom: h, left: 0, right: w, x: 0, y: 0, width: w, height: h, toJSON() {} } as DOMRect;
  });
  return { reads, hidden };
}

export const grids: GridInstance<N, any>[] = [];
export function cleanup(): void {
  for (const g of grids.splice(0)) g.destroy();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
}

export interface AMake {
  readonly rows?: N[];
  readonly columns?: ColumnDef<N, any>[];
  readonly settings?: Partial<GridSettings<N>>;
  readonly features?: readonly GridFeature[];
  readonly block?: number;
  readonly maxPhysical?: number;
  readonly raf?: Pick<Window, 'requestAnimationFrame' | 'cancelAnimationFrame'>;
}

export function amake(o: AMake = {}, list: GridInstance<N, any>[] = grids) {
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: o.block ?? 320, inline: 600, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
  const host = document.body.appendChild(document.createElement('div'));
  const events: GridEvent<N>[] = [];
  const g = createGrid<N>(host, {
    rows: o.rows ?? NOTES(200), getRowId: (r) => r.id, columns: o.columns ?? NCOLS, messages: EN, onEvent: (e) => events.push(e),
    features: o.features ?? [autoHeight()], ...o.settings,
  }, { geometry, ...(o.raf ? { raf: o.raf } : { sync: true }), ...(o.maxPhysical && { maxPhysical: o.maxPhysical }) });
  list.push(g);
  const ctx = (g as unknown as { context: GridContext<N> }).context;
  const vp = host.querySelector<HTMLElement>('.dzg-viewport')!;
  const rowEl = (id: string) => [...host.querySelectorAll<HTMLElement>('.dzg-layer > .dzg-row')].find((r) => ctx.rowRenderer.keyOf(r) === k(id)) ?? null;
  const cell = (id: string, col = 'note') => rowEl(id)?.querySelector<HTMLElement>(`.dzg-cell[data-col="${col}"]`) ?? null;
  const d = () => g.kernel.rows.displayed;
  const at = (id: string) => d().indexOf(k(id));
  const heightOf = (id: string) => ctx.layout!.heightOf(at(id) as never);
  const offsetOf = (id: string) => ctx.layout!.offsetOf(at(id) as never);
  const top = () => ctx.scroll.logicalTop;
  const topKey = () => String(d().keyAt(ctx.layout!.indexAt(top()))).replace(/^d:\d+:/, '');
  const scroll = (px: number) => { box.scrollTop = px; vp.dispatchEvent(new Event('scroll')); };
  const mounted = () => [...ctx.rowRenderer.mounted.keys()].map((x) => String(x).replace(/^d:\d+:/, ''));
  return { g, ctx, host, vp, box, events, rowEl, cell, d, at, heightOf, offsetOf, top, topKey, scroll, mounted };
}

