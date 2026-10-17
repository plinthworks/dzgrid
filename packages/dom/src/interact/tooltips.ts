import { isBlank } from '@dzgrid/core';
import type { GridContext } from '../context.js';

/** Tooltips (D11): the host's words only, after a delay on hover, at once on a keyboard focus. */
export function installTooltips<T>(g: GridContext<T>): void {
  const { el, columns, rows, rowRenderer, scope, tip } = g;

  function tooltipFor(target: HTMLElement): string | null {
    const hcell = target.closest<HTMLElement>('.dzg-hcell');
    if (hcell) {
      const col = hcell.dataset['col'] ? columns.get(hcell.dataset['col']) : undefined;
      return col?.def.headerTooltip ?? null;
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
      return col.def.tooltip(value, node.data) ?? null;
    } catch (err) {
      g.report(err);
      return null;
    }
  }

  // A focus that follows a key shows its tooltip at once; one that follows a click does not.
  scope.on(el.viewport, 'pointerdown', () => { g.keyboardAt = -1e9; });
  scope.on(el.viewport, 'focusin', (e: FocusEvent) => {
    const t = e.target as HTMLElement;
    const text = tooltipFor(t);
    if (text && g.now() - g.keyboardAt < 1000) tip.showFor(t, text, g.dir, 0);
    else if (tip.anchor && tip.anchor !== t) tip.hide();
  });
  scope.on(el.viewport, 'pointerover', (e: PointerEvent) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('.dzg-hcell, .dzg-cell');
    if (!t || t === tip.anchor) return;
    const text = tooltipFor(t);
    if (text) tip.showFor(t, text, g.dir, g.settings.tooltips?.delayMs ?? 500);
    else tip.hideSoon();
  });
  scope.on(el.viewport, 'pointerout', (e: PointerEvent) => {
    const to = e.relatedTarget as Node | null;
    if (to && (el.tooltip.contains(to) || (tip.anchor && tip.anchor.contains(to)))) return;
    tip.hideSoon();
  });
}
