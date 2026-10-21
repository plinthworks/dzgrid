import { isBlank, type RowKey } from '@dzgrid/core';
import type { Frame } from '../../render/rows.js';
import { enter } from './flip.js';
import { showing } from './guard.js';
import type { Scene } from './index.js';

/** The displayed texts of the rows a transaction changed, by column, before the paint. */
export type Texts = Map<RowKey, Map<string, string>>;

/** More cells changed in one paint than this: a bulk change, none is marked. */
const MAX_CELLS = 50;
/** At most one mark per cell (row key and column, not element: they are pooled) in this time. */
const EVERY_MS = 500;
/** More rows added in one paint than this: none fades (a bulk add). */
const MAX_ADDED = 20;

/**
 * The value flash (owner Q3: live changes only): the cells of the rows a transaction updated whose
 * displayed text changed get `dzg-flash` with `--dzg-flash` tweened 1 → 0; under reduced motion the
 * mark stays still 0.6 s. A row it added fades in once, as a row entering (owner Q5: `onRow`
 * `'entered'`, not under reduced motion; `fade` false when a glide in the same paint did it), its
 * cells unmarked. Not announced.
 */
export function flash(s: Scene, f: Frame<unknown>, texts: Texts, changed: ReadonlySet<RowKey>, added: ReadonlySet<RowKey>, fade: boolean): void {
  const { g, gsap, o, guard, now, reduced, marked } = s;
  // Marks older than the cap are forgotten: the map holds the last 500 ms only.
  for (const [k, m] of marked) {
    for (const [c, t] of m) if (now - t >= EVERY_MS) m.delete(c);
    if (!m.size) marked.delete(k);
  }
  const rows = [...added].filter((k) => g.rowRenderer.mounted.has(k));
  if (fade && !reduced && rows.length <= MAX_ADDED) rows.forEach((k, i) => enter(s, f, k, g.rowRenderer.mounted.get(k)!.el, i));
  const cells: [RowKey, string, HTMLElement, string, string][] = [];
  for (const k of changed) {
    const v = g.rowRenderer.mounted.get(k);
    const old = texts.get(k);
    if (!v || !old || added.has(k)) continue;
    for (const [c, cell] of v.cells) {
      const text = cell.el.textContent ?? '';
      const was = old.get(c) ?? '';
      if (text !== was) cells.push([k, c, cell.el, text, was]);
    }
  }
  if (cells.length > MAX_CELLS) return;
  for (const [k, c, el, text, was] of cells) {
    const m = marked.get(k) ?? new Map<string, number>();
    if (m.has(c)) continue;
    marked.set(k, m.set(c, now));
    const row = g.rows.row(k)?.data;
    const col = g.columns.get(c);
    let value: unknown = null;
    try {
      const raw = col && row !== undefined ? col.read(row) : null;
      value = isBlank(raw) ? null : col!.codec.coerce(raw, g.ctx);
    } catch {
      /* an unreadable value: null, as its cell shows blank */
    }
    const ok = showing(g, el, k, c);
    if (s.hook(o.onCell, ok, el, { key: k, column: c, value, text, previousText: was, row, context: g.settings.context, reduced }, 'changed') === false || !s.on('flash')) continue;
    el.classList.add('dzg-flash');
    if (reduced) {
      el.style.setProperty('--dzg-flash', '1');
      guard.track(el, ok, gsap.delayedCall(0.6, () => guard.release(el)));
    } else s.play(el, ok, { '--dzg-flash': 1 }, { '--dzg-flash': 0, duration: 0.6 });
  }
}
