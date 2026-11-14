import type { ResolvedColumn, TooltipSpec } from '@dzgrid/core';
import { fixedInlineStart, type Dir } from '../dir.js';
import { setAttr, setPx } from './rows.js';
import { describe } from './write.js';
import type { Scope } from './scope.js';

let ids = 0;

/**
 * What a grid tooltip shows (tooltips.md): its words, and for a part what it is about (a header: null row and value; a
 * tooltip feature's own, such as a header button's name: no column). The column's or the cell's look (`tone`,
 * `placement`, …) rides along for a feature that draws the tooltips (`TooltipSeam`); the grid's own bubble ignores it.
 */
export interface TipFor extends Omit<TooltipSpec, 'text'> {
  readonly text: string;
  readonly col?: ResolvedColumn<any>;
  readonly row?: Readonly<unknown> | null;
  readonly value?: unknown;
  /** Already the anchor's description or name (a failed save's mark, step 7): the tooltip adds no `aria-describedby`. */
  readonly said?: boolean;
  /** Drawn instead of the words: the cleaned HTML of a column's `{ html }` (`TooltipSeam.html`). */
  readonly node?: DocumentFragment | null;
}

/** What a tooltip feature is told when a grid tooltip shows (`TooltipSeam.show`, tooltips.md 13). */
export interface TooltipShow {
  /** The grid's tooltip element, filled (its words, the cleaned HTML, or a part), still hidden: the feature shows it. */
  readonly el: HTMLElement;
  readonly anchor: HTMLElement;
  readonly tip: TipFor;
  readonly dir: Dir;
  /** Hides it the grid's way (another bubble of the page opening): the grid then calls `hide` below. */
  readonly hide: () => void;
}

/**
 * The seam where a feature takes over the grid's cell and header tooltips (1.12.0, tooltips.md 13; `@dztooltip/dzgrid`
 * is one): a feature's handle gives `tooltips`, the first one wins. The grid still decides when (the hover delay, a
 * keyboard focus, Escape, a press, a scroll, the focus leaving) and what (the column's words, a failed save's reason, a
 * part); the feature decides where and how it shows and hides.
 */
export interface TooltipSeam {
  /** What the pointer is followed on, a selector (the grid's: `.dzg-hcell,.dzg-cell`). Read at each pointer move. */
  targets?(): string;
  /** A target's tooltip, asked before the grid reads it: undefined leaves it to the grid, null shows none. */
  tipFor?(target: HTMLElement): TipFor | null | undefined;
  /** Asked when a hover delay ends: false drops the show. */
  ok?(anchor: HTMLElement): boolean;
  /** Cleans a column's `{ html }` into nodes; without it, a column's HTML shows its `text` or nothing. */
  html?(html: string, doc: Document): DocumentFragment;
  /** Shows the filled element by its anchor: places it, dresses it, animates it. */
  show(s: TooltipShow): void;
  /** Hides it; `done()` once gone (the grid then takes its content out). Returns a cancel: shown again before the end. */
  hide(el: HTMLElement, done: () => void): () => void;
}

/**
 * One tooltip per grid (D11, WCAG 1.4.13): shown after a delay on hover or at
 * once on keyboard focus; the pointer may move onto it; Escape dismisses it;
 * it stays until then. Only the host's text, never the cell's content guessed.
 */
export class Tooltip {
  readonly el: HTMLElement;
  #anchor: HTMLElement | null = null;
  /** The row the shown tooltip is about (null: a header's). */
  row: unknown = null;
  /** The shown tooltip is the cell's own (a failed save's reason, step 7): hidden at the paint where it no longer is. */
  said = false;
  #cancelShow: (() => void) | null = null;
  #cancelHide: (() => void) | null = null;
  #closing: (() => void) | null = null;
  readonly #scope: Scope;
  /** A feature drawing the tooltips (tooltips.md 13); none: the grid's own bubble. */
  seam: TooltipSeam | undefined;
  /** A part's turn to draw the content (true: it did); told null at hide. */
  readonly #fill: ((t: TipFor | null) => boolean) | undefined;

  constructor(el: HTMLElement, scope: Scope, fill?: (t: TipFor | null) => boolean) {
    this.el = el;
    this.el.id ||= `dzg-tip-${++ids}`;
    this.#scope = scope;
    this.#fill = fill;
    scope.on(el, 'pointerenter', () => this.#keep());
    scope.on(el, 'pointerleave', (e: PointerEvent) => {
      if (!this.#anchor || !this.#anchor.contains(e.relatedTarget as Node | null)) this.hideSoon();
    });
  }

  get anchor(): HTMLElement | null {
    return this.#anchor;
  }

  /** After `delay` ms (0: now), unless something else is shown or hidden first. */
  showFor(anchor: HTMLElement, tip: TipFor, dir: Dir, delay: number): void {
    this.#keep();
    this.drop();
    if (delay <= 0) return this.#show(anchor, tip, dir);
    this.#cancelShow = this.#scope.timeout(() => {
      this.#cancelShow = null;
      // Still on the page, and still wanted (the seam's say).
      if (anchor.isConnected && this.seam?.ok?.(anchor) !== false) this.#show(anchor, tip, dir);
    }, delay);
  }

