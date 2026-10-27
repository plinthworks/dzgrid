/**
 * The footer's layout, injected by the feature, not the base: a grid without it carries none.
 * Same rules as `LAYOUT_CSS`: no colour, logical sides only, zero specificity. The strip wraps
 * on a narrow screen; the pager goes to the inline end; buttons are 24 px targets, half a rem apart. The arrows are
 * characters in the DOM (pager.ts), not borders: a host's unlayered reset cannot erase them.
 */
export const PAGINATION_CSS =
  // In the cascade layer dzgrid.layout, as the base's (owner T1, docs/behaviors/theming.md).
  '@layer dzgrid.layout{' +
  ':where(.dzg-footer){display:flex;flex-wrap:wrap;align-items:center;gap:.25rem 1rem;min-inline-size:0}' +
  // Half a rem between the pager's buttons and around « Page 1 sur 1 » (owner's second look, app-feedback 24).
  ':where(.dzg-footer>*,.dzg-psel,.dzg-psize){display:flex;flex-wrap:wrap;align-items:center;gap:.5rem}' +
  ':where(.dzg-footer>nav){margin-inline-start:auto}' +
  ':where(.dzg-pbtn){display:inline-flex;align-items:center;justify-content:center;font-size:1.25em;line-height:1;min-inline-size:var(--dzg-target-min,24px);min-block-size:var(--dzg-target-min,24px)}' +
  // After the buttons' display: same zero specificity, the later wins.
  ':where(.dzg-footer [hidden],.dzg-footer>:has(>[hidden]:only-child)){display:none}' +
  '}';

/** Once per document or shadow root; a host with a strict CSP passes its nonce or loads it itself. */
export function injectPaginationStyles(target: Document | ShadowRoot, nonce?: string): void {
  if (target.querySelector('style[data-dzgrid-pagination]')) return;
  const doc = 'createElement' in target ? target : target.ownerDocument;
  const style = doc.createElement('style');
  style.setAttribute('data-dzgrid-pagination', '');
  if (nonce) style.setAttribute('nonce', nonce);
  style.textContent = PAGINATION_CSS;
  ('head' in target ? target.head : target).append(style);
}
