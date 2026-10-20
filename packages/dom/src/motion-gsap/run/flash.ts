import { isBlank, type RowKey } from '@dzgrid/core';
import { showing } from './guard.js';
import type { Scene } from './index.js';

/** The displayed texts of the rows a transaction changed, by column, before the paint. */
export type Texts = Map<RowKey, Map<string, string>>;

/** More cells changed in one paint than this: a bulk change, none is marked. */
const MAX_CELLS = 50;
/** At most one mark per cell in this time. */
const EVERY_MS = 500;

const last = new WeakMap<Element, number>();

/**
 * The value flash (owner Q3: live changes only): the cells of the rows a transaction updated or
 * added whose displayed text changed get `dzg-flash` with `--dzg-flash` tweened 1 → 0; under
 * reduced motion the mark stays still 0.6 s. Not announced.
 */
export function flash(s: Scene, texts: Texts, changed: ReadonlySet<RowKey>, added: ReadonlySet<RowKey>): void {
  const { g, gsap, o, guard, now, reduced } = s;
  const cells: [RowKey, string, HTMLElement, string, string][] = [];
  for (const k of changed) {
    const v = g.rowRenderer.mounted.get(k);
    const old = texts.get(k);
    if (!v || (!old && !added.has(k))) continue;
    for (const [c, cell] of v.cells) {
      const text = cell.el.textContent ?? '';
      const was = old?.get(c) ?? '';
      if (text !== was) cells.push([k, c, cell.el, text, was]);
    }
  }
  if (cells.length > MAX_CELLS) return;
  for (const [k, c, el, text, was] of cells) {
    if (now - (last.get(el) ?? -1e9) < EVERY_MS) continue;
    last.set(el, now);
    const row = g.rows.row(k)?.data;
    const col = g.columns.get(c);
    let value: unknown = null;
    try {
      const raw = col && row !== undefined ? col.read(row) : null;
      value = isBlank(raw) ? null : col!.codec.coerce(raw, g.ctx);
    } catch {
      /* an unreadable value: null, as its cell shows blank */
    }
    if (s.hook(o.onCell, el, { key: k, column: c, value, text, previousText: was, row, context: g.settings.context, reduced }, 'changed') === false || !s.on('flash')) continue;
    el.classList.add('dzg-flash');
    if (reduced) {
      el.style.setProperty('--dzg-flash', '1');
      guard.track(el, showing(g, el, k, c), gsap.delayedCall(0.6, () => guard.release(el)));
    } else s.play(el, showing(g, el, k, c), { '--dzg-flash': 1 }, { '--dzg-flash': 0, duration: 0.6 });
  }
}
