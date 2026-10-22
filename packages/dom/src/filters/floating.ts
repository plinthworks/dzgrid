import type { ChangeSource, ResolvedColumn } from '@dzgrid/core';
import type { GridContext } from '../context.js';
import type { HeaderRowSpec } from '../render/header.js';
import type { Part, SlotContext } from '../part.js';
import type { Commit } from './commit.js';
import { cellKeys, mounted, type Mounted } from '@dzgrid/dom/internal';
import type { Resolve } from './resolve.js';

type FC = SlotContext['floating'];

/** What a floating cell may hold that takes the focus: out of the Tab order until Enter or F2. */
const CONTROLS = 'input,button,select,textarea,a[href],[tabindex]';

export interface FloatingRow {
  readonly spec: HeaderRowSpec;
  sweep(): void;
  /** Before the row (at header level `level`) is hidden: a grid focus on that level goes to its column's header; others stay. */
  leave(level: number, source: ChangeSource): void;
  destroy(): void;
}

/** The popup, as the floating row sees it: whether a column has one, and opening it from a cell. */
export interface Opener {
  can(col: ResolvedColumn<unknown>): boolean;
  /** `anchor` null: the header's button, else its cell. */
  toggle(column: string, anchor: HTMLElement | null): void;
}

/**
 * The floating row (docs/behaviors/filter-ui.md, step 12; shown and hidden live since Phase 4 step 12,
 * floating-toggle.md: the feature puts its spec in `g.headerRows` or takes it out). Each cell's part is resolved from the registry (`resolve.ts`: `floating.<kind>`,
 * then the bare `floating`), mounted with its cell and swept when the cell leaves the column window.
 * The pause is the feature's (`commit.ts`): one pending edit per column, applied by its timer, Enter,
 * Escape, the focus leaving the cell or the cell leaving the window; dropped with the grid. Enter
 * or F2 on a cell goes into its part, Escape inside comes back to the cell. A summary opens the
 * column's popup when it has one (step 13), anchored to the cell's `aria-haspopup` control.
 */
export function floatingRow(g: GridContext<unknown>, resolve: Resolve, commit: Commit, popup: Opener): FloatingRow {
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
    // Its pending edits are applied by the sweep of the paint that takes its cells away; a DOM focus in it is
    // given back by that paint to the grid's focus (the focused node gone), which goes to the column's header here.
    leave(level, source) {
      const f = g.kernel.focus;
      if (level && f?.kind === 'header' && f.level === level) g.kernel.dispatch({ type: 'focus.set', focus: { kind: 'header', column: f.column } }, source);
    },
    // The pending edits' timers belong to the grid's scope: they go with it.
    destroy() {
      for (const m of cells.values()) m.clear();
    },
  };
}
