import type { Scope } from '../render/scope.js';

/**
 * Polite announcements, outside `role="grid"` (S4). Emptied first, then
 * filled after a beat, so the same sentence twice is read twice.
 */
export class LiveRegion {
  readonly el: HTMLElement;
  readonly #scope: Scope;

  constructor(doc: Document, scope: Scope) {
    this.el = doc.createElement('div');
    this.el.className = 'dzg-live';
    this.el.setAttribute('aria-live', 'polite');
    this.el.setAttribute('aria-atomic', 'true');
    this.#scope = scope;
  }

  #cancel: (() => void) | null = null;

  /** A newer sentence replaces one not yet said: it is never read late, out of order. */
  announce(text: string): void {
    this.#cancel?.();
    this.el.textContent = '';
    this.#cancel = this.#scope.timeout(() => {
      this.#cancel = null;
      this.el.textContent = text;
    }, 50);
  }
}
