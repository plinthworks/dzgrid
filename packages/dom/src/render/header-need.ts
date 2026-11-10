import type { GridContext } from '../context.js';
import { setPx } from './write.js';

/**
 * A feature's need for the column headers' row (vertical titles, wrapped titles: vertical-headers.md 3, header-wrap.md
 * 3–4): the row's `min-block-size` is the largest need (`g.headerNeeds`), none when every need is 0 — so two such
 * features never undo each other, and `headerHeight` still wins when taller (a minimum under a height does nothing).
 * The row is the one after the group rows; the other header rows carry none. A change asks one more paint (the body's
 * view follows the header's height), unless `quiet` (the feature going away with the grid).
 */
export function needHeader(g: GridContext<unknown>, who: string, px: number, quiet?: boolean): void {
  const n = (g.headerNeeds ??= {});
  n[who] = px;
  const max = Math.max(...Object.values(n));
  let moved = false;
  for (const r of g.el.header.querySelectorAll<HTMLElement>('.dzg-hrow')) {
    const was = r.style.getPropertyValue('min-block-size');
    if (max && r.getAttribute('aria-rowindex') == String(g.bands.length + 1)) setPx(r, 'min-block-size', max);
    else r.style.removeProperty('min-block-size');
    moved ||= r.style.getPropertyValue('min-block-size') !== was;
  }
  if (moved && !quiet) g.schedule();
}
