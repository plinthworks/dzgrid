import type { RowKey } from '@dzgrid/core';
import type { Frame, RowView } from '../../render/rows.js';
import type { RowMotion } from '../index.js';
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
 * than a screen does not glide. A row still gliding starts from where it is drawn (`s.ys`). `how` (a
 * tree's rows opened 1, closed 2, both or unknown 3, step 6; undefined for a sort): the same glide
 * under the `expand` switch; at a close the rows coming in at the bottom rise with the others, by the
 * distance the lowest moved row's offset changed (its glide aside; none moved: they simply show);
 * at a close or both, nothing fades.
 */
export function flip(s: Scene, f: Frame<unknown>, tops: ReadonlyMap<RowKey, number>, how?: number): void {
  const { g, o } = s;
  const fx = how ? 'expand' : 'flip';
  const moved: [RowKey, RowView, number][] = [];
  let entered: [RowKey, RowView][] = [];
  let low = -1;
  let rise = 0;
  for (const [k, v] of g.rowRenderer.mounted) {
    const top = tops.get(k);
    // Nothing mounted before (the first rows): nothing enters.
    if (top === undefined) tops.size && entered.push([k, v]);
    else {
      const was = top + (s.ys.get(k) ?? 0);
      if (was !== v.top) moved.push([k, v, was - v.top]);
      if (top !== v.top && v.top > low) (low = v.top), (rise = top - v.top);
    }
  }
  if (how! & 2) {
    if (how === 2 && rise > 0) for (const [k, v] of entered) moved.push([k, v, rise]);
    entered = [];
  }
  if (moved.length > MAX_MOVED) return;
  // A screen: the view's block, as the last paint measured it (no read).
  const screen = g.viewBlock;
  for (const [k, v, d] of moved) {
    const ok = showing(g, v.el, k);
    if (Math.abs(d) > screen || s.hook(o.onRow, ok, v.el, rowMotion(s, f, k), 'moved') === false || !s.on(fx)) continue;
    s.play(v.el, ok, { y: d }, { y: 0, duration: 0.3 });
  }
  if (entered.length <= MAX_ENTERED) entered.forEach(([k, v], i) => enter(s, f, k, v.el, i, how ? 'expand' : 'enter'));
}

/** What `onRow` is told of a row; its index found when read (a million-row tree builds its index then). */
const rowMotion = (s: Scene, f: Frame<unknown>, k: RowKey): RowMotion => ({
  key: k,
  row: s.g.rows.row(k)?.data,
  get index() {
    return f.displayed.indexOf(k);
  },
  context: s.g.settings.context,
  reduced: false,
});

/** A row new to the window (the `i`th) fades in, staggered, after `onRow(el, c, 'entered')` (not under reduced motion); `fx` its switch. */
export function enter(s: Scene, f: Frame<unknown>, k: RowKey, el: HTMLElement, i = 0, fx: 'enter' | 'expand' = 'enter'): void {
  const ok = showing(s.g, el, k);
  if (s.hook(s.o.onRow, ok, el, rowMotion(s, f, k), 'entered') !== false && s.on(fx)) s.play(el, ok, { opacity: 0 }, { opacity: 1, duration: 0.12, delay: i * 0.015 });
}
