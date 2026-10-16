import type { DisplayIndex } from '../ids.js';
import { layerPlacement, type LayerPlacement, type ScrollMapper } from './scroll-mapper.js';
import type { PrefixSums } from './prefix-sums.js';
import type { RowLayout } from './rows.js';

export interface WindowView {
  readonly block: number;
  readonly inline: number;
}

/** The rows and centre columns to mount, and where the row layer goes. */
export interface Window2D {
  readonly rows: { readonly first: DisplayIndex; readonly last: DisplayIndex } | null;
  readonly cols: { readonly first: number; readonly last: number } | null;
  readonly placement: LayerPlacement;
}

/**
 * The window to render for a scroll position. `physicalScrollTop` is what the
 * browser reports; the mapper turns it into a logical offset. `scrollInline`
 * is already logical (start to end, whatever the direction). A view ending
 * exactly where a row or column starts does not include it.
 */
export function visibleWindow(
  rows: RowLayout,
  centerCols: PrefixSums,
  mapper: ScrollMapper,
  physicalScrollTop: number,
  scrollInline: number,
  view: WindowView,
  o: { readonly overscanRows: number; readonly overscanCols: number },
): Window2D {
  const top = mapper.toLogical(physicalScrollTop);
  const placement = layerPlacement(top, mapper.toPhysical(top));
  const span = (start: number, length: number) => [start, Math.max(start, start + length - 1)] as const;

  let r: Window2D['rows'] = null;
  if (rows.count > 0) {
    const [a, b] = span(top, view.block);
    const first = Math.max(0, rows.indexAt(a) - o.overscanRows);
    const last = Math.min(rows.count - 1, rows.indexAt(b) + o.overscanRows);
    r = { first: first as DisplayIndex, last: last as DisplayIndex };
  }
  let c: Window2D['cols'] = null;
  if (centerCols.length > 0) {
    const [a, b] = span(Math.max(0, scrollInline), view.inline);
    c = {
      first: Math.max(0, centerCols.indexAt(a) - o.overscanCols),
      last: Math.min(centerCols.length - 1, centerCols.indexAt(b) + o.overscanCols),
    };
  }
  return { rows: r, cols: c, placement };
}

/** More overscan when scrolling fast, so a quick fling does not show blank rows. */
export function overscanRows(speedPxPerSec: number, rowHeight: number, o: { readonly min?: number; readonly max?: number } = {}): number {
  const min = o.min ?? 4;
  const max = o.max ?? 40;
  if (!(rowHeight > 0) || !Number.isFinite(speedPxPerSec)) return min;
  return Math.min(max, Math.max(min, Math.round(min + (Math.abs(speedPxPerSec) * 0.1) / rowHeight)));
}
