/**
 * The dock's layout, injected by the feature (dock.md 2, 5, 8, 14): no colour (the theme's `dock.css`), logical sides
 * only, zero specificity, in the cascade layer dzgrid.layout. The root keeps the room of each area on its side
 * (`--dzg-dock-start`, `-end`, `-bottom`, written by the feature: the area's size, its strip when collapsed): the rows,
 * the headers, the find bar and the bottom strip take what is left; each area stands in that room, the side ones the
 * whole height, the bottom one between them. The edge is a gutter of 24 px on the rows' side of the area. 30 rem or
 * less: an open side area covers the rows.
 */
export const DOCK_CSS =
  '@layer dzgrid.layout{' +
  ':where(.dzg[data-dzg-dock]){box-sizing:border-box;padding-inline-start:var(--dzg-dock-start,0px);padding-inline-end:var(--dzg-dock-end,0px);padding-block-end:var(--dzg-dock-bottom,0px)}' +
  ':where(.dzg[data-dzg-dock]>.dzg-overlay){inset-inline-start:var(--dzg-dock-start,0px);inset-inline-end:var(--dzg-dock-end,0px);inset-block-end:calc(var(--dzg-footer-size,0px) + var(--dzg-dock-bottom,0px))}' +
  ':where(.dzg-dock){position:absolute;z-index:4;box-sizing:border-box;display:flex;min-inline-size:0;min-block-size:0}' +
  ':where(.dzg-dock[data-area=start]){inset-block:0;inset-inline-start:0;inline-size:var(--dzg-dock-start);flex-direction:row-reverse}' +
  ':where(.dzg-dock[data-area=end]){inset-block:0;inset-inline-end:0;inline-size:var(--dzg-dock-end)}' +
  ':where(.dzg-dock[data-area=bottom]){inset-block-end:0;inset-inline:var(--dzg-dock-start,0px) var(--dzg-dock-end,0px);block-size:var(--dzg-dock-bottom);flex-direction:column}' +
  ':where(.dzg-dock-sep){flex:none;position:relative;inline-size:var(--dzg-target-min,24px);cursor:col-resize;touch-action:none}' +
  ':where([data-area=bottom]>.dzg-dock-sep){inline-size:auto;block-size:var(--dzg-target-min,24px);cursor:row-resize}' +
  ':where(.dzg-dock-sep)::before{content:"";position:absolute;inset-block:0;inset-inline-start:50%;inline-size:1px}' +
  ':where([data-area=bottom]>.dzg-dock-sep)::before{inset-inline:0;inset-block:50% auto;inline-size:auto;block-size:1px}' +
  ':where(.dzg-dock-main){flex:1;display:flex;flex-direction:column;min-inline-size:0;min-block-size:0}' +
  ':where(.dzg-dock-head){flex:none;display:flex;align-items:center;gap:2px;padding:4px;min-inline-size:0}' +
  ':where(.dzg-dock-title,.dzg-dock-tabs){flex:1;min-inline-size:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
  ':where(.dzg-dock-tabs){display:flex;gap:2px}' +
  ':where(.dzg-dock-head button){box-sizing:border-box;min-block-size:var(--dzg-target-min,24px);min-inline-size:var(--dzg-target-min,24px);font:inherit;white-space:nowrap}' +
  ':where(.dzg-dock-tab){flex:0 1 auto;padding-inline:.5rem;overflow:hidden;text-overflow:ellipsis}' +
  ':where(.dzg-dock-body){flex:1;min-block-size:0;overflow:auto}' +
  ':where(.dzg-dock-box){box-sizing:border-box;block-size:100%}' +
  // A panel made for a side of its own fills the area (the filters panel's width).
  ':where(.dzg-dock-box)>.dzg-fpanel{inline-size:auto;block-size:100%}' +
  // Their own title and close button: the area's head says and does it.
  ':where(.dzg-dock-box :is(.dzg-cp-title,.dzg-fp-head)){display:none}' +
  ':where(.dzg-dock[data-collapsed]>.dzg-dock-sep,.dzg-dock[data-collapsed] .dzg-dock-body){display:none}' +
  // Collapsed beside the rows: the head stands along the edge, its words written downward.
  ':where(.dzg-dock[data-collapsed]:not([data-area=bottom]) :is(.dzg-dock-head,.dzg-dock-tabs)){flex-direction:column;padding-inline:0}' +
  ':where(.dzg-dock[data-collapsed]:not([data-area=bottom]) :is(.dzg-dock-title,.dzg-dock-tab)){writing-mode:vertical-rl;flex:none}' +
  ':where(.dzg-dock[hidden],.dzg-dock [hidden]){display:none}' +
  '@media (max-width:30rem){:where(.dzg-dock:not([data-collapsed],[data-area=bottom])){inline-size:auto;inset-inline:0}:where(.dzg-dock:not([data-area=bottom])>.dzg-dock-sep){display:none}}' +
  '}';

/** Once per document or shadow root; a host with a strict CSP passes its nonce or loads it itself. */
export function injectDockStyles(target: Document | ShadowRoot, nonce?: string): void {
  if (target.querySelector('style[data-dzgrid-dock]')) return;
  const doc = 'createElement' in target ? target : target.ownerDocument;
  const style = doc.createElement('style');
  style.setAttribute('data-dzgrid-dock', '');
  if (nonce) style.setAttribute('nonce', nonce);
  style.textContent = DOCK_CSS;
  ('head' in target ? target.head : target).append(style);
}
