import { isBlank } from '@dzgrid/core';
import type { GridContext } from '../context.js';
import type { TipFor } from '../render/tooltip.js';

/** Tooltips (D11): the host's words only, after a delay on hover, at once on a keyboard focus. */
export function installTooltips<T>(g: GridContext<T>): void {
  const { el, columns, rows, rowRenderer, scope, tip } = g;

  function tooltipFor(target: HTMLElement): TipFor | null {
    // A row a feature added under the headers, a group header: not the column header (its tooltips are the feature's).
    if (target.closest('.dzg-hextra, .dzg-hgroup')) return null;
    const hcell = target.closest<HTMLElement>('.dzg-hcell');
    if (hcell) {
      const col = hcell.dataset['col'] ? columns.get(hcell.dataset['col']) : undefined;
      const text = col?.def.headerTooltip;
      return text ? { text, col: col!, row: null, value: null } : null;
    }
    const cell = target.closest<HTMLElement>('.dzg-cell');
    const row = cell?.closest('.dzg-row');
    const key = row ? rowRenderer.keyOf(row) : undefined;
    const col = cell?.dataset['col'] ? columns.get(cell.dataset['col']) : undefined;
    if (!key || typeof col?.def.tooltip !== 'function') return null;
    const node = rows.row(key);
    if (!node) return null;
    // A host function that throws shows no tooltip; the error is reported.
    try {
      const raw = col.read(node.data);
      const value = isBlank(raw) ? null : col.codec.coerce(raw, g.ctx);
      const text = col.def.tooltip(value, node.data);
      return text ? { text, col, row: node.data, value } : null;
    } catch (err) {
      g.report(err);
      return null;
    }
  }

  // A focus that follows a key shows its tooltip at once; one that follows a click does not.
  scope.on(el.viewport, 'pointerdown', () => { g.keyboardAt = -1e9; });
  scope.on(el.viewport, 'focusin', (e: FocusEvent) => {
    const t = e.target as HTMLElement;
    const found = tooltipFor(t);
    if (found && g.now() - g.keyboardAt < 1000) tip.showFor(t, found, g.dir, 0);
    else if (tip.anchor && tip.anchor !== t) tip.hide();
  });
  scope.on(el.viewport, 'pointerover', (e: PointerEvent) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('.dzg-hcell, .dzg-cell');
    if (!t || t === tip.anchor) return;
    const found = tooltipFor(t);
    if (found) tip.showFor(t, found, g.dir, g.settings.tooltips?.delayMs ?? 500);
    else tip.hideSoon();
  });
  scope.on(el.viewport, 'pointerout', (e: PointerEvent) => {
    const to = e.relatedTarget as Node | null;
    if (to && (el.tooltip.contains(to) || (tip.anchor && tip.anchor.contains(to)))) return;
    tip.hideSoon();
  });
}
