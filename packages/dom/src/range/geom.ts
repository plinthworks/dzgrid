import type { CellAddr } from '@dzgrid/core';
import type { GridContext } from '../context.js';
import { logicalX } from '../dir.js';
import { CHECK_WIDTH } from '../render/write.js';

/**
 * Where the pointer is over the body, for a block's drag (`pointer.ts`) and the fill handle's (`@dzgrid/dom/fill`,
 * Phase 5 step 12, D2): found by geometry (the row layout, the column widths), never `elementFromPoint` — pinned
 * parents, the tooltip and the overlay sit over cells, and scaled scrolling stays logical.
 */
type Pt = { readonly clientX: number; readonly clientY: number };

/** The box column's width when it is shown. */
const extra = (g: GridContext<unknown>): number => {
  const s = g.settings.selection;
  return s?.checkbox && (s.mode ?? 'none') !== 'none' ? CHECK_WIDTH : 0;
};

/**
 * Where a point is, logically, in the grid's own pixels: block from the body's top, inline from the view's start edge
 * (review 5: a CSS scale or zoom on an ancestor makes the client boxes bigger or smaller than the layout's).
 */
const place = (g: GridContext<unknown>, p: Pt) => {
  const v = g.el.viewport;
  const r = v.getBoundingClientRect();
  return { block: (p.clientY - g.el.header.getBoundingClientRect().bottom) / (r.height / (v.offsetHeight || r.height) || 1), inline: logicalX(p, r, g.dir) / (r.width / (v.offsetWidth || r.width) || 1) };
};

/**
 * The cell under a point: the row from the row layout (clamped, a point over the pinned parents is the row under them), the
 * column from the widths; `dy` (layout px) moves the point along the block axis first (the fill's half-row rule).
 */
export const cellAt = (g: GridContext<unknown>, p: Pt, dy = 0): CellAddr | null => {
  const d = g.rows.displayed;
  const L = g.layout;
  if (!d.count || !L) return null;
  const box = g.geometry.read();
  const { inline: x, block: y } = place(g, p);
  const i = L.indexAt(g.scroll.logicalTop + Math.max(g.inset ?? 0, Math.min(box.block - 1, y + dy)));
  const c = g.columns.layout;
  const e = extra(g);
  const end = Math.min(box.inline, c.totalWidth + e) - c.end.width;
  const col = c.start.columns.length && x < e + c.start.width ? c.start.columns[c.start.widths.indexAt(x - e)]
    : c.end.columns.length && x >= end ? c.end.columns[c.end.widths.indexAt(x - end)]
    : c.center.columns[c.center.widths.indexAt(x - e - c.start.width + box.scrollInline)] ?? c.start.columns.at(-1) ?? c.end.columns[0];
  return col ? { row: d.keyAt(i), column: col.id } : null;
};

/** One frame of the auto-scroll near the body's edges: as fast as the point is deep into the bands (at most a row a frame); true when the view moved (painted). */
export const autoScroll = (g: GridContext<unknown>, p: Pt): boolean => {
  const box = g.geometry.read();
  const h = g.rowHeight();
  const band = Math.max(24, h);
  const c = g.columns.layout;
  const e = extra(g);
  const { inline: x, block: y } = place(g, p);
  const v = (lo: number, hi: number, at: number): number => Math.max(-h, Math.min(h, ((at < lo ? at - lo : at > hi ? at - hi : 0) * h) / band));
  const top = g.scroll.logicalTop;
  g.scroll.scrollTo(top + v((g.inset ?? 0) + band, box.block - band, y));
  const max = Math.max(0, c.center.width - (box.inline - e - c.start.width - c.end.width));
  const to = Math.max(0, Math.min(max, box.scrollInline + v(e + c.start.width + band, Math.min(box.inline, c.totalWidth + e) - c.end.width - band, x)));
  if (to !== box.scrollInline) g.geometry.writeScrollInline(to);
  if (g.scroll.logicalTop === top && to === box.scrollInline) return false;
  g.schedule();
  return true;
};
