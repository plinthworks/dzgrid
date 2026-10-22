// Shared fixtures for the tree and master/detail tests of the Angular wrapper (Phase 4 step 11).
import { ChangeDetectionStrategy, Component, input, type OnDestroy } from '@angular/core';
import type { DzgPartContext } from '@dzgrid/angular';

/** What every detail probe did: constructions, destructions, the contexts it saw. */
export const panels = {
  made: 0,
  gone: 0,
  seen: [] as PanelProbe[],
  reset() {
    this.made = 0;
    this.gone = 0;
    this.seen = [];
  },
};

/** A detail component: the master's name, its height, and a button that emits `open` with the master's key. */
@Component({
  selector: 't-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="pn">{{ name() }}</span> <span class="ph">{{ cell().height }}</span>
    <button type="button" class="pb" (click)="cell().emit('open', cell().master)">open</button>`,
})
export class PanelProbe implements OnDestroy {
  readonly cell = input.required<DzgPartContext<'detail'>>();
  readonly name = () => (this.cell().row as { name: string }).name;
  constructor() {
    panels.made++;
    panels.seen.push(this);
  }
  ngOnDestroy(): void {
    panels.gone++;
  }
}
