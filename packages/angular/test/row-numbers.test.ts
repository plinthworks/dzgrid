// Row numbers and the texts searched in Angular (1.4.0, row-numbers.md, search-highlight.md 6): nothing new in the
// wrapper; `rowNumbers()` goes in `[features]`; a `dzgPart` cell template sees `search.quick`. Expectations by hand.
import { it, expect, afterEach } from 'vitest';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { GridFeature, GridMessages } from '@dzgrid/dom';
import { rowNumbers } from '@dzgrid/dom/row-numbers';
import { EN_ROW_NUMBERS } from '@dzgrid/dom/locales/en-row-numbers';
import { DzGrid, DzgPart, type DzgController } from '@dzgrid/angular';
import { COLUMNS, MESSAGES, ROWS, fakeEnv, rowId, type R } from './support';

afterEach(() => {
  document.body.innerHTML = '';
});

const MSG: GridMessages = { ...MESSAGES, text: { ...MESSAGES.text, ...EN_ROW_NUMBERS.text } };

@Component({
  selector: 't-host',
  imports: [DzGrid, DzgPart],
  template: `<dz-grid [rows]="rows" [columns]="columns" [getRowId]="id" [messages]="messages" [features]="features" (gridReady)="ctl = $event">
    <ng-template dzgPart="status" let-c><i class="q">{{ c.text }}|{{ c.search?.quick }}</i></ng-template>
  </dz-grid>`,
})
class Host {
  readonly rows = ROWS;
  readonly columns = COLUMNS;
  readonly id = rowId;
  readonly messages = MSG;
  readonly features: GridFeature[] = [rowNumbers()];
  ctl: DzgController<R> | null = null;
}

it('rowNumbers() in [features]: 1, 2, 3 before the columns; a cell template is given the quick search', () => {
  TestBed.configureTestingModule({ providers: [fakeEnv().provider] });
  const fixture = TestBed.createComponent(Host);
  document.body.appendChild(fixture.nativeElement);
  fixture.detectChanges();
  const rows = [...document.querySelectorAll<HTMLElement>('.dzg-layer > .dzg-row')].slice(0, 3);
  expect(rows.map((r) => r.querySelector('.dzg-seg-start > .dzg-lead')!.textContent)).toEqual(['1', '2', '3']);
  expect(document.querySelector('.dzg-hcell.dzg-lead')!.getAttribute('role')).toBe('columnheader');
  fixture.componentInstance.ctl!.grid()!.kernel.dispatch({ type: 'quick.set', text: 'odd' }, 'api');
  fixture.detectChanges();
  expect(document.querySelector('.dzg-layer .q')!.textContent).toBe('odd|odd');
});
