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

  announce(text: string): void {
    this.el.textContent = '';
    this.#scope.timeout(() => {
      this.el.textContent = text;
    }, 50);
  }
}
