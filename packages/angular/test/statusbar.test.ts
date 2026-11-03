// The status bar in Angular (Phase 9 SB2, status-bar.md « What DzGrid does »): nothing new in the wrapper; `statusBar()`
// goes in `[features]` with `range()`, its strip under the rows; an app item drawn by a `dzgPart` template of slot
// `status`, named in `items`, gets the block's figures. Written before the code.
import { it, expect, afterEach } from 'vitest';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { dataKey } from '@dzgrid/core';
import type { GridFeature, GridMessages } from '@dzgrid/dom';
import { range } from '@dzgrid/dom/range';
import { statusBar } from '@dzgrid/dom/statusbar';
import { EN_RANGE } from '@dzgrid/dom/locales/en-range';
import { EN_STATUS } from '@dzgrid/dom/locales/en-status';
import { DzGrid, DzgPart, type DzgController } from '@dzgrid/angular';
import { COLUMNS, MESSAGES, ROWS, fakeEnv, rowId, type R } from './support';

afterEach(() => {
  document.body.innerHTML = '';
});

const MSG: GridMessages = { ...MESSAGES, text: { ...MESSAGES.text, ...EN_RANGE.text, ...EN_STATUS.text } };

@Component({
  selector: 't-host',
  imports: [DzGrid, DzgPart],
  template: `<dz-grid [rows]="rows" [columns]="columns" [getRowId]="id" [messages]="messages" [features]="features" (gridReady)="ctl = $event">
      <ng-template dzgPart="cells" slot="status" let-c><b class="mine">{{ c.stats ? c.stats.cells : 0 }}</b></ng-template>
    </dz-grid>`,
})
class Host {
  readonly rows = ROWS;
  readonly columns = COLUMNS;
  readonly id = rowId;
  readonly messages = MSG;
  readonly blocks = range();
  readonly features: GridFeature[] = [this.blocks, statusBar({ items: ['status.count', 'status.sum', 'cells'] })];
  ctl: DzgController<R> | null = null;
}

it('statusBar() in [features]: the strip, the block’s figures, an app item by a dzgPart template', () => {
  TestBed.configureTestingModule({ providers: [fakeEnv().provider] });
  const fixture = TestBed.createComponent(Host);
  document.body.appendChild(fixture.nativeElement);
  fixture.detectChanges();
  const host = fixture.componentInstance;
  const group = document.querySelector<HTMLElement>('.dzg-footer > .dzg-status')!;
  expect(group.getAttribute('role')).toBe('group');
  // r1–r3 × name, n: 6 filled; n 1 2 3.
  host.ctl!.use(host.blocks)!.set({ anchor: { row: dataKey('r1')!, column: 'name' }, focus: { row: dataKey('r3')!, column: 'n' } });
  fixture.detectChanges();
  const texts = [...group.querySelectorAll<HTMLElement>(':scope > [data-part]')].map((h) => h.textContent!.trim());
  expect(texts).toEqual(['Count: 6', 'Sum: 6', '6']);
  expect(group.querySelector('.mine')!.textContent).toBe('6');
});
