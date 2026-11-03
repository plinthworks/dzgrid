/**
 * The status bar's layout, injected by the feature (`PAGINATION_CSS`'s rules): no colour (`.dzg-footer`'s, from the
 * theme), logical sides only, zero specificity. The strip as the pager lays it out (alone, it lays itself out); the
 * group takes the room left, the row counts at its start, the figures pushed to its end; it keeps a target's height
 * when empty, so nothing jumps when a block appears; it wraps on a narrow screen.
 */
export const STATUS_CSS =
  '@layer dzgrid.layout{' +
  ':where(.dzg-footer){display:flex;flex-wrap:wrap;align-items:center;gap:.25rem 1rem;min-inline-size:0}' +
  ':where(.dzg-status){display:flex;flex-wrap:wrap;align-items:center;gap:.25rem 1rem;flex:1 1 auto;min-block-size:var(--dzg-target-min,24px)}' +
  ':where(.dzg-status>[data-at=end]){margin-inline-start:auto}' +
  ':where(.dzg-status [hidden],.dzg-status>:has(>[hidden]:only-child)){display:none}' +
  '}';

/** Once per document or shadow root; a host with a strict CSP passes its nonce or loads it itself. */
export function injectStatusStyles(target: Document | ShadowRoot, nonce?: string): void {
  if (target.querySelector('style[data-dzgrid-status]')) return;
  const doc = 'createElement' in target ? target : target.ownerDocument;
  const style = doc.createElement('style');
  style.setAttribute('data-dzgrid-status', '');
  if (nonce) style.setAttribute('nonce', nonce);
  style.textContent = STATUS_CSS;
  ('head' in target ? target.head : target).append(style);
}
