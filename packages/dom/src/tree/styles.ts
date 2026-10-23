/**
 * The tree column's layout, injected by the feature, not the base: a grid without a tree carries
 * none. Same rules as `LAYOUT_CSS`: no colour, logical sides only, zero specificity. The toggle is
 * a 24 px target (WCAG 2.5.8); its chevron, drawn with logical borders, points to the inline end
 * when closed (right in French, left in Arabic) and down when open. A leaf keeps the place. The
 * pinned parents' layer sits in the header (sticky, above the body) with no height of its own.
 */
export const TREE_CSS =
  // In the cascade layer dzgrid.layout, as the base's (owner T1, docs/behaviors/theming.md).
  '@layer dzgrid.layout{' +
  ':where(.dzg-toggle){display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;inline-size:var(--dzg-target-min,24px);block-size:var(--dzg-target-min,24px);margin-inline-end:.125rem;cursor:pointer}' +
  ':where(.dzg-toggle)::before{content:"";inline-size:.4em;block-size:.4em;border-block-end:2px solid;border-inline-end:2px solid;rotate:var(--dzg-chevron)}' +
  ':where(.dzg-toggle){--dzg-chevron:-45deg}:where(.dzg-toggle[data-open]){--dzg-chevron:45deg}' +
  ':where([dir=rtl] .dzg-toggle){--dzg-chevron:45deg}:where([dir=rtl] .dzg-toggle[data-open]){--dzg-chevron:-45deg}' +
  ':where(.dzg-toggle[data-leaf]){visibility:hidden;cursor:auto}' +
  // Pinned parents (tree-sticky.md): no height (the header keeps its own), under the header rows, not printed.
  ':where(.dzg-sticky){position:relative;z-index:-1;block-size:0}@media print{:where(.dzg-sticky){display:none}}' +
  '}';

/** Once per document or shadow root; a host with a strict CSP passes its nonce or loads it itself. */
export function injectTreeStyles(target: Document | ShadowRoot, nonce?: string): void {
  if (target.querySelector('style[data-dzgrid-tree]')) return;
  const doc = 'createElement' in target ? target : target.ownerDocument;
  const style = doc.createElement('style');
  style.setAttribute('data-dzgrid-tree', '');
  if (nonce) style.setAttribute('nonce', nonce);
  style.textContent = TREE_CSS;
  ('head' in target ? target.head : target).append(style);
}
