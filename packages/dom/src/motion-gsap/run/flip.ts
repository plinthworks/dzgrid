import type { RowKey } from '@dzgrid/core';
import type { Frame, RowView } from '../../render/rows.js';
import { showing } from './guard.js';
import type { Scene } from './index.js';

/** More rows moving than this: none glides (a long jump, a big window). */
const MAX_MOVED = 60;
/** More rows entering than this: none fades (most of the window is new: it simply shows). */
const MAX_ENTERED = 20;

/**
 * Rows glide after a sort or a filter (FLIP by hand, y only): from the offset the grid wrote before
 * the paint to the new one; rows new to the window fade in, staggered, at most 20 (more: the window is
 * mostly new and simply shows); leaving rows just go (recycled in the same paint). A row moving more
 * than a screen does not glide.
 */
export function flip(s: Scene, f: Frame<unknown>, tops: ReadonlyMap<RowKey, number>): void {
  const { g, o } = s;
  const moved: [RowKey, RowView, number][] = [];
  const entered: [RowKey, RowView][] = [];
  for (const [k, v] of g.rowRenderer.mounted) {
    const was = tops.get(k);
    // Nothing mounted before (the first rows): nothing enters.
    if (was === undefined) tops.size && entered.push([k, v]);
    else if (was !== v.top) moved.push([k, v, was - v.top]);
  }
  if (moved.length > MAX_MOVED) return;
  // A screen: the rows mounted, at their height (no read).
  const screen = g.rowRenderer.mounted.size * g.rowHeight();
  const ctx = (k: RowKey) => ({ key: k, row: g.rows.row(k)?.data, index: f.displayed.indexOf(k), context: g.settings.context, reduced: false });
  for (const [k, v, d] of moved) {
    if (Math.abs(d) > screen || s.hook(o.onRow, v.el, ctx(k), 'moved') === false || !s.on('flip')) continue;
    s.play(v.el, showing(g, v.el, k), { y: d }, { y: 0, duration: 0.3 });
  }
  if (entered.length > MAX_ENTERED) return;
  entered.forEach(([k, v], i) => {
    if (s.hook(o.onRow, v.el, ctx(k), 'entered') !== false && s.on('enter')) s.play(v.el, showing(g, v.el, k), { opacity: 0 }, { opacity: 1, duration: 0.12, delay: i * 0.015 });
  });
}
