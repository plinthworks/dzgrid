import type { ResolvedColumn } from '@dzgrid/core';
import { fixedInlineStart, type Dir } from '../dir.js';
import { setPx } from './rows.js';
import { describe } from './write.js';
import type { Scope } from './scope.js';

let ids = 0;

/** What a tooltip shows: the host's text, and for a part what it is about (a header: null row and value). */
export interface TipFor {
  readonly text: string;
  readonly col: ResolvedColumn<any>;
  readonly row: Readonly<unknown> | null;
  readonly value: unknown;
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
  #cancelShow: (() => void) | null = null;
  #cancelHide: (() => void) | null = null;
  readonly #scope: Scope;
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
    this.#cancelShow?.();
    this.#cancelShow = null;
    if (delay <= 0) return this.#show(anchor, tip, dir);
    this.#cancelShow = this.#scope.timeout(() => {
      this.#cancelShow = null;
      if (anchor.isConnected) this.#show(anchor, tip, dir);
    }, delay);
  }

  /** A short grace, so the pointer can cross the gap onto the tooltip. */
  hideSoon(): void {
    this.#cancelShow?.();
    this.#cancelShow = null;
    if (this.#cancelHide || this.el.hidden) return;
    this.#cancelHide = this.#scope.timeout(() => {
      this.#cancelHide = null;
      this.hide();
    }, 150);
  }

  hide(): void {
    this.#cancelShow?.();
    this.#cancelShow = null;
    this.#keep();
    if (this.#anchor) describe(this.#anchor, this.el.id, false);
    this.#anchor = null;
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
    if (this.#anchor && this.#anchor !== anchor) describe(this.#anchor, this.el.id, false);
    this.#anchor = anchor;
    this.row = tip.row;
    // Drawn before it is measured: its size is the part's.
    if (!this.#fill?.(tip) && this.el.textContent !== tip.text) this.el.textContent = tip.text;
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
    describe(anchor, this.el.id, true);
    const win = anchor.ownerDocument.defaultView;
    const r = anchor.getBoundingClientRect();
    const box = this.el.getBoundingClientRect();
    const winBlock = win?.innerHeight ?? 0;
    const winInline = win?.innerWidth ?? 0;
    // Below the anchor, or above it when there is no room: never over the cell it describes.
    const below = r.bottom + 4;
    const top = below + box.height > winBlock && r.top - 4 - box.height >= 0 ? r.top - 4 - box.height : below;
    setPx(this.el, 'inset-block-start', top);
    setPx(this.el, 'inset-inline-start', fixedInlineStart(r, dir, winInline, box.width));
  }
}
