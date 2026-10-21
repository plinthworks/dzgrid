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
 * than a screen does not glide. `close` (a tree's rows opened or closed, step 6; undefined for a sort):
 * the same glide under the `expand` switch; at a close the rows coming in at the bottom rise with the
 * others, by the distance of the lowest row that moved (none moved: they simply show), nothing fades.
 */
export function flip(s: Scene, f: Frame<unknown>, tops: ReadonlyMap<RowKey, number>, close?: boolean): void {
  const { g, o } = s;
  const fx = close === undefined ? 'flip' : 'expand';
  const moved: [RowKey, RowView, number][] = [];
  let entered: [RowKey, RowView][] = [];
  let low = -1;
  let rise = 0;
  for (const [k, v] of g.rowRenderer.mounted) {
    const was = tops.get(k);
    // Nothing mounted before (the first rows): nothing enters.
    if (was === undefined) tops.size && entered.push([k, v]);
    else if (was !== v.top) {
      moved.push([k, v, was - v.top]);
      if (v.top > low) (low = v.top), (rise = was - v.top);
    }
  }
  if (close) {
    if (rise > 0) for (const [k, v] of entered) moved.push([k, v, rise]);
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
  if (entered.length <= MAX_ENTERED) entered.forEach(([k, v], i) => enter(s, f, k, v.el, i, close === undefined ? 'enter' : 'expand'));
}

/** What `onRow` is told of a row. */
const rowMotion = (s: Scene, f: Frame<unknown>, k: RowKey): RowMotion => ({ key: k, row: s.g.rows.row(k)?.data, index: f.displayed.indexOf(k), context: s.g.settings.context, reduced: false });

/** A row new to the window (the `i`th) fades in, staggered, after `onRow(el, c, 'entered')` (not under reduced motion); `fx` its switch. */
export function enter(s: Scene, f: Frame<unknown>, k: RowKey, el: HTMLElement, i = 0, fx: 'enter' | 'expand' = 'enter'): void {
  const ok = showing(s.g, el, k);
  if (s.hook(s.o.onRow, ok, el, rowMotion(s, f, k), 'entered') !== false && s.on(fx)) s.play(el, ok, { opacity: 0 }, { opacity: 1, duration: 0.12, delay: i * 0.015 });
}
