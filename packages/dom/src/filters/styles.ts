/**
 * The floating row's layout, injected by the filters feature, not the base: a grid without it
 * carries none. Same rules as `LAYOUT_CSS`: no colour, logical sides only, zero specificity.
 * The box takes the cell's width and a target of at least 24 px; its text follows its own
 * direction (`plaintext`, at the start); an unreadable number gets a 2 px outline, not only a
 * colour (the theme colours it). The Clear button is a 24 px square; the summary's text is cut
 * with an ellipsis.
 */
export const FILTERS_CSS =
  ':where(.dzg-hextra){display:flex;align-items:center}' +
  ':where(.dzg-finput){flex:1;min-inline-size:0;block-size:24px;unicode-bidi:plaintext;text-align:start}' +
  ':where(.dzg-finput[aria-invalid=true]){outline:2px solid}' +
  ':where(.dzg-fsum){flex:1;overflow:hidden;text-overflow:ellipsis}' +
  ':where(.dzg-fclear){inline-size:24px;block-size:24px}';

/** Once per document or shadow root, like the base's; a host with a strict CSP passes its nonce or loads it itself. */
export function injectFilterStyles(target: Document | ShadowRoot, nonce?: string): void {
  if (target.querySelector('style[data-dzgrid-filters]')) return;
  const doc = 'createElement' in target ? target : target.ownerDocument;
  const style = doc.createElement('style');
  style.setAttribute('data-dzgrid-filters', '');
  if (nonce) style.setAttribute('nonce', nonce);
  style.textContent = FILTERS_CSS;
  ('head' in target ? target.head : target).append(style);
}
