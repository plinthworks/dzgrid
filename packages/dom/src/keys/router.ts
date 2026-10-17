import { intentFor, isSelected, type FocusPos, type Intent, type KeyOwner } from '@dzgrid/core';
import type { GridContext } from '../context.js';
import type { FocusControl } from './focus.js';
import { ownerOf } from './owner.js';

/**
 * One keydown on the scroller: who owns the key, what it means (`intentFor`,
 * mirrored in RTL), then a kernel command or a focus move.
 */
export function installKeys<T>(g: GridContext<T>, focus: FocusControl<T>, toggleAll: () => void): void {
  const { el, kernel, rows, columns, headerRenderer, scope } = g;

  function apply(intent: Intent, owner: KeyOwner): void {
    const from = focus.current();
    if (!from) return;
    const d = rows.displayed;
    const cols = columns.visible();
    const ci = Math.max(0, cols.findIndex((c) => c.id === from.column));
    const ri = from.kind === 'cell' ? d.indexOf(from.row) : -1;
    const lastRow = d.count - 1;
    const page = Math.max(1, Math.floor(g.geometry.read().block / g.rowHeight()) - 1);
    const colAt = (i: number) => cols[Math.max(0, Math.min(cols.length - 1, i))]!.id;
    const header = (column: string, level?: number): FocusPos => (level ? { kind: 'header', column, level } : { kind: 'header', column });
    // No rows: a move into the body stays in the header row it comes from.
    const cell = (r: number, c: number): FocusPos | null => (lastRow < 0 ? header(colAt(c), from.kind === 'header' ? from.level : undefined) : { kind: 'cell', row: d.keyAt(d.index(Math.max(0, Math.min(lastRow, r)))!), column: colAt(c) });
    let to: FocusPos | null = null;
    switch (intent.kind) {
      case 'move':
        // Down through the header rows, then the body; up from the body to the last header row.
        if (intent.axis === 'row' && from.kind === 'header' && (from.level ?? 0) < g.headerRows.length) {
          to = { kind: 'header', column: from.column, level: (from.level ?? 0) + 1 };
          break;
        }
        if (intent.axis === 'row' && from.kind === 'cell' && ri === 0 && intent.delta < 0 && g.headerRows.length) {
          to = { kind: 'header', column: from.column, level: g.headerRows.length };
          break;
        }
        // Back from the first header: the select-all box, when there is one.
        if (intent.axis === 'col' && from.kind === 'header' && !from.level && ci === 0 && intent.delta < 0 && headerRenderer.checkBox) {
          headerRenderer.checkBox.focus({ preventScroll: true });
          return;
        }
        if (intent.axis === 'col') to = from.kind === 'header' ? header(colAt(ci + intent.delta), from.level) : cell(ri, ci + intent.delta);
        else if (from.kind === 'header') to = cell(0, ci);
        else to = ri + intent.delta < 0 ? { kind: 'header', column: colAt(ci) } : cell(ri + intent.delta, ci);
        break;
      case 'edge': {
        const c = intent.axis === 'row' ? ci : intent.to === 'first' ? 0 : cols.length - 1;
        if (intent.axis === 'col' && from.kind === 'header') to = header(colAt(c), from.level);
        else to = cell(intent.axis === 'col' ? ri : intent.to === 'first' ? 0 : lastRow, c);
        break;
      }
      case 'page':
        to = from.kind === 'header' ? cell(page - 1, ci) : cell(ri + intent.delta * page, ci);
        break;
      case 'toggleSelect': {
        const mode = g.settings.selection?.mode ?? 'none';
        if (from.kind !== 'cell' || mode === 'none') return;
        // Single: Space selects this row alone, or clears it.
        if (mode === 'single') kernel.dispatch(isSelected(kernel.selection, from.row) ? { type: 'selection.clear' } : { type: 'selection.only', row: from.row }, 'user');
        else kernel.dispatch({ type: 'selection.toggle', row: from.row }, 'user');
        return;
      }
      case 'selectAll':
        if (g.settings.selection?.mode === 'multi') kernel.dispatch({ type: 'selection.allDisplayed' }, 'user');
        return;
      case 'enter': {
        // Into the cell's widget: the part takes the focus, or the cell keeps it.
        if (from.kind === 'cell') g.rowRenderer.partAt(from.row, from.column)?.focus?.();
        return;
      }
      case 'leave':
        // Out of a widget, back to its cell.
        focus.focusTo(from);
        return;
      case 'sort':
        // Only a column header sorts; a cell of a row a feature added (a filter) does not.
        if (owner === 'header' && from.kind === 'header' && !from.level) kernel.dispatch({ type: 'sort.toggle', column: from.column, multi: intent.multi }, 'user');
        return;
    }
    if (to) focus.focusTo(to);
  }

  scope.on(el.viewport, 'keydown', (e: KeyboardEvent) => {
    if (e.isComposing || e.keyCode === 229) return;
    g.keyboardAt = g.now();
    if (e.key === 'Escape' && !g.el.tooltip.hidden) {
      g.tip.hide();
      return;
    }
    // The select-all box: a checkbox (Space, Enter), before the first header in reading order.
    const t = e.target as HTMLElement;
    if (headerRenderer.checkBox && t === headerRenderer.checkBox) {
      const step = intentFor(e, { dir: g.dir, owner: 'header', mac: g.mac });
      const first = columns.visible()[0];
      if (e.key === ' ' || e.key === 'Enter') toggleAll();
      else if (first && step?.kind === 'move' && step.delta > 0) {
        const d = rows.displayed;
        // Down: the next header row when a feature added one, the first row otherwise.
        const down: FocusPos = g.headerRows.length ? { kind: 'header', column: first.id, level: 1 } : d.count ? { kind: 'cell', row: d.keyAt(d.index(0)!), column: first.id } : { kind: 'header', column: first.id };
        focus.focusTo(step.axis === 'row' ? down : { kind: 'header', column: first.id });
      } else return;
      e.preventDefault();
      return;
    }
    g.intentAt = g.now();
    const owner: KeyOwner = ownerOf(e.target, el.viewport);
    // Up from a lower header row: the row above (the core's table stops ArrowUp on a header).
    const at = kernel.focus;
    if (owner === 'header' && e.key === 'ArrowUp' && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && at?.kind === 'header' && (at.level ?? 0) > 0) {
      e.preventDefault();
      focus.focusTo(at.level === 1 ? { kind: 'header', column: at.column } : { kind: 'header', column: at.column, level: at.level! - 1 });
      return;
    }
    const intent = intentFor(e, { dir: g.dir, owner, mac: g.mac });
    // Space on a header does nothing here, and must not scroll the page either.
    if (!intent && owner === 'header' && (e.key === ' ' || e.key === 'Spacebar')) e.preventDefault();
    if (!intent) return;
    // Enter on a cell is the grid's only when a part there can take the focus; the host's otherwise.
    if (intent.kind === 'enter' && !(at?.kind === 'cell' && g.rowRenderer.partAt(at.row, at.column)?.focus)) return;
    e.preventDefault();
    apply(intent, owner);
  });
}
