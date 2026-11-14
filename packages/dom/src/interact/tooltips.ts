import { isBlank, type ColumnTooltip, type TooltipSpec } from '@dzgrid/core';
import type { GridContext } from '../context.js';
import type { TipFor } from '../render/tooltip.js';

/** Its text cut (an ellipsis): wider than its box, itself or a box in it (an inline one has no box: client width 0). */
const cut = (el: Element): boolean => (el.clientWidth > 0 && el.scrollWidth > el.clientWidth) || [...el.children].some(cut);

/** Tooltips (D11, tooltips.md): the host's words only, after a delay on hover, at once on a keyboard focus. */
export function installTooltips<T>(g: GridContext<T>): void {
  const { el, columns, rows, rowRenderer, scope, tip } = g;

  function tooltipFor(target: HTMLElement): TipFor | null {
    // A row a feature added under the headers, a group header: not the column header (its tooltips are the
    // feature's); a grid in a detail panel: its own (step 10 review).
    // A cell being edited: its field is what the user reads (step 5; the bubble says a refusal).
    if (target.closest('.dzg') !== el.root || target.closest('.dzg-hextra, .dzg-hgroup, [data-dzg-editing]')) return null;
    // A tooltip feature's own first (a header button's name: tooltips.md 13).
    const mine = tip.seam?.tipFor?.(target);
    if (mine !== undefined) return mine;
    const hcell = target.closest<HTMLElement>('.dzg-hcell');
    if (hcell) {
      const col = hcell.dataset['col'] ? columns.get(hcell.dataset['col']) : undefined;
      // Words, or a spec: its words here, its look for a tooltip feature (tooltips.md 11).
      const h = col?.def.headerTooltip;
      const s = typeof h == 'string' ? { text: h } : h;
      return s?.text ? { ...s, text: s.text, col: col!, row: null, value: null } : null;
    }
    const cell = target.closest<HTMLElement>('.dzg-cell');
    const row = cell?.closest('.dzg-row');
    const key = row ? rowRenderer.keyOf(row) : undefined;
    const col = cell?.dataset['col'] ? columns.get(cell.dataset['col']) : undefined;
    const node = key && col ? rows.row(key) : undefined;
    // A failed save's reason first (S7-O4): read once, through the mark's description.
    const own = node && g.edit?.tip?.(key!, col!.id);
    if (own) return { text: own, col: col!, row: node!.data, value: null, said: true };
    const d = col?.def.tooltip;
    const cells = g.settings.tooltips?.cells;
    // The column's `false`, or the grid's cells silenced; a column that says nothing: none, or its cut text (tooltips.md 10).
    if (!node || d === false || cells === false || (d == null && cells != 'truncated')) return null;
    const o: ColumnTooltip<T> = typeof d == 'function' ? { content: d } : d === true ? {} : d ?? { when: 'truncated' };
    if (o.when == 'truncated' && !cut(cell!)) return null;
    // A host function that throws shows no tooltip; the error is reported.
    try {
      // What the cell shows (an edit's value, step 7), not the row's.
      const raw = g.edit ? g.edit.read(col as never, node.data, key!) : col!.read(node.data);
      const value = isBlank(raw) ? null : col!.codec.coerce(raw, g.ctx);
      let said: string | TooltipSpec | null = null;
      if (o.content && !(said = o.content(value, node.data, g.settings.context))) return null;
      const spec: TooltipSpec = { ...o, ...(typeof said == 'string' ? { text: said } : said) };
      // HTML only through a tooltip feature's cleaner; without one, its words, or nothing.
      const frag = spec.html != null ? tip.seam?.html?.(spec.html, g.doc) ?? null : null;
      // Options without words: the cell as displayed (a function says its own; HTML not drawn: nothing).
      const text = spec.text || frag?.textContent || (typeof d == 'function' || spec.html != null ? '' : cell!.textContent!.trim());
      return text ? { ...spec, text, node: frag, col: col!, row: node.data, value } : null;
    } catch (err) {
      g.report(err);
      return null;
    }
  }

  g.retip = (a) => {
    const found = tooltipFor(a);
    if (found) tip.showFor(a, found, g.dir, 0);
    else tip.hide();
  };
  // A focus that follows a key shows its tooltip at once; one that follows a click does not.
  // A press, or the focus leaving, drops a show still waiting (tooltips.md 12).
  scope.on(el.viewport, 'pointerdown', () => { g.keyboardAt = -1e9; tip.drop(); });
  scope.on(el.viewport, 'focusout', () => tip.drop());
  scope.on(el.viewport, 'focusin', (e: FocusEvent) => {
    const t = e.target as HTMLElement;
    const found = tooltipFor(t);
    if (found && g.now() - g.keyboardAt < 1000) tip.showFor(t, found, g.dir, 0);
    else if (tip.anchor && tip.anchor !== t) tip.hide();
  });
  scope.on(el.viewport, 'pointerover', (e: PointerEvent) => {
    // Never on touch alone (tooltips.md 12): a tap is no hover.
    const t = e.pointerType === 'touch' ? null : (e.target as HTMLElement).closest<HTMLElement>(tip.seam?.targets?.() ?? '.dzg-hcell,.dzg-cell');
    if (!t || t === tip.anchor) return;
    const found = tooltipFor(t);
    // A column's own delay over the grid's.
    if (found) tip.showFor(t, found, g.dir, found.delayMs ?? g.settings.tooltips?.delayMs ?? 500);
    else tip.hideSoon();
  });
  scope.on(el.viewport, 'pointerout', (e: PointerEvent) => {
    const to = e.relatedTarget as Node | null;
    if (to && (el.tooltip.contains(to) || (tip.anchor && tip.anchor.contains(to)))) return;
    tip.hideSoon();
  });
}
