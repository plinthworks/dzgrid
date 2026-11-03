/**
 * The find bar's layout, injected by the feature (find.md 3): no colour (the theme's `find.css`), logical sides only,
 * zero specificity, in the cascade layer dzgrid.layout. One line that wraps on a narrow screen; the field takes the room
 * left; the buttons are 24 px targets (WCAG 2.5.8).
 */
export const FIND_CSS =
  '@layer dzgrid.layout{' +
  ':where(.dzg-find){display:flex;flex-wrap:wrap;align-items:center;gap:.25rem .5rem;padding-block:.25rem;padding-inline:.5rem}' +
  ':where(.dzg-find[hidden],.dzg-find [hidden]){display:none}' +
  ':where(.dzg-find input){flex:0 1 16rem;min-inline-size:6rem;font:inherit}' +
  ':where(.dzg-find button){display:inline-flex;align-items:center;justify-content:center;min-inline-size:var(--dzg-target-min,24px);min-block-size:var(--dzg-target-min,24px);font:inherit;line-height:1}' +
  ':where(.dzg-find-count){min-inline-size:4em;font-variant-numeric:tabular-nums}' +
  '}';

/** Once per document or shadow root; a host with a strict CSP passes its nonce or loads it itself. */
export function injectFindStyles(target: Document | ShadowRoot, nonce?: string): void {
  if (target.querySelector('style[data-dzgrid-find]')) return;
  const doc = 'createElement' in target ? target : target.ownerDocument;
  const style = doc.createElement('style');
  style.setAttribute('data-dzgrid-find', '');
  if (nonce) style.setAttribute('nonce', nonce);
  style.textContent = FIND_CSS;
  ('head' in target ? target.head : target).append(style);
}
