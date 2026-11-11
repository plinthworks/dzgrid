import { problem } from '@dzgrid/core';
import { emit } from '@dzgrid/core/internal';
import type { GridContext } from '../context.js';
import type { GridFeature } from '../features.js';
import { widthOf } from '../render/header-decor.js';
import { needHeader } from '../render/header-need.js';
import { setAttr } from '../render/write.js';

export interface WrappedHeadersOptions {
  /** The lines a title may take, 1 to 10 (3 by default); past them its last line ends with « … ». */
  readonly maxLines?: number;
}

/**
 * The wrapped titles' layout, injected by the feature (a grid without it carries none). Same rules as `LAYOUT_CSS`: no
 * colour, logical sides only, zero specificity. The title breaks between words (inside a word longer than the column),
 * clamped to `--dzg-header-lines` lines; a little room above and below so two lines never touch the row's edges.
 */
export const WRAPPED_HEADERS_CSS =
  '@layer dzgrid.layout{' +
  ':where(.dzg-hcell[data-hwrap]){padding-block:.25rem}' +
  ':where(.dzg-hcell[data-hwrap]>.dzg-hlabel){white-space:normal;overflow-wrap:break-word;overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:var(--dzg-header-lines,3)}' +
  '}';

/**
 * `wrappedHeaders()` (docs/behaviors/header-wrap.md, 1.10.0): the headers of the columns marked `headerWrap: true` say
 * `data-hwrap` (their title on several lines, at most `maxLines`), and the column headers' row grows to the tallest such
 * title — measured on hidden copies of the header cells at their columns' widths, all written then all read, once per
 * change of the titles, the widths, the text size, the density or the direction; never at a scroll. Names, roles and
 * keys unchanged.
 *
 * ```ts
 * import { wrappedHeaders } from '@dzgrid/dom/wrapped-headers';
 * createGrid(host, { …, columns: [{ id: 'days', header: 'Average delivery time in days', width: 90, headerWrap: true }], features: [wrappedHeaders()] });
 * ```
 */
/**
 * A title cut at the cap (header-wrap.md 11, 1.11.0): `data-hclamp` on its cell, its label set at the start — Chrome draws
 * the « … » of a clamped line aligned at the end past the label's edge. Inline, so a host loading `WRAPPED_HEADERS_CSS`
 * itself gets it too.
 */
function markCut(cell: HTMLElement | null | undefined, on: boolean): void {
  const label = cell?.querySelector<HTMLElement>('.dzg-hlabel');
  if (label) setAttr(cell!, 'data-hclamp', on ? '' : null), label.style.setProperty('text-align', on ? 'start' : '');
}

export function wrappedHeaders(o: WrappedHeadersOptions = {}): GridFeature {
  const ok = Number.isInteger(o.maxLines) && o.maxLines! >= 1 && o.maxLines! <= 10;
  const lines = ok ? o.maxLines! : 3;
  return {
    id: 'wrapped-headers',
    setup(x) {
      const g = x as GridContext<unknown>;
      const { doc, el } = g;
      if (o.maxLines !== undefined && !ok) emit(g.kernel, { type: 'problems', source: 'host', problems: [problem('invalid-setting', 'warning', 'wrappedHeaders.maxLines', String(o.maxLines))] });
      const root = el.root.getRootNode() as Document | ShadowRoot;
      if (g.settings.injectStyles !== false && !root.querySelector('style[data-dzgrid-hwrap]')) {
        const style = doc.createElement('style');
        style.setAttribute('data-dzgrid-hwrap', '');
        if (g.settings.nonce) style.setAttribute('nonce', g.settings.nonce);
        style.textContent = WRAPPED_HEADERS_CSS;
        ('head' in root ? root.head : root).append(style);
      }
      el.root.style.setProperty('--dzg-header-lines', String(lines));
      // The copies' place: in the header (its font, weight and direction), out of the flow and of the accessibility tree.
      const probe = doc.createElement('div');
      probe.className = 'dzg-wprobe';
      probe.setAttribute('aria-hidden', 'true');
      Object.assign(probe.style, { position: 'absolute', insetBlockStart: '0', visibility: 'hidden', pointerEvents: 'none', fontSize: 'var(--dzg-header-size, 1em)' });
      el.header.append(probe);
      let key = '';
      let need = 0;
      /** The columns whose title is cut at the cap, read on the copies. */
      let cut = new Set<string>();
      return {
        decorateHeader(col, c) {
          setAttr(c, 'data-hwrap', col.def.headerWrap ? '' : null);
          markCut(c, cut.has(col.id));
        },
        afterRows() {
          const cols = g.columns.visible().filter((c) => c.def.headerWrap);
          const h = g.headerHeight();
          const k = JSON.stringify([cols.map((c) => [c.id, c.def.header, widthOf(g, c.id)]), h, g.remPx, g.dir, el.root.getAttribute('data-density')]);
          if (k !== key) {
            key = k;
            // A shown header cell as the model (its sort mark and buttons take the same room in every column); else a bare one.
            const model = cols.map((c) => g.headerRenderer.cell(c.id)).find(Boolean);
            const copies = cols.map((c) => {
              const own = g.headerRenderer.cell(c.id);
              const cell = (own ?? model)?.cloneNode(true) as HTMLElement | undefined ?? doc.createElement('div');
              cell.className = 'dzg-hcell';
              cell.setAttribute('data-hwrap', '');
              for (const a of ['id', 'tabindex', 'role', 'style']) cell.removeAttribute(a);
              let label = cell.querySelector<HTMLElement>('.dzg-hlabel');
              if (!label) (label = cell.appendChild(doc.createElement('span'))), (label.className = 'dzg-hlabel');
              if (!own) label.textContent = c.def.header ?? c.id;
              cell.style.setProperty('inline-size', `${widthOf(g, c.id)}px`);
              return probe.appendChild(cell);
            });
            // All written, then all read (one layout), then all removed. A label taller than it shows: cut at the cap.
            const tall = Math.max(0, ...copies.map((c) => c.offsetHeight));
            cut = new Set(cols.filter((_, i) => { const l = copies[i]!.querySelector('.dzg-hlabel')!; return l.scrollHeight > l.clientHeight + 1; }).map((c) => c.id));
            for (const c of copies) c.remove();
            need = tall > h ? tall : 0;
            for (const c of cols) markCut(g.headerRenderer.cell(c.id), cut.has(c.id));
          }
          needHeader(g, 'wrapped', need);
        },
        destroy() {
          probe.remove();
          needHeader(g, 'wrapped', 0, true);
          el.root.style.removeProperty('--dzg-header-lines');
          for (const c of el.header.querySelectorAll<HTMLElement>('[data-hwrap]')) c.removeAttribute('data-hwrap'), markCut(c, false);
        },
      };
    },
  };
}
