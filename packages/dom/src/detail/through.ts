import type { GridContext } from '../context.js';
import type { GridInstance } from '../grid.js';
import { inlineScroll, scrollConvention, setInlineScroll } from '../dir.js';
import type { NestedGridOptions } from './nested.js';

/**
 * `nestedGrid({ arrows: 'rows', inlineScroll: 'master' })` (1.13.0, master-detail.md), a chunk loaded when a panel first
 * shows such a grid: the `@dzgrid/dom/detail` entry carries only its `import()`. It speaks to the grid around through
 * the page, as a user would: the panel's row and the rows beside it (`aria-rowindex`), their cells, the outer view.
 *
 * - `arrows`: a plain ArrowDown on a cell of the row above the panel (ArrowUp: below it) focuses this grid's first (last)
 *   row, at the same column when the keys take it here, else the first one they take; ArrowUp on this grid's first row
 *   (ArrowDown on its last) focuses the row above (below) the panel, at this grid's column when that row has it, else at
 *   the column the keys came in at, else its first cell. The browser brings it into view; the grid redoes that scroll
 *   its own way (reading-keyboard.md). A grid without rows, a row not drawn: nothing here, the panel's stop as before.
 * - `inlineScroll`: the outer view's sideways scroll given to this grid (at once, and at each scroll); what this grid
 *   scrolls to by itself (a key, a focus) or the browser scrolls its view to (Tab, find in the page) given to the outer
 *   view. Its own scrollbar is off (`hold`, at once).
 *
 * Given the options, the panel's box, the grid and its context (both may be made again); returns `wire` (again after the
 * grid is made again) and `off`.
 */
export function through(
  o: Pick<NestedGridOptions<unknown>, 'arrows' | 'inlineScroll'>,
  host: HTMLElement,
  grid: () => GridInstance<any, any>,
  ctx: () => GridContext<any>,
): { wire(): void; off(): void } {
  const row = host.closest<HTMLElement>('.dzg-row')!;
  const outer = row.closest<HTMLElement>('.dzg-viewport')!;
  const doc = host.ownerDocument;
  /** The outer grid's row `n` rows from the panel's (drawn, else null). */
  const rowAt = (n: number): Element | undefined => [...row.parentElement!.children].find((r) => r.getAttribute('aria-rowindex') === String(Number(row.getAttribute('aria-rowindex')) + n));
  /** A plain ArrowDown (1) or ArrowUp (−1) on a cell, else 0. */
  const step = (e: KeyboardEvent): number => (e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey || !(e.target as Element).matches('.dzg-cell') ? 0 : e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0);
  /** The column the keys came in at (the way back, when the row there has no column of this grid's). */
  let came: string | undefined;
  const take = (e: KeyboardEvent): void => void (e.preventDefault(), e.stopPropagation());

  // From the outer grid, into this one (before the outer grid reads the key).
  const into = (e: KeyboardEvent): void => {
    const n = step(e);
    const t = e.target as HTMLElement;
    if (!n || t.closest('.dzg-row') !== rowAt(-n)) return;
    const g = grid();
    const d = g.kernel.rows.displayed;
    const keys = ctx().columns.visible().filter((c) => c.def.keyboard !== false);
    const at = keys.find((c) => c.id === t.dataset['col']) ?? keys[0];
    if (!d.count || !at) return;
    came = t.dataset['col'];
    take(e);
    g.api.focusCell(d.keyAt(d.index(n > 0 ? 0 : d.count - 1)!), at.id);
  };
  // Out of this one, to the row beside the panel (before this grid reads the key).
  const out = (e: KeyboardEvent): void => {
    const n = step(e);
    const g = grid();
    const f = g.kernel.focus;
    const d = g.kernel.rows.displayed;
    const r = rowAt(n);
    if (!n || f?.kind !== 'cell' || d.index(d.indexOf(f.row) + n) !== null || (e.target as Element).closest('.dzg') !== ctx().el.root || !r) return;
    const cells = [...r.querySelectorAll<HTMLElement>('.dzg-cell')];
    take(e);
    (cells.find((c) => c.dataset['col'] === f.column) ?? cells.find((c) => c.dataset['col'] === came) ?? cells[0])?.focus();
  };

  // The sideways scroll: the outer view's, given to this grid; this grid's own writes given to the outer view.
  const conv = scrollConvention(doc);
  let own: ((px: number) => void) | undefined;
  /** This grid's view, listened to (made again with the grid); its sideways scroll as last seen or written. */
  let vp: HTMLElement | undefined;
  let last = 0;
  const at = (): number => inlineScroll(ctx().el.viewport, ctx().dir, conv);
  const follow = (): void => {
    const c = ctx();
    own?.(inlineScroll(outer, c.dir, conv));
    last = at();
    c.schedule();
  };
  // What the browser scrolls this grid's view to by itself (a cell or a control brought into view: Tab, find in the
  // page, `scrollIntoView`) given to the outer view, which gives it back (`follow`); the echo of `follow` (the same
  // place) and a scroll that moved nothing sideways left alone: no loop.
  const back = (): void => {
    const x = at();
    if (Math.abs(x - last) > 1) (last = x), setInlineScroll(outer, x, ctx().dir, conv);
  };
  const wire = (): void => {
    if (!o.inlineScroll) return;
    vp?.removeEventListener('scroll', back);
    (vp = ctx().el.viewport).addEventListener('scroll', back, { passive: true });
    const geo = ctx().geometry as { writeScrollInline(px: number): void };
    const was = geo.writeScrollInline;
    own = was;
    geo.writeScrollInline = (px) => (was(px), setInlineScroll(outer, px, ctx().dir, conv));
    follow();
  };

  if (o.arrows) outer.addEventListener('keydown', into, true), host.addEventListener('keydown', out, true);
  if (o.inlineScroll) outer.addEventListener('scroll', follow);
  wire();
  return {
    wire,
    off() {
      outer.removeEventListener('keydown', into, true);
      host.removeEventListener('keydown', out, true);
      outer.removeEventListener('scroll', follow);
      vp?.removeEventListener('scroll', back);
    },
  };
}
