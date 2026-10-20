import { Directive, ElementRef, inject, input } from '@angular/core';
import type { CsvExport } from '@dzgrid/dom/export';
import { bindAfterRender } from './bind-after';

type Scope = NonNullable<Parameters<CsvExport['bind']>[1]>['scope'];

/**
 * `<button [dzgExport]="exporter" dzgExportScope="all">`: the page's own button runs the CSV
 * export (`csvExport()` given in `<dz-grid [features]>`); `aria-busy` while it runs.
 */
@Directive({ selector: 'button[dzgExport]' })
export class DzgExport {
  readonly dzgExport = input.required<CsvExport>();
  readonly dzgExportScope = input<Scope>();

  constructor() {
    const el: HTMLButtonElement = inject(ElementRef).nativeElement;
    bindAfterRender(
      () => [this.dzgExport(), this.dzgExportScope()] as const,
      ([f, scope]) => f.bind(el, scope === undefined ? undefined : { scope }),
    );
  }
}
