import type { GridContext } from '../context.js';

/** Inside an input method: `isComposing`, or Safari's last Enter after the composition ended (key code 229). */
export const composing = (e: KeyboardEvent): boolean => e.isComposing || e.keyCode === 229;

/** A header cell's part, as the keys see it: taking the focus, applying its pending edit. */
export interface CellPart {
  focus(): boolean;
  flush(): void;
}

/**
 * The keys of a header cell holding a part's control (a floating filter cell, step 12; a column
 * header's part, step 21), shared through `@dzgrid/dom/internal`: Enter or F2 on the cell goes into
 * the part (its `focus()`; `tab(cell, 0)` puts the cell's controls in the Tab order meanwhile, back
 * to -1 when it took nothing); Escape inside applies the pending edit and comes back to the cell,
 * and goes no further (inside an input method's composition it only ends it); Enter inside applies.
 * The focus leaving the cell applies and takes its controls out of the Tab order again. `sorts`: an
 * Enter the part does not take is left to the grid (a column header sorts). The one tab stop at
 * each paint is the caller's (`tab(cell, -1)` unless the focus is inside).
 */
export function cellKeys(g: GridContext<unknown>, sel: string, at: (cell: HTMLElement) => CellPart | null | undefined, tab: (cell: HTMLElement, i: number) => void, sorts?: boolean): void {
  g.scope.on(g.el.header, 'keydown', (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    const cell = t.closest<HTMLElement>(sel);
    const m = cell && at(cell);
    if (!m) return;
    if (t === cell) {
      if ((e.key !== 'Enter' && e.key !== 'F2') || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      tab(cell, 0);
      if (!m.focus() && (tab(cell, -1), sorts && e.key === 'Enter')) return;
      e.preventDefault();
      e.stopPropagation();
    } else if (e.key === 'Escape') {
      // Back to the cell, the edit kept; never to a host dialog around the grid.
      e.stopPropagation();
      if (!composing(e)) e.preventDefault(), m.flush(), cell!.focus();
    } else if (e.key === 'Enter' && !composing(e)) m.flush();
  });
  // The focus leaving the cell: its edit applied, its controls out of the Tab order again.
  g.scope.on(g.el.header, 'focusout', (e: FocusEvent) => {
    const t = e.target as HTMLElement;
    const cell = t.closest<HTMLElement>(sel);
    const to = e.relatedTarget as Node | null;
    const m = cell && at(cell);
    if (!m || t === cell || (to && to !== cell && cell!.contains(to))) return;
    tab(cell!, -1);
    m.flush();
  });
}
