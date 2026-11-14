/**
 * @dzgrid/dom/tooltip (1.12.0, docs/behaviors/tooltips-popovers.md): a tooltip on any element of the page — the grid's
 * own engine, its tones and animations (`@dzgrid/theme/tooltips.css`); `tooltips()`, the grid feature that adds
 * placements, the app's animation and the header buttons' names; and `safeHtml`, the cleaner that lets a tooltip or a
 * popover show HTML (the grid's `tooltips: { html: safeHtml }`).
 */
export { tooltip, type TooltipHandle, type TooltipOptions } from './tooltip/anywhere.js';
export { tooltips } from './tooltip/feature.js';
export { safeHtml } from './tooltip/html.js';
export type { TipContent } from './tooltip/float.js';
export type { TipAnimate, TipAnimateInfo, TipAnimation, TipThenable, TipLook, TipSide, TipTone } from './render/tooltip.js';
export type { TooltipPlacement } from '@dzgrid/core';
