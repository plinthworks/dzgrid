/**
 * The advanced filter's layout (advanced-filter.md 10–12, 17), injected by the feature: no colour (the theme's
 * `advanced-filter.css`), logical sides only, zero specificity, in the cascade layer dzgrid.layout. A nested group is
 * indented on its inline start; the forms keep the popup's own layout; their Clear and Apply are the builder's.
 */
export const ADVANCED_FILTER_CSS =
  '@layer dzgrid.layout{' +
  // The groups scroll between the title and the buttons: Apply stays in the window however long the expression.
  ':where(.dzg-adv){box-sizing:border-box;display:grid;grid-template-rows:auto minmax(0,1fr) auto;gap:.5rem;padding:.5rem;min-inline-size:min(32rem,calc(100vw - 2rem));max-inline-size:calc(100vw - 1rem);max-block-size:calc(100vh - 4rem);overflow:hidden}' +
  ':where(.dzg-adv-tree){min-block-size:0;overflow:auto}' +
  ':where(.dzg-adv-title){font-weight:600}' +
  ':where(.dzg-adv-g){display:grid;gap:.5rem;padding:.5rem}' +
  ':where(.dzg-adv-items){margin:0;padding:0;list-style:none;display:grid;gap:.5rem}' +
  ':where(.dzg-adv-items .dzg-adv-g){margin-inline-start:1rem}' +
  ':where(.dzg-adv-join,.dzg-adv-acts,.dzg-adv-foot){display:flex;flex-wrap:wrap;align-items:center;gap:.5rem}' +
  ':where(.dzg-adv-join label){display:inline-flex;align-items:center;gap:.25rem}' +
  ':where(.dzg-adv-c){display:flex;flex-wrap:wrap;align-items:start;gap:.5rem;padding:.5rem}' +
  ':where(.dzg-adv-col){display:grid;gap:2px}' +
  ':where(.dzg-adv-form){flex:1 1 14rem;min-inline-size:0}' +
  ':where(.dzg-adv-form[hidden]){display:none}' +
  ':where(.dzg-adv .dzg-ffoot){display:none}' +
  ':where(.dzg-adv-foot){justify-content:end}' +
  ':where(.dzg-adv button,.dzg-adv select){min-block-size:var(--dzg-target-min,24px);min-inline-size:var(--dzg-target-min,24px);font:inherit}' +
  '}';

/** Once per document or shadow root; a host with a strict CSP passes its nonce or loads it itself. */
export function injectAdvancedStyles(target: Document | ShadowRoot, nonce?: string): void {
  if (target.querySelector('style[data-dzgrid-adv]')) return;
  const doc = 'createElement' in target ? target : target.ownerDocument;
  const style = doc.createElement('style');
  style.setAttribute('data-dzgrid-adv', '');
  if (nonce) style.setAttribute('nonce', nonce);
  style.textContent = ADVANCED_FILTER_CSS;
  ('head' in target ? target.head : target).append(style);
}
