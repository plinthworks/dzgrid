import { isSelected } from '@dzgrid/core';
import { emit } from '@dzgrid/core/internal';
import type { GridContext } from '../context.js';

/** Row selection by pointer (D8), and the select-all box. */
export function installSelect<T>(g: GridContext<T>): { toggleAll(): void } {
  const { el, kernel, rows, rowRenderer, scope } = g;

  /**
   * The select-all box, multi mode only: ticked, it clears everything; otherwise it selects all, as
   * the model means it. On pages in the browser (step 17, owner Q1) it acts on the page shown: ticked,
   * it takes the page's rows out of the selection only (other pages keep theirs). Over an all-pages
   * selection (tied everything-except, owner Q4) a page not fully ticked gets its rows ticked again,
   * that page only: they leave the excluded keys (Ctrl+A ticks every row again, `selection.all`).
   */
  function toggleAll(): void {
    if (g.settings.selection?.mode !== 'multi') return;
    const all = kernel.headerState === 'all';
    if (rows.page && rows.selectAll === 'displayed' && (all || kernel.selectionScope)) {
      const s = kernel.selection;
      const keys = new Set(s.keys);
      const d = rows.displayed;
      // Out of an include set, or out of the exclusions (re-ticked); into them (unticked).
      const out = (s.mode === 'include') === all;
      for (let i = 0; i < d.count; i++) {
        const k = d.keyAt(d.index(i)!);
        if (out) keys.delete(k);
        else keys.add(k);
      }
      kernel.dispatch({ type: 'selection.set', selection: { mode: s.mode, keys } }, 'user');
    } else kernel.dispatch(all ? { type: 'selection.clear' } : { type: 'selection.all' }, 'user');
  }

  // Shift+click extends the rows, not the page's text selection.
  scope.on(el.body, 'mousedown', (e: MouseEvent) => {
    if (e.shiftKey && (g.settings.selection?.mode ?? 'none') === 'multi') e.preventDefault();
  });
  scope.on(el.body, 'click', (e: MouseEvent) => {
    const t = e.target as HTMLElement;
    const row = t.closest('.dzg-row');
    // A cell spanning rows: the row under the pointer (the spans feature knows it).
    const key = g.spans?.at(e) ?? (row ? rowRenderer.keyOf(row) : undefined);
    if (!key) return;
    // Which row and cell, by identity (the host's handlers never see positions).
    const node = rows.row(key);
    const column = t.closest<HTMLElement>('.dzg-cell')?.dataset['col'];
    if (node) {
      if (column) emit(kernel, { type: 'cellClicked', source: 'user', row: node, column });
      emit(kernel, { type: 'rowClicked', source: 'user', row: node });
    }
    const mode = g.settings.selection?.mode ?? 'none';
    if (mode === 'none') return;
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
