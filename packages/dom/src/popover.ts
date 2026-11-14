/**
 * @dzgrid/dom/popover (1.12.0, docs/behaviors/tooltips-popovers.md 10–15): the bubble that stays — a non-modal dialog
 * by any element of the page or of a grid, placed and animated like the tooltips (`@dzgrid/theme/tooltips.css`).
 */
export { popover, type PopoverCloseReason, type PopoverHandle, type PopoverOptions } from './popover/index.js';
export type { TipContent } from './tooltip/float.js';
export type { TipAnimate, TipAnimateInfo, TipAnimation, TipThenable, TipLook, TipSide, TipTone } from './render/tooltip.js';
export type { TooltipPlacement } from '@dzgrid/core';
