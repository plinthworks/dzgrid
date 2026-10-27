/**
 * The collapsible groups' button (Phase 6 step 7, docs/behaviors/header-groups.md 8), injected by `groups()`, not the
 * base nor `spans()`. Same rules as `LAYOUT_CSS`: no colour, logical sides only, zero specificity. A 24 px target at the
 * group header's inline end (WCAG 2.5.8), the label kept clear of it; its chevron a character (U+203A, mirrored right to left; no border an unlayered reset could erase), as the
 * tree's: down when open, toward the inline end when closed (right in French, left in Arabic); `ButtonText` in forced
 * colours.
 */
export const GROUPS_CSS =
  // In the cascade layer dzgrid.layout, as the base's (owner T1, docs/behaviors/theming.md).
  '@layer dzgrid.layout{' +
  ':where(.dzg-hgroup:has(>.dzg-gtoggle)){padding-inline-end:var(--dzg-target-min,24px)}' +
  ':where(.dzg-gtoggle){all:unset;position:absolute;inset-block:0;inset-inline-end:0;margin-block:auto;inline-size:var(--dzg-target-min,24px);block-size:var(--dzg-target-min,24px);display:grid;place-items:center;cursor:pointer;--dzg-gch:90deg}' +
  ':where(.dzg-gtoggle)::before{content:"\\203a";font-size:1.25em;line-height:1;rotate:var(--dzg-gch)}' +
  ':where([dir=rtl] .dzg-gtoggle){--dzg-gch:-90deg}:where(.dzg-gtoggle[aria-expanded=false]){--dzg-gch:0deg}' +
  '@media (forced-colors:active){:where(.dzg-gtoggle){color:ButtonText}}' +
  '}';

/** Once per document or shadow root; a host with a strict CSP passes its nonce or loads it itself. */
export function injectGroupStyles(target: Document | ShadowRoot, nonce?: string): void {
  if (target.querySelector('style[data-dzgrid-groups]')) return;
  const doc = 'createElement' in target ? target : target.ownerDocument;
  const style = doc.createElement('style');
  style.setAttribute('data-dzgrid-groups', '');
  if (nonce) style.setAttribute('nonce', nonce);
  style.textContent = GROUPS_CSS;
  ('head' in target ? target.head : target).append(style);
}
