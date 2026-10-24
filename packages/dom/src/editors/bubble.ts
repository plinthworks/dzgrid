import type { GridContext } from '../context.js';
import { fixedInlineStart, inlineApart } from '../dir.js';
import { describe, setPx } from '../render/write.js';

let ids = 0;

/** The refusal bubble of a grid (edit-validation.md 3; step05-plan 19–21). */
export interface Bubble {
  /** Shows `text` for the open field's cell, named by the field (`aria-describedby`). */
  show(text: string, field: HTMLElement, cell: HTMLElement): void;
  hide(): void;
  /** At each paint while shown: placed again from the cell, hidden while the cell is out of the view. */
  place(): void;
  destroy(): void;
}

/**
 * One bubble per grid, made at the first refusal, beside the grid's tooltip (outside the grid role), in the top
 * layer where the browser has it. Below the cell, above it when there is no room below, at the cell's inline
 * start: never over the cell, so never over its field (WCAG 2.4.11). Rects are read only while it is shown.
 */
export function bubble(g: GridContext<unknown>): Bubble {
  let el: (HTMLElement & { showPopover?: () => void; hidePopover?: () => void }) | null = null;
  let cell: HTMLElement | null = null;
  // While shown: placed again when the page scrolls (any scroller, captured), the window or the visual viewport
  // (a phone's keyboard, a pinch) changes — it never covers the field (review R2).
  const re = (): void => place();
  const watch = (on: boolean): void => {
    const m = on ? 'addEventListener' : 'removeEventListener';
    const w = g.win as (Window & typeof globalThis) | null;
    w?.[m]('scroll', re, true);
    w?.[m]('resize', re);
    w?.visualViewport?.[m]('resize', re);
    w?.visualViewport?.[m]('scroll', re);
  };
  const pop = (on: boolean): void => {
    el!.hidden = !on;
    try {
      on ? el!.showPopover?.() : el!.hidePopover?.();
    } catch {
      /* already so */
    }
  };
  const place = (): void => {
    if (!cell) return;
    const r = cell.getBoundingClientRect();
    const v = g.el.viewport.getBoundingClientRect();
    // Scrolled out of the view (the field stays, contract 5): hidden until the cell comes back.
    const out = r.bottom <= v.top || r.top >= v.bottom || inlineApart(r, v);
    if (out !== el!.hidden) pop(!out);
    if (out) return;
    const box = el!.getBoundingClientRect();
    const below = r.bottom + 4;
    setPx(el!, 'inset-block-start', below + box.height > (g.win?.innerHeight ?? 0) && r.top - 4 - box.height >= 0 ? r.top - 4 - box.height : below);
    setPx(el!, 'inset-inline-start', fixedInlineStart(r, g.dir, g.win?.innerWidth ?? 0, box.width));
  };
  return {
    show(text, field, c) {
      if (!el) {
        el = g.doc.createElement('div');
        el.className = 'dzg-bubble';
        el.id = `dzg-bubble-${++ids}`;
        el.hidden = true;
        if ('showPopover' in el) el.setAttribute('popover', 'manual');
        // A press on the bubble keeps the focus in the field: the text stays, no blur (review R4).
        const keep = (e: Event): void => e.preventDefault();
        el.addEventListener('pointerdown', keep);
        el.addEventListener('mousedown', keep);
        g.el.root.append(el);
      }
      el.textContent = text;
      describe(field, el.id, true);
      if (!cell) watch(true);
      cell = c;
      pop(true);
      place();
    },
    hide() {
      if (cell) watch(false);
      cell = null;
      if (el && !el.hidden) pop(false);
    },
    place,
    destroy() {
      if (cell) watch(false);
      cell = null;
      el?.remove();
    },
  };
}
