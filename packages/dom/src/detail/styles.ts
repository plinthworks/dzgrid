/**
 * The detail panels' layout, injected by the feature, not the base: a grid without details carries
 * none. Same rules as `LAYOUT_CSS`: no colour, logical sides only, zero specificity. The content box
 * fills a fixed panel (its own scrollbar when the content is taller) and takes its content's height
 * with `'auto'` (measured). A grid in a panel lets the wheel go on to the grid around it at its edge
 * (the browser's chaining, which the base's `contain` stops for a grid on the page). The master's chevron is the tree's (`.dzg-toggle`, a 24 px target, WCAG
 * 2.5.8), pointing to the inline end when closed and down when open; the theme colours both alike.
 */
export const DETAIL_CSS =
  // In the cascade layer dzgrid.layout, as the base's (owner T1, docs/behaviors/theming.md).
  '@layer dzgrid.layout{' +
  ':where(.dzg-dbody){box-sizing:border-box;block-size:100%;overflow:auto}:where(.dzg-dbody[data-auto]){block-size:auto;overflow:visible}:where(.dzg-dbody>.dzg){box-sizing:border-box;block-size:100%}:where(.dzg-dbody>.dzg>.dzg-viewport){overscroll-behavior:auto}' +
  ':where(.dzg-toggle){display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;inline-size:var(--dzg-target-min,24px);block-size:var(--dzg-target-min,24px);margin-inline-end:.125rem;cursor:pointer}' +
  ':where(.dzg-toggle)::before{content:"\\203a";font-size:1.25em;line-height:1;rotate:var(--dzg-chevron)}' +
  ':where(.dzg-toggle[data-open]){--dzg-chevron:90deg}:where([dir=rtl] .dzg-toggle[data-open]){--dzg-chevron:-90deg}' +
  '}';

/** Once per document or shadow root; a host with a strict CSP passes its nonce or loads it itself. */
export function injectDetailStyles(target: Document | ShadowRoot, nonce?: string): void {
  if (target.querySelector('style[data-dzgrid-detail]')) return;
  const doc = 'createElement' in target ? target : target.ownerDocument;
  const style = doc.createElement('style');
  style.setAttribute('data-dzgrid-detail', '');
  if (nonce) style.setAttribute('nonce', nonce);
  style.textContent = DETAIL_CSS;
  ('head' in target ? target.head : target).append(style);
}
