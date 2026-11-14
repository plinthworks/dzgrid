/** The pager's marks an app's icon replaces (`icons.pagerFirst`…): each only under its own name. */
const PG = ['first', 'previous', 'next', 'last'];
const MARKS = PG.map((n) => `[data-dzg-icons~=pager-${n}] [data-go=${n == 'previous' ? 'prev' : n}]>span`);
const PAGER = MARKS.join();

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
  // The app's icons for the marks (`icons.pagerFirst`…, theming() names them on the root; presentation-settings.md 41),
  // each only where given: over its character, kept (its width) but not painted; the button's text size or
  // --dzg-icon-size, its colour (the disabled one too); mirrored in right to left as the characters are.
  `${MARKS.map((s, i) => `:where(${s}){--dzg-i:var(--dzg-icon-pager-${PG[i]})}`).join('')}` +
  `:where(${PAGER}){display:inline-block;inline-size:var(--dzg-icon-size,1em);block-size:var(--dzg-icon-size,1em);vertical-align:-.125em;overflow:hidden;-webkit-text-fill-color:transparent;background:currentColor;-webkit-mask:var(--dzg-i) center/contain no-repeat;mask:var(--dzg-i) center/contain no-repeat}` +
  `:where(:is(${PAGER}):dir(rtl)){scale:-1 1}@media (forced-colors:active){:where(${PAGER}){forced-color-adjust:none;background:ButtonText}}` +
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
