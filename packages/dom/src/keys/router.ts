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
    const cell = (r: number, c: number): FocusPos | null => (lastRow < 0 ? { kind: 'header', column: colAt(c) } : { kind: 'cell', row: d.keyAt(d.index(Math.max(0, Math.min(lastRow, r)))!), column: colAt(c) });
    let to: FocusPos | null = null;
    switch (intent.kind) {
      case 'move':
        // Back from the first header: the select-all box, when there is one.
        if (intent.axis === 'col' && from.kind === 'header' && ci === 0 && intent.delta < 0 && headerRenderer.checkBox) {
          headerRenderer.checkBox.focus({ preventScroll: true });
          return;
        }
        if (intent.axis === 'col') to = from.kind === 'header' ? { kind: 'header', column: colAt(ci + intent.delta) } : cell(ri, ci + intent.delta);
        else if (from.kind === 'header') to = cell(0, ci);
        else to = ri + intent.delta < 0 ? { kind: 'header', column: colAt(ci) } : cell(ri + intent.delta, ci);
        break;
      case 'edge': {
        const c = intent.axis === 'row' ? ci : intent.to === 'first' ? 0 : cols.length - 1;
        if (intent.axis === 'col' && from.kind === 'header') to = { kind: 'header', column: colAt(c) };
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
      case 'sort':
        if (owner === 'header') kernel.dispatch({ type: 'sort.toggle', column: from.column, multi: intent.multi }, 'user');
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
        focus.focusTo(step.axis === 'row' && d.count ? { kind: 'cell', row: d.keyAt(d.index(0)!), column: first.id } : { kind: 'header', column: first.id });
      } else return;
      e.preventDefault();
      return;
    }
    g.intentAt = g.now();
    const owner: KeyOwner = ownerOf(e.target, el.viewport);
    const intent = intentFor(e, { dir: g.dir, owner, mac: g.mac });
    // Space on a header does nothing here, and must not scroll the page either.
    if (!intent && owner === 'header' && (e.key === ' ' || e.key === 'Spacebar')) e.preventDefault();
    if (!intent) return;
    e.preventDefault();
    apply(intent, owner);
  });
}
