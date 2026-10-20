import { Directive, ElementRef, inject, input } from '@angular/core';
import type { QuickSearch } from '@dzgrid/dom/search';
import { bindAfterRender } from './bind-after';

/**
 * `<input [dzgSearch]="search">`: the page's own field drives the grid's quick search
 * (`quickSearch()` given in `<dz-grid [features]>`), before or after the grid exists.
 */
@Directive({ selector: 'input[dzgSearch]' })
export class DzgSearch {
  readonly dzgSearch = input.required<QuickSearch>();
  /** The pause before the search runs (the feature's own default otherwise). */
  readonly dzgSearchDebounce = input<number>();

  constructor() {
    const el: HTMLInputElement = inject(ElementRef).nativeElement;
    bindAfterRender(
      () => [this.dzgSearch(), this.dzgSearchDebounce()] as const,
      ([f, d]) => f.bind(el, d === undefined ? undefined : { debounceMs: d }),
    );
  }
}
