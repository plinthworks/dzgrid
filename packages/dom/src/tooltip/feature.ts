import { isBlank, type ColumnTooltip, type TooltipSpec } from '@dzgrid/core';
import type { GridContext } from '../context.js';
import type { GridFeature } from '../features.js';
import type { TipFor } from '../render/tooltip.js';
import { enhance, forget } from './engine.js';

const BUTTON = '.dzg-header button[aria-label]';

/** Its text cut (an ellipsis): wider than its box, itself or a box in it (an inline one has no box: client width 0). */
export const cutText = (el: Element): boolean => (el.clientWidth > 0 && el.scrollWidth > el.clientWidth) || [...el.children].some(cutText);

/**
 * `tooltips()` (1.12.0, docs/behaviors/tooltips-popovers.md; plan Q-T1 B): what the grid's tooltips do beyond the base —
 * `tooltips.placement` and `flip` (and a column's `{ placement }`), `tooltips.animate` (the app's own animation), a
 * closing that waits for the end of the fade, the header's buttons saying their name (`tooltips.header`), one tooltip
 * on screen at a time with the page's (`tooltip()`), and a column's tooltip in one line (21): `tooltip: true`, its
 * options (`when: 'truncated'`, a look, `content` per cell over them), `false`, and the grid's `cells: 'truncated'`.
 *
 * ```ts
 * import { tooltips } from '@dzgrid/dom/tooltip';
 * createGrid(host, { …, tooltips: { header: true, placement: 'top' }, features: [tooltips()] });
 * ```
 */
export function tooltips(): GridFeature {
  return {
    id: 'tooltips',
    setup(x) {
      const g = x as GridContext<unknown>;
      const on = (): boolean => !!g.settings.tooltips?.header;
      enhance(g.tip, 'bottom-start', g.report);
      g.tipSel = () => `${on() ? `${BUTTON},` : ''}.dzg-hcell,.dzg-cell`;

      /** A cell's tooltip: the grid's ← the column's options ← the cell's answer; undefined leaves it to the base. */
      const cellTip = (cell: HTMLElement): TipFor | null | undefined => {
        const r = cell.closest('.dzg-row');
        const key = r && g.rowRenderer.keyOf(r);
        const col = g.columns.get(cell.dataset['col']!);
        const node = key && col && g.rows.row(key);
        const set = g.settings.tooltips ?? {};
        const d = col?.def.tooltip;
        // A failed save's reason, or a column the base answers alone (a function, nothing): the base's.
        if (!node || typeof d == 'function' || g.edit?.tip?.(key, col.id) || (d == null && set.cells != 'truncated')) return undefined;
        const o: ColumnTooltip<unknown> = d === true ? {} : d || { when: 'truncated' };
        if (d === false || set.cells === false || (o.when == 'truncated' && !cutText(cell))) return null;
        let said: string | TooltipSpec | null = null;
        let value: unknown;
        try {
          // What the cell shows (an edit's value), as the base reads it.
          const raw = g.edit ? g.edit.read(col as never, node.data, key) : col.read(node.data);
          value = isBlank(raw) ? null : col.codec.coerce(raw, g.ctx);
          if (o.content && !(said = o.content(value, node.data, g.settings.context))) return null;
        } catch (err) {
          return g.report(err), null;
        }
        const spec: TooltipSpec = { ...o, ...(typeof said == 'string' ? { text: said } : said) };
        // HTML only through the app's cleaner (16); text left out: the cell as displayed.
        const frag = spec.html != null && set.html ? set.html(spec.html, g.doc) : null;
        const text = spec.text || frag?.textContent || cell.textContent!.trim();
        return text ? { ...spec, text, node: frag, col, row: node.data, value } : null;
      };

      g.tipFor = (t) => {
        // Its name already: not described twice.
        if (on() && t.matches(BUTTON)) return { text: t.getAttribute('aria-label')!, said: true };
        const cell = t.closest<HTMLElement>('.dzg-cell');
        return cell ? cellTip(cell) : undefined;
      };
      return { destroy: () => forget(g.tip) };
    },
  };
}
