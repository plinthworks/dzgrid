import { fixedInlineStart, type Dir } from '../dir.js';
import { setAttr, setPx } from './rows.js';
import type { Scope } from './scope.js';

let ids = 0;

/**
 * One tooltip per grid (D11, WCAG 1.4.13): shown after a delay on hover or at
 * once on keyboard focus; the pointer may move onto it; Escape dismisses it;
 * it stays until then. Only the host's text, never the cell's content guessed.
 */
export class Tooltip {
  readonly el: HTMLElement;
  #anchor: HTMLElement | null = null;
  #cancelShow: (() => void) | null = null;
  #cancelHide: (() => void) | null = null;
  readonly #scope: Scope;

  constructor(el: HTMLElement, scope: Scope) {
    this.el = el;
    this.el.id ||= `dzg-tip-${++ids}`;
    this.#scope = scope;
    scope.on(el, 'pointerenter', () => this.#keep());
    scope.on(el, 'pointerleave', (e: PointerEvent) => {
      if (!this.#anchor || !this.#anchor.contains(e.relatedTarget as Node | null)) this.hideSoon();
    });
  }

  get anchor(): HTMLElement | null {
    return this.#anchor;
  }

  /** After `delay` ms (0: now), unless something else is shown or hidden first. */
  showFor(anchor: HTMLElement, text: string, dir: Dir, delay: number): void {
    this.#keep();
    this.#cancelShow?.();
    this.#cancelShow = null;
    if (delay <= 0) return this.#show(anchor, text, dir);
    this.#cancelShow = this.#scope.timeout(() => {
      this.#cancelShow = null;
      if (anchor.isConnected) this.#show(anchor, text, dir);
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
    if (this.#anchor) setAttr(this.#anchor, 'aria-describedby', null);
    this.#anchor = null;
    this.el.hidden = true;
  }

  #keep(): void {
    this.#cancelHide?.();
    this.#cancelHide = null;
  }

  #show(anchor: HTMLElement, text: string, dir: Dir): void {
    if (this.#anchor && this.#anchor !== anchor) setAttr(this.#anchor, 'aria-describedby', null);
    this.#anchor = anchor;
    if (this.el.textContent !== text) this.el.textContent = text;
    this.el.hidden = false;
    setAttr(anchor, 'aria-describedby', this.el.id);
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