  /** Drops a show waiting for its delay (a press, Escape, the focus leaving: tooltips.md 12). */
  drop(): void {
    this.#cancelShow?.();
    this.#cancelShow = null;
  }

  /** A short grace, so the pointer can cross the gap onto the tooltip. */
  hideSoon(): void {
    this.drop();
    if (this.#cancelHide || this.el.hidden || !this.#anchor) return;
    this.#cancelHide = this.#scope.timeout(() => {
      this.#cancelHide = null;
      this.hide();
    }, 150);
  }

  hide(): void {
    this.drop();
    this.#keep();
    const was = this.#anchor;
    if (was) describe(was, this.el.id, false);
    this.#anchor = null;
    // A feature's closing (its animation awaited): the part goes once it is over.
    if (this.seam && was && !this.el.hidden) {
      this.#closing = this.seam.hide(this.el, () => {
        this.#closing = null;
        this.#fill?.(null);
      });
      return;
    }
    this.el.hidden = true;
    // A hidden tooltip keeps no part, and so no row.
    this.#fill?.(null);
    const el = this.el as HTMLElement & { hidePopover?: () => void };
    if (el.hasAttribute('popover') && typeof el.hidePopover === 'function') {
      try {
        el.hidePopover();
      } catch {
        /* already hidden */
      }
    }
  }

  #keep(): void {
    this.#cancelHide?.();
    this.#cancelHide = null;
  }

  #show(anchor: HTMLElement, tip: TipFor, dir: Dir): void {
    this.#closing?.();
    this.#closing = null;
    if (this.#anchor && this.#anchor !== anchor) describe(this.#anchor, this.el.id, false);
    this.#anchor = anchor;
    this.row = tip.row ?? null;
    this.said = !!tip.said;
    // Drawn before it is measured: its size is the part's. Cleaned HTML: its nodes.
    if (!this.#fill?.(tip)) {
      if (tip.node) this.el.replaceChildren(tip.node);
      else this.el.textContent = tip.text;
    }
    // A feature draws it (tooltips.md 13): described here, shown, placed and animated there.
    const seam = this.seam;
    if (seam) return describe(anchor, this.el.id, !tip.said), seam.show({ el: this.el, anchor, tip, dir, hide: () => this.hide() });
    this.el.hidden = false;
    // The top layer where the browser has it: no host ancestor can clip or trap the tooltip.
    const el = this.el as HTMLElement & { showPopover?: () => void };
    if (typeof el.showPopover === 'function') {
      if (!el.hasAttribute('popover')) el.setAttribute('popover', 'manual');
      try {
        el.showPopover();
      } catch {
        /* already shown */
      }
    }
    // A failed save's reason is the cell's description already: not twice (a column tooltip shown before goes).
    describe(anchor, this.el.id, !tip.said);
    const win = anchor.ownerDocument.defaultView;
    const r = anchor.getBoundingClientRect();
    const box = this.el.getBoundingClientRect();
    const winBlock = win?.innerHeight ?? 0;
    const winInline = win?.innerWidth ?? 0;
    // Below the anchor, or above it when there is no room (the arrow counted: variables.css gives the tooltip a top margin
    // of its size, on both sides): never over the cell it describes. `marginTop`: the block start in the grid's
    // horizontal writing mode, a longhand every engine computes (review 1.12.0).
    const below = r.bottom + 4;
    const top = below + box.height + parseFloat(getComputedStyle(this.el).marginTop) > winBlock && r.top - 4 - box.height >= 0 ? r.top - 4 - box.height : below;
    setPx(this.el, 'inset-block-start', top);
    const at = fixedInlineStart(r, dir, winInline, box.width);
    setPx(this.el, 'inset-inline-start', at);
    // Its side and the arrow's place, at the cell's middle held 12 px inside it (presentation-settings.md 32); the cell's
    // start unclamped.
    setAttr(this.el, 'data-side', top < r.top ? 'block-start' : 'block-end');
    this.el.style.setProperty('--dzg-tip-at', `${Math.round(Math.min(Math.max(12, fixedInlineStart(r, dir, winInline, 0) + r.width / 2 - at), box.width - 12))}px`);
  }
}
