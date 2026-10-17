import { headerSelection, isSelected } from '@dzgrid/core';
import type { GridContext } from '../context.js';

/** Row selection by pointer (D8), and the select-all box. */
export function installSelect<T>(g: GridContext<T>): { toggleAll(): void } {
  const { el, kernel, rows, rowRenderer, scope } = g;

  /** The select-all box, multi mode only: all displayed rows, or none. */
  function toggleAll(): void {
    if (g.settings.selection?.mode !== 'multi') return;
    const all = headerSelection(kernel.selection, rows.displayed) === 'all';
    kernel.dispatch(all ? { type: 'selection.clear' } : { type: 'selection.allDisplayed' }, 'user');
  }

  // Shift+click extends the rows, not the page's text selection.
  scope.on(el.body, 'mousedown', (e: MouseEvent) => {
    if (e.shiftKey && (g.settings.selection?.mode ?? 'none') === 'multi') e.preventDefault();
  });
  scope.on(el.body, 'click', (e: MouseEvent) => {
    const mode = g.settings.selection?.mode ?? 'none';
    if (mode === 'none') return;
    const t = e.target as HTMLElement;
    const row = t.closest('.dzg-row');
    const key = row ? rowRenderer.keyOf(row) : undefined;
    if (!key) return;
    const onBox = !!t.closest('.dzg-check');
    if (!onBox && g.settings.selection?.click !== true) return;
    const toggle = onBox || (g.mac ? e.metaKey : e.ctrlKey);
    if (mode === 'multi' && e.shiftKey && kernel.anchor === null) kernel.dispatch({ type: 'selection.only', row: key }, 'user');
    else if (mode === 'multi' && e.shiftKey) {
      const r = kernel.dispatch({ type: 'selection.range', target: key, additive: toggle }, 'user');
      if (!r.ok && r.reason === 'anchor-not-displayed') g.live.announce(g.msg('announce.rangeCancelled'));
    } else if (toggle && mode === 'multi') kernel.dispatch({ type: 'selection.toggle', row: key }, 'user');
    else if (toggle && isSelected(kernel.selection, key)) kernel.dispatch({ type: 'selection.clear' }, 'user');
    else kernel.dispatch({ type: 'selection.only', row: key }, 'user');
  });
  return { toggleAll };
}
