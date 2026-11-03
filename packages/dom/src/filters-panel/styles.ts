/**
 * The filters panel's layout, injected by the feature (filters-panel.md 2, 3, 16): no colour (the theme's
 * `filters-panel.css`), logical sides only, zero specificity, in the cascade layer dzgrid.layout. The root keeps the room
 * of the strip and of the open panel on its side (`--dzg-fp-room`): the rows, the headers, the find bar and the footer
 * take what is left; the side (strip and panel) stands in that room, the whole height. 30 rem or less: the open panel
 * covers the rows.
 */
export const PANEL_CSS =
  '@layer dzgrid.layout{' +
  ':where(.dzg[data-dzg-fside]){box-sizing:border-box;--dzg-fp-room:var(--dzg-fstrip-size,2rem)}' +
  ':where(.dzg[data-dzg-fopen]){--dzg-fp-room:calc(var(--dzg-fstrip-size,2rem) + var(--dzg-fpanel-size,18rem))}' +
  ':where(.dzg[data-dzg-fside=end]){padding-inline-end:var(--dzg-fp-room)}' +
  ':where(.dzg[data-dzg-fside=start]){padding-inline-start:var(--dzg-fp-room)}' +
  ':where(.dzg[data-dzg-fside=end]>.dzg-overlay){inset-inline-end:var(--dzg-fp-room)}' +
  ':where(.dzg[data-dzg-fside=start]>.dzg-overlay){inset-inline-start:var(--dzg-fp-room)}' +
  ':where(.dzg-fside){position:absolute;inset-block:0;z-index:4;display:flex;max-inline-size:100%}' +
  ':where([data-dzg-fside=end]>.dzg-fside){inset-inline-end:0}' +
  ':where([data-dzg-fside=start]>.dzg-fside){inset-inline-start:0;flex-direction:row-reverse}' +
  ':where(.dzg-fpanel){box-sizing:border-box;flex:none;display:flex;flex-direction:column;gap:.5rem;inline-size:var(--dzg-fpanel-size,18rem);padding:.5rem;overflow-y:auto}' +
  ':where(.dzg-fpanel[hidden]){display:none}' +
    // The strip's button: horizontal itself (its sizes stay the page's), its words written downward.
  ':where(.dzg-fp-toggle){box-sizing:border-box;flex:none;inline-size:var(--dzg-fstrip-size,2rem);padding:.5rem 0;font:inherit;display:flex;flex-direction:column;align-items:center;gap:.5rem}' +
  ':where(.dzg-fp-toggle>span){writing-mode:vertical-rl}' +
  ':where(.dzg-fp-head){display:flex;align-items:center;justify-content:space-between;gap:.5rem}' +
  ':where(.dzg-fp-head button,.dzg-fp-col,.dzg-fp-clear){min-block-size:var(--dzg-target-min,24px);min-inline-size:var(--dzg-target-min,24px);font:inherit}' +
  ':where(.dzg-fp-clear){align-self:start}' +
  ':where(.dzg-fp-q){display:grid;gap:2px}' +
  ':where(.dzg-fp-q input){box-sizing:border-box;inline-size:100%;min-block-size:var(--dzg-target-min,24px);font:inherit}' +
  ':where(.dzg-fp-list){margin:0;padding:0;list-style:none;display:grid;gap:2px}' +
  ':where(.dzg-fp-item[hidden]){display:none}' +
  ':where(.dzg-fp-col){display:flex;align-items:center;gap:.5rem;inline-size:100%;text-align:start}' +
  // The dot: its words out of sight (heard in the button's name), a mark seen in their place.
  ':where(.dzg-fp-dot:not(:empty)){position:relative;inline-size:.5rem;block-size:.5rem;overflow:hidden;white-space:nowrap;color:transparent;flex:none;margin-inline-start:auto;border-radius:50%}' +
  ':where(.dzg-fp-item>[role=group]){padding:.5rem}' +
  // The popup's form in the panel's width: its fields may shrink (a date field's own width would overflow).
  ':where(.dzg-fpanel :is(.dzg-fpop,.dzg-fconds,.dzg-fcond,.dzg-fdate)){grid-template-columns:minmax(0,1fr);min-inline-size:0}' +
  '@media (max-width:30rem){:where(.dzg[data-dzg-fopen]){--dzg-fp-room:var(--dzg-fstrip-size,2rem)}:where(.dzg[data-dzg-fopen]>.dzg-fside){inset-inline:0}:where(.dzg-fside>.dzg-fpanel){flex:1}}' +
  '}';

/** Once per document or shadow root; a host with a strict CSP passes its nonce or loads it itself. */
export function injectPanelStyles(target: Document | ShadowRoot, nonce?: string): void {
  if (target.querySelector('style[data-dzgrid-fpanel]')) return;
  const doc = 'createElement' in target ? target : target.ownerDocument;
  const style = doc.createElement('style');
  style.setAttribute('data-dzgrid-fpanel', '');
  if (nonce) style.setAttribute('nonce', nonce);
  style.textContent = PANEL_CSS;
  ('head' in target ? target.head : target).append(style);
}
