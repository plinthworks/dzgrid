import { Directive, TemplateRef, inject, input } from '@angular/core';
import type { DzgTemplateContext, WiredSlot } from './part-bind';

/**
 * A template as a part, inside `<dz-grid>`: `<ng-template dzgPart="status" let-c>…</ng-template>`,
 * named in a column's `ui` like any part; `slot="header"` (or any slot) for another slot than the
 * cell. Its context (`let-c`, or `let-c="cell"`) is the slot's, typed by `slot`, with `emit`.
 * Templates win over `[parts]`, `provideDzGrid` and the features (`part-shadowed`).
 */
@Directive({ selector: 'ng-template[dzgPart]' })
export class DzgPart<S extends WiredSlot = 'cell'> {
  readonly dzgPart = input.required<string>();
  readonly slot = input<S>('cell' as S);
  readonly template = inject<TemplateRef<DzgTemplateContext<S>>>(TemplateRef);

  static ngTemplateContextGuard<S extends WiredSlot>(_d: DzgPart<S>, _c: unknown): _c is DzgTemplateContext<S> {
    return true;
  }
}
