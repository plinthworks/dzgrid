import { isBlank, type ResolvedColumn, type RowKey } from '@dzgrid/core';
import type { GridContext } from '../../context.js';
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
 * displayed text changed get `dzg-flash` with `--dzg-flash` tweened 1 → 0 after its hold (`effects.flash`); under
 * reduced motion the mark stays still for hold + fade. A row it added fades in once, as a row entering (owner Q5: `onRow`
 * `'entered'`, not under reduced motion; `fade` false when a glide in the same paint did it), its
 * cells unmarked. Not announced.
 */
export function flash(s: Scene, f: Frame<unknown>, texts: Texts, changed: ReadonlySet<RowKey>, added: ReadonlySet<RowKey>, fade: boolean): void {
  const { g, o, reduced } = s;
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
    if (!fresh(s, k, c)) continue;
    const row = g.rows.row(k)?.data;
    const col = g.columns.get(c);
    const [value] = valueOf(g, col, col && row !== undefined ? col.read(row) : null);
    const ok = showing(g, el, k, c);
    if (s.hook(o.onCell, ok, el, { key: k, column: c, value, text, previousText: was, row, context: g.settings.context, reduced }, 'changed') !== false && s.on('flash')) tint(s, el, ok);
  }
}

/** A raw value as its column reads it (null: blank or unreadable, as its cell shows blank) and formats it (''). */
export function valueOf(g: GridContext<unknown>, col: ResolvedColumn<unknown> | undefined, raw: unknown): [unknown, string] {
  try {
    const v = isBlank(raw) ? null : col!.codec.coerce(raw, g.ctx);
    return [v, v === null ? '' : col!.codec.format(v as never, g.ctx)];
  } catch {
    return [null, ''];
  }
}

/** Marks older than the cap forgotten (once a paint): the map holds the last 500 ms only. */
export function forget(marked: Map<RowKey, Map<string, number>>, now: number): void {
  for (const [k, m] of marked) {
    for (const [c, t] of m) if (now - t >= EVERY_MS) m.delete(c);
    if (!m.size) marked.delete(k);
  }
}

/** Whether a cell may be marked now (the live flash and the saved one share it): not marked in the last 500 ms (by row key and column, never element: they are pooled); then recorded. */
export function fresh(s: Scene, k: RowKey, c: string): boolean {
  const m = s.marked.get(k) ?? new Map<string, number>();
  if (m.has(c)) return false;
  s.marked.set(k, m.set(c, s.now));
  return true;
}

/**
 * The built-in flash on a cell: `dzg-flash`, `--dzg-flash` at 1, held then 1 → 0 (`s.time`; default 0 + 0.6 s); reduced
 * motion: the mark still for hold + fade. A mark running (or waiting in its hold) is replaced, never doubled.
 */
export function tint(s: Scene, el: HTMLElement, ok: () => boolean): void {
  const { gsap, guard, time: [hold, fade] } = s;
  el.classList.add('dzg-flash');
  // The mark is the guard's call: a new one kills the one running, even one still waiting in its hold (GSAP's
  // `overwrite` sees only tweens already started); a host's tweens on the cell stay.
  guard.track(el, ok, s.reduced
    ? (el.style.setProperty('--dzg-flash', '1'), gsap.delayedCall(hold + fade, () => guard.release(el)))
    : s.play(el, ok, { '--dzg-flash': 1 }, { '--dzg-flash': 0, delay: hold, duration: fade }));
}
