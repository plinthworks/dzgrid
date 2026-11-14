// `?page=tips` (1.12.0, docs/behaviors/tooltips-popovers.md): dzTooltip and dzPopover outside any grid — a template, a
// component, cleaned HTML — and a popover from a grid cell's component. Checked by scripts/browser-1-12.mjs (11b).
import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { DzGrid, type DzgColumnOrGroup, type DzgPartContext } from '@dzgrid/angular';
import { DzTooltip } from '@dzgrid/angular/tooltip';
import { DzPopover } from '@dzgrid/angular/popover';
import { EN } from '@dzgrid/dom/locales/en';

export const tipStats = { made: 0, gone: 0, closed: [] as string[] };

@Component({ selector: 'fx-card', changeDetection: ChangeDetectionStrategy.OnPush, template: `<span class="fx-card">{{ who() }} · {{ n() }}</span>` })
export class Card {
  readonly who = input('');
  readonly n = input(0);
  constructor() { tipStats.made++; }
  ngOnDestroy(): void { tipStats.gone++; }
}

type S = { id: string; seed: string };

@Component({
  selector: 'fx-act',
  imports: [DzPopover],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<button type="button" class="fx-act" aria-label="Details" [dzPopover]="more" [dzPopoverContext]="cell().row">⋯</button>
    <ng-template #more let-r><p class="fx-about">{{ r.seed }}</p></ng-template>`,
})
export class ActCell {
  readonly cell = input.required<DzgPartContext<'cell'>>();
}

@Component({
  selector: 'dzg-fixture',
  imports: [DzTooltip, DzPopover, DzGrid],
  template: `
    <div class="bar">
      <button type="button" class="fx-t1" [dzTooltip]="tpl" [dzTooltipContext]="who()" [dzTooltipDelay]="0" dzTooltipTone="success" dzTooltipAnimation="pop">Template</button>
      <ng-template #tpl let-w><strong class="fx-in">{{ w }}</strong></ng-template>
      <button type="button" class="fx-t2" [dzTooltip]="card" [dzTooltipInputs]="{ who: 'Ann', n: 3 }" [dzTooltipDelay]="0" dzTooltipPlacement="right">Component</button>
      <button type="button" class="fx-t3" [dzTooltip]="{ html: html }" [dzTooltipDelay]="0">HTML</button>
      <button type="button" class="fx-p1" [dzPopover]="form" dzPopoverLabel="Note" dzPopoverPlacement="bottom-start" (closed)="closed($event)">Popover</button>
      <ng-template #form let-close="close"><label>Note <input class="fx-note"></label> <button type="button" class="fx-done" (click)="close()">OK</button></ng-template>
      <button type="button" class="fx-p2" [dzPopover]="card" [dzPopoverInputs]="{ who: 'Bob', n: 7 }">Card</button>
    </div>
    <div class="host"><dz-grid [rows]="rows" [columns]="columns" [getRowId]="id" [messages]="messages" /></div>`,
})
export class TipsApp {
  readonly who = signal('Ann');
  readonly card = Card;
  readonly html = '<b>Bold</b><img src="x" onerror="window.__hit=1"><script>window.__hit=1</script>';
  readonly rows: S[] = Array.from({ length: 200 }, (_, i) => ({ id: `s${i}`, seed: `Seed ${i}` }));
  readonly columns: readonly DzgColumnOrGroup<S>[] = [{ id: 'seed', header: 'Seed' }, { id: 'act', header: '', value: () => '', ui: { cell: ActCell } }];
  readonly id = (s: S) => s.id;
  readonly messages = EN;
  closed(r: string): void { tipStats.closed.push(r); }
}
