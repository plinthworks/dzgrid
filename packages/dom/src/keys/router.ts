import { intentFor, isSelected, type FocusPos, type Intent, type KeyOwner } from '@dzgrid/core';
import { sameFocus } from '@dzgrid/core/internal';
import type { GridContext } from '../context.js';
import type { MoveFn } from '../features.js';
import type { FocusControl } from './focus.js';
import { moveFocus, type Goal } from './move.js';
import { ownerOf } from './owner.js';
import { rowLayout } from '../render/viewport.js';

/**
 * One keydown on the scroller: who owns the key, what it means (`intentFor`,
 * mirrored in RTL), then a kernel command or a focus move (`moveFocus`).
 */
export function installKeys<T>(g: GridContext<T>, focus: FocusControl<T>, toggleAll: () => void): void {
  const { el, kernel, rows, columns, headerRenderer, scope } = g;

  // Where the user aims (a spanned cell keeps the row and the column they came from), while the
  // focus is the one the keys last set; any other focus (a click, a sort, the host) starts afresh.
  let goal: Goal | null = null;
  let set: FocusPos | null = null;
  function move(from: FocusPos, intent: Intent): void {
    if (!sameFocus(kernel.focus, set)) goal = null;
    // The spans feature moves over spanned cells, and hands the rest back to `moveFocus`.
    const step: MoveFn = g.spans?.move ?? moveFocus;
    const d = rows.displayed;
    const h = g.rowHeight();
    const page = Math.max(1, Math.floor(g.geometry.read().block / h) - 1);
    const L = rowLayout(g);
    const m = step(null, {
      rows: d, cols: columns.visible().map((c) => c.id), page,
      bands: g.bands.length, extras: g.headerRows.length, checkBox: !!headerRenderer.checkBox,
      // A detail is one stop (D8); over rows of their own heights a page is a distance (D7), and at
      // least one row (a row taller than a page is left, never landed on again).
      whole: (i) => d.nodeAt(d.index(i)!).kind === 'detail',
      ...(!L.uniform && { rowAt: (r: number, n: number) => {
        const at = L.indexAt((r < 0 ? -h : L.offsetOf(r as never)) + n * page * h);
        return r < 0 ? at : n > 0 ? Math.max(at, r + 1) : Math.min(at, r - 1);
      } }),
    }, from, goal, intent, moveFocus);
    // A column key on a whole row keeps the focus there, brought back into view as a move would.
    if (!m) return void (from.kind === 'cell' && 'axis' in intent && intent.axis === 'col' && focus.ensureVisible(from.row));
    goal = m.goal;
    if (m.to === 'checkBox') headerRenderer.checkBox!.focus({ preventScroll: true });
    else focus.focusTo(m.to);
    set = kernel.focus;
  }

  function apply(intent: Intent, owner: KeyOwner): void {
    const from = focus.current();
    if (!from) return;
    switch (intent.kind) {
      case 'move':
      case 'edge':
      case 'page':
        return move(from, intent);
      case 'toggleSelect': {
        const mode = g.settings.selection?.mode ?? 'none';
        if (from.kind !== 'cell' || mode === 'none') return;
        // Single: Space selects this row alone, or clears it.
        if (mode === 'single') kernel.dispatch(isSelected(kernel.selection, from.row) ? { type: 'selection.clear' } : { type: 'selection.only', row: from.row }, 'user');
        else kernel.dispatch({ type: 'selection.toggle', row: from.row }, 'user');
        return;
      }
      case 'selectAll':
        if (g.settings.selection?.mode === 'multi') kernel.dispatch({ type: 'selection.all' }, 'user');
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
  }

  scope.on(el.viewport, 'keydown', (e: KeyboardEvent) => {
    // A grid nested in this one (in a detail) has its own keys: a key from it, or one already taken, is not ours.
    if (e.isComposing || e.keyCode === 229 || e.defaultPrevented || (e.target as Element).closest('.dzg') !== el.root) return;
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
    // Up from a lower header row: the row above, a group row above the column headers too
    // (the core's table stops ArrowUp on a header).
    const at = kernel.focus;
    if (owner === 'header' && e.key === 'ArrowUp' && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && at?.kind === 'header' && (at.level ?? 0) > -g.bands.length) {
      e.preventDefault();
      move(at, { kind: 'move', axis: 'row', delta: -1 });
      return;
    }
    // A feature's own meaning of the key first (a tree's arrows on its column, `*`).
    for (const f of g.features) if (f.keys?.(e, at, owner)) return void e.preventDefault();
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
