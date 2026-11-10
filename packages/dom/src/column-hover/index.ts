import type { GridContext } from '../context.js';
import type { GridFeature } from '../features.js';
import { setAttr } from '../render/write.js';

/**
 * The tint's rule, injected by the feature (a grid without it carries none): the column's cells and header take
 * `--dzg-column-hover-bg` as a layer over their own surface (a translucent tint keeps an alternate, hovered or selected
 * row's colour under it); unset, nothing is drawn. In `dzgrid.skin`, after the theme's surfaces; the focused cell keeps
 * its own look. No colour of its own, no side.
 */
export const COLUMN_HOVER_CSS =
  '@layer dzgrid.skin{.dzg-cell[data-col-hover]:not(:focus),.dzg-hcell[data-col-hover]{background-image:linear-gradient(var(--dzg-column-hover-bg),var(--dzg-column-hover-bg))}}';

/**
 * `columnHover()` (docs/behaviors/column-hover.md, 1.10.0): the column under the mouse or the pen — never the keyboard's
 * focus, never a finger — says `data-hover-col` on the grid's root and `data-col-hover` on its mounted cells and header,
 * written at most once per frame and only when the column changes; attributes only, no layout or style read.
 *
 * ```ts
 * import { columnHover } from '@dzgrid/dom/column-hover';
 * createGrid(host, { …, features: [columnHover()] });
 * // .dzg { --dzg-column-hover-bg: color-mix(in srgb, var(--tz-accent) 8%, transparent); }
 * ```
 */
export function columnHover(): GridFeature {
  return {
    id: 'column-hover',
    setup(x) {
      const g = x as GridContext<unknown>;
      const { doc, el, scope } = g;
      const raf = g.env.raf ?? g.win;
      const root = el.root.getRootNode() as Document | ShadowRoot;
      if (g.settings.injectStyles !== false && !root.querySelector('style[data-dzgrid-hover]')) {
        const style = doc.createElement('style');
        style.setAttribute('data-dzgrid-hover', '');
        if (g.settings.nonce) style.setAttribute('nonce', g.settings.nonce);
        style.textContent = COLUMN_HOVER_CSS;
        ('head' in root ? root.head : root).append(style);
      }
      /** The column shown as hovered, and the one the pointer is over now (written at the next frame). */
      let shown: string | null = null;
      let next: string | null = null;
      let frame = 0;
      /** Every mounted cell of the grid marked or not (attributes only). */
      const mark = (): void => {
        setAttr(el.root, 'data-hover-col', shown);
        for (const c of el.root.querySelectorAll<HTMLElement>('.dzg-cell[data-col], .dzg-hcell[data-col]')) setAttr(c, 'data-col-hover', shown !== null && c.dataset['col'] === shown && !c.classList.contains('dzg-hgroup') ? '' : null);
      };
      const want = (id: string | null): void => {
        next = id;
        if (!frame && raf) frame = raf.requestAnimationFrame(() => {
          frame = 0;
          if (next !== shown) (shown = next), mark();
        });
      };
      scope.on(el.root, 'pointerover', (e: PointerEvent) => {
        if (e.pointerType == 'touch') return;
        want((e.target as Element).closest?.<HTMLElement>('.dzg-cell[data-col], .dzg-hcell[data-col]:not(.dzg-hgroup)')?.dataset['col'] ?? null);
      });
      scope.on(el.root, 'pointerleave', () => want(null));
      return {
        // A paint while a column is hovered (a scroll, new rows): the cells it mounted, marked.
        afterRows: () => void (shown !== null && mark()),
        destroy() {
          if (frame && raf) raf.cancelAnimationFrame(frame);
          shown = null;
          mark();
        },
      };
    },
  };
}
