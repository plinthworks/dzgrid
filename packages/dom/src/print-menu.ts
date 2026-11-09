/**
 * `@dzgrid/dom/print-menu` (Phase 11 L5, docs/behaviors/print.md 10): the browser's own print (Ctrl+P, the File menu)
 * prints the same table as `print()` from `@dzgrid/dom/print`. Its own entry: a grid that prints only by its button ships
 * none of it. Its look is `@dzgrid/theme/print.css`, its texts `locales/<lang>-print`.
 */
import type { GridContext } from './context.js';
import { buildNow, type PrintableGrid, type PrintOptions } from './print/index.js';

/**
 * `printOnMenu(grid, options)`: from then on, `beforeprint` builds the print table at once (a table built in slices would
 * be cut at its first slice), unless one is already in the page (`print()`'s, or one the application prepared: that one
 * prints); it is removed as `print()` removes its own (`afterprint`, else the first `focus` or `pointerdown`). It lasts as
 * long as the grid: its destruction ends it.
 *
 * ```ts
 * import { printOnMenu } from '@dzgrid/dom/print-menu';
 * printOnMenu(grid, { title: 'Patients' });
 * ```
 */
export function printOnMenu(grid: PrintableGrid, o?: PrintOptions): void {
  const { win: w, scope } = (grid as unknown as { context: GridContext<unknown> }).context;
  if (w) scope.on(w, 'beforeprint', () => buildNow(grid, o, w));
}
