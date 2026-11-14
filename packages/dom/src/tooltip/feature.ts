import type { GridContext } from '../context.js';
import type { GridFeature } from '../features.js';
import { enhance } from './engine.js';

const BUTTON = '.dzg-header button[aria-label]';

/**
 * `tooltips()` (1.12.0, docs/behaviors/tooltips-popovers.md; plan Q-T1 B): what the grid's tooltips do beyond the base —
 * `tooltips.placement` and `flip` (and a column's `{ placement }`), `tooltips.animate` (the app's own animation), a
 * closing that waits for the end of the fade, the header's buttons saying their name (`tooltips.header`), and one
 * tooltip on screen at a time with the page's (`tooltip()`).
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
      // Its name already: not described twice.
      g.tipFor = (t) => (on() && t.matches(BUTTON) ? { text: t.getAttribute('aria-label')!, said: true } : undefined);
      return { destroy() {} };
    },
  };
}
