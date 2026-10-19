import type { ColumnDef, ColumnOrGroup, ResolvedColumn } from '@dzgrid/core';
import type { GridContext } from '../context.js';
import type { HeaderRowSpec } from '../render/header.js';
import type { Part, SlotContext } from '../part.js';
import { mounted, type Mounted } from '../mounted.js';
import type { Commit } from './commit.js';
import { composing } from './dom.js';
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
  toggle(column: string, anchor: HTMLElement): void;
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

  g.scope.on(g.el.header, 'keydown', (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    const cell = t.closest<HTMLElement>('.dzg-hextra');
    const m = cell && cells.get(cell);
    if (!m) return;
    const column = cell.dataset['col']!;
    if (t === cell) {
      if ((e.key !== 'Enter' && e.key !== 'F2') || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      e.preventDefault();
      e.stopPropagation();
      tab(cell, 0);
      if (!m.focus()) tab(cell, -1);
    } else if (e.key === 'Escape') {
      // Back to the cell, the filter kept; never to a host dialog around the grid. Inside a
      // composition, it only ends it: kept in the box, nothing applied.
      e.stopPropagation();
      if (!composing(e)) e.preventDefault(), flush(column), cell.focus();
    } else if (e.key === 'Enter' && !composing(e)) flush(column);
  });
  g.scope.on(g.el.header, 'focusout', (e: FocusEvent) => {
    const t = e.target as HTMLElement;
    const cell = t.closest<HTMLElement>('.dzg-hextra');
    const to = e.relatedTarget as Node | null;
    if (!cell || t === cell || !cells.has(cell) || (to && to !== cell && cell.contains(to))) return;
    tab(cell, -1);
    flush(cell.dataset['col']!);
  });

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
