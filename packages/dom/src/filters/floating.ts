import type { ColumnDef, ColumnOrGroup, ResolvedColumn } from '@dzgrid/core';
import type { GridContext } from '../context.js';
import type { HeaderRowSpec } from '../render/header.js';
import type { Part, SlotContext } from '../part.js';
import type { Commit } from './commit.js';
import { cellKeys, mounted, type Mounted } from '@dzgrid/dom/internal';
import type { Resolve } from './resolve.js';

type FC = SlotContext['floating'];

/** What a floating cell may hold that takes the focus: out of the Tab order until Enter or F2. */
const CONTROLS = 'input,button,select,textarea,a[href],[tabindex]';
const leaves = (t: readonly ColumnOrGroup<unknown>[]): ColumnDef<unknown>[] => t.flatMap((d) => (d && 'children' in d ? leaves(d.children) : [d]));

export interface FloatingRow {
  readonly spec: HeaderRowSpec;
  sweep(): void;
  destroy(): void;
}

/** The popup, as the floating row sees it: whether a column has one, and opening it from a cell. */
export interface Opener {
  can(col: ResolvedColumn<unknown>): boolean;
  /** `anchor` null: the header's button, else its cell. */
  toggle(column: string, anchor: HTMLElement | null): void;
}

/**
 * The floating row (docs/behaviors/filter-ui.md, step 12): fixed when the grid is made (owner
 * decision O3), there when `filters({ floating: true })` or a column, hidden ones included, asks
 * for it; null otherwise. Each cell's part is resolved from the registry (`resolve.ts`: `floating.<kind>`,
 * then the bare `floating`), mounted with its cell and swept when the cell leaves the column window.
 * The pause is the feature's (`commit.ts`): one pending edit per column, applied by its timer, Enter,
 * Escape, the focus leaving the cell or the cell leaving the window; dropped with the grid. Enter
 * or F2 on a cell goes into its part, Escape inside comes back to the cell. A summary opens the
 * column's popup when it has one (step 13), anchored to the cell's `aria-haspopup` control.
 */
export function floatingRow(g: GridContext<unknown>, o: { readonly floating?: boolean }, resolve: Resolve, commit: Commit, popup: Opener): FloatingRow | null {
  if (o.floating !== true && !leaves(g.settings.columns).some((d) => d?.filter && d.filter.floating === true)) return null;
  const cells = new Map<HTMLElement, Mounted<FC>>();
  const flush = commit.flush;
  const tab = (cell: HTMLElement, i: number): void => {
    for (const c of cell.querySelectorAll<HTMLElement>(CONTROLS)) c.tabIndex = i;
  };
  // Enter or F2 into the part, Escape back to the cell, applied on leaving (shared with the header parts, step 21).
  cellKeys(g, '.dzg-hextra', (cell) => {
    const m = cells.get(cell);
    return m && { focus: m.focus, flush: () => flush(cell.dataset['col']!) };
  }, tab);

  function paint(cell: HTMLElement, col: ResolvedColumn<unknown>): void {
    const m = cells.get(cell);
    if (!m) return;
    const { part, kind } = resolve(col, 'floating');
    m.set(cell, part as Part<FC> | null, {
      ...commit.edits(col, kind, cell),
      canOpen: popup.can(col),
      openFilter: () => popup.toggle(col.id, cell.querySelector<HTMLElement>('[aria-haspopup]') ?? cell),
    });
    // One tab stop for the grid: the cell's controls only while the focus is in them.
    const at = g.doc.activeElement;
    if (at === cell || !cell.contains(at)) tab(cell, -1);
    // The grid reads as read-only; a cell holding a box is not.
    if (cell.querySelector('input')) cell.setAttribute('aria-readonly', 'false');
    else cell.removeAttribute('aria-readonly');
  }

  return {
    spec: { id: 'filters.floating', mount: (cell) => void cells.set(cell, mounted<FC>(g)), update: paint },
    // A cell that left the column window (or the page): its pending edit applied, its part destroyed.
    sweep() {
      for (const [cell, m] of cells) {
        if (g.el.header.contains(cell)) continue;
        flush(cell.dataset['col']!);
        m.clear();
        cells.delete(cell);
      }
    },
    // The pending edits' timers belong to the grid's scope: they go with it.
    destroy() {
      for (const m of cells.values()) m.clear();
    },
  };
}
