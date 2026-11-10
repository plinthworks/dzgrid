import type { GridContext } from '../context.js';
import type { GridFeature } from '../features.js';
import { setAttr } from '../render/write.js';
import { needHeader } from '../render/header-need.js';

export interface VerticalHeadersOptions {
  /** The header row's height at most, in px (240 by default); a longer title is cut with « … ». */
  readonly maxHeight?: number;
}

/**
 * `verticalHeaders()` (docs/behaviors/vertical-headers.md): the headers of the columns marked `headerVertical: true` say
 * `data-vertical` (the theme turns their title a quarter counter-clockwise), and the column headers' row grows to the
 * longest such title — measured on a hidden probe, once per change of the titles, the row height or the density, never at
 * a scroll — at least a row's height, at most `maxHeight`. Names, roles and keys unchanged.
 *
 * ```ts
 * import { verticalHeaders } from '@dzgrid/dom/vertical-headers';
 * import '@dzgrid/theme/vertical-headers.css';
 * createGrid(host, { …, columns: [{ id: 'jan', header: 'January', headerVertical: true }], features: [verticalHeaders()] });
 * ```
 */
export function verticalHeaders(o: VerticalHeadersOptions = {}): GridFeature {
  const max = (o.maxHeight ?? 0) > 0 ? o.maxHeight! : 240;
  return {
    id: 'vertical-headers',
    setup(x) {
      const g = x as GridContext<unknown>;
      const { doc, el } = g;
      // The probe: a header row's cell turned like the real ones, hidden, out of the flow and of the accessibility tree.
      const probe = doc.createElement('div');
      probe.className = 'dzg-vprobe';
      probe.setAttribute('aria-hidden', 'true');
      // The header rows' text size (`.dzg-hrow`'s), without being one of them.
      Object.assign(probe.style, { position: 'absolute', visibility: 'hidden', pointerEvents: 'none', fontSize: 'var(--dzg-header-size, 1em)' });
      const cell = probe.appendChild(doc.createElement('div'));
      cell.className = 'dzg-hcell';
      cell.setAttribute('data-vertical', '');
      const label = cell.appendChild(doc.createElement('span'));
      label.className = 'dzg-hlabel';
      el.header.append(probe);
      let key = '';
      let need = 0;
      return {
        decorateHeader(col, c) {
          setAttr(c, 'data-vertical', col.def.headerVertical ? '' : null);
        },
        afterRows() {
          const titles = g.columns.visible().filter((c) => c.def.headerVertical).map((c) => c.def.header ?? c.id);
          const h = g.headerHeight();
          const k = `${titles.join('\0')}\0${h}\0${el.root.getAttribute('data-density')}`;
          if (k !== key) {
            key = k;
            let len = 0;
            for (const t of titles) (label.textContent = t), (len = Math.max(len, label.offsetHeight));
            // The title's length and the cell's padding, between the header row's height (`headerHeight`) and the cap.
            need = len && len + 16 > h ? Math.min(max, len + 16) : 0;
          }
          // The column headers' row, the largest of the features' needs (wrapped titles too, header-wrap.md 4).
          needHeader(g, 'vertical', need);
        },
        destroy() {
          probe.remove();
          needHeader(g, 'vertical', 0, true);
          for (const c of el.header.querySelectorAll('[data-vertical]')) c.removeAttribute('data-vertical');
        },
      };
    },
  };
}
