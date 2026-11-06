// The pivot in Angular (Phase 10, pivot.md 30): nothing new in the wrapper; `grouping({ pivot })` goes in `[features]`,
// the pivot's api through `ctl.use(p)`. Expectations by hand from support.ts' rows (status odd / even, 300 rows).
import { it, expect, afterEach } from 'vitest';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { GridFeature, GridMessages } from '@dzgrid/dom';
import { grouping } from '@dzgrid/dom/grouping';
import { pivot } from '@dzgrid/dom/pivot';
import { EN_GROUP } from '@dzgrid/dom/locales/en-group';
import { EN_PIVOT } from '@dzgrid/dom/locales/en-pivot';
import { DzGrid, type DzgController } from '@dzgrid/angular';
import { COLUMNS, MESSAGES, ROWS, fakeEnv, rowId, type R } from './support';

afterEach(() => {
  document.body.innerHTML = '';
});

const MSG: GridMessages = { ...MESSAGES, text: { ...MESSAGES.text, ...EN_GROUP.text, ...EN_PIVOT.text } };

@Component({
  selector: 't-host',
  imports: [DzGrid],
  template: `<dz-grid [rows]="rows" [columns]="columns" [getRowId]="id" [messages]="messages" [features]="features" (gridReady)="ctl = $event"></dz-grid>`,
})
class Host {
  readonly rows = ROWS;
  readonly columns = COLUMNS;
  readonly id = rowId;
  readonly messages = MSG;
  readonly p = pivot({ columns: ['s'], values: { n: 'count' } });
  readonly features: GridFeature[] = [grouping({ pivot: this.p })];
  ctl: DzgController<R> | null = null;
}

it('grouping({ pivot }) in [features]: the created columns on screen; the api by ctl.use(p)', () => {
  TestBed.configureTestingModule({ providers: [fakeEnv().provider] });
  const fixture = TestBed.createComponent(Host);
  document.body.appendChild(fixture.nativeElement);
  fixture.detectChanges();
  const api = fixture.componentInstance.ctl!.use(fixture.componentInstance.p)!;
  expect([api.on(), api.by(), api.count()]).toEqual([true, ['s'], 2]);
  // No grouping column: the grand total row alone, 150 even and 150 odd.
  expect(api.series()).toEqual({ categories: [''], series: [expect.objectContaining({ name: 'even', values: [150] }), expect.objectContaining({ name: 'odd', values: [150] })] });
  api.setOn(false);
  expect(api.count()).toBe(0);
});
