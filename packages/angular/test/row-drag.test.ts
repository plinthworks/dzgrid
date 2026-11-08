// Moving rows in Angular (Phase 9, row-move.md 24; row-drag-plan.md R4): `rowDrag()` goes in `[features]`; `(gridEvent)`
// carries `rowMove`, and since Phase 11 L2 (R9, room made in K.8) `(rowMove)` too; the application gives its rows back
// with `moveRows` through `[rows]`; `ctl.use(feature)` / `ctl.rowDrag()` is the feature's api (null without the grid).
// Expectations by hand.
import { it, expect, afterEach } from 'vitest';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { dataKey, type GridEvent } from '@dzgrid/core';
import { moveRows } from '@dzgrid/core/row-drag';
import type { GridFeature, GridMessages } from '@dzgrid/dom';
import { rowDrag } from '@dzgrid/dom/row-drag';
import { EN_ROW_DRAG } from '@dzgrid/dom/locales/en-row-drag';
import { DzGrid, DzgController } from '@dzgrid/angular';
import { COLUMNS, MESSAGES, ROWS, fakeEnv, rowId, type R } from './support';

afterEach(() => {
  document.body.innerHTML = '';
});

const MSG: GridMessages = { ...MESSAGES, text: { ...MESSAGES.text, ...EN_ROW_DRAG.text } };
type Moved = Extract<GridEvent<R>, { type: 'rowMove' }>;

@Component({
  selector: 't-host',
  imports: [DzGrid],
  template: `<dz-grid [rows]="rows()" [columns]="columns" [getRowId]="id" [messages]="messages" [features]="features" (gridEvent)="heard($event)" (gridReady)="ctl = $event"></dz-grid>`,
})
class Host {
  readonly rows = signal(ROWS.slice(0, 5));
  readonly columns = COLUMNS;
  readonly id = rowId;
  readonly messages = MSG;
  readonly drag = rowDrag<R>();
  readonly features: GridFeature[] = [this.drag];
  readonly seen: Moved[] = [];
  ctl: DzgController<R> | null = null;
  heard(e: GridEvent<R>): void {
    if (e.type !== 'rowMove') return;
    this.seen.push(e);
    this.rows.set(moveRows(this.rows(), e, rowId));
  }
}

it('(gridEvent) carries rowMove; the application\'s [rows] give the new order; ctl.use(feature) is the api', () => {
  TestBed.configureTestingModule({ providers: [fakeEnv().provider] });
  const fixture = TestBed.createComponent(Host);
  document.body.appendChild(fixture.nativeElement);
  fixture.detectChanges();
  const host = fixture.componentInstance;
  const api = host.ctl!.use(host.drag)!;
  expect(api.step(dataKey('r0')!, 'end')).toBe('moved');
  fixture.detectChanges();
  expect(host.seen.map((e) => [e.via, e.keys, e.target])).toEqual([['api', [dataKey('r0')], { key: dataKey('r4'), where: 'after' }]]);
  expect(host.rows().map((r) => r.id)).toEqual(['r1', 'r2', 'r3', 'r4', 'r0']);
  const d = host.ctl!.kernel()!.rows.displayed;
  expect(Array.from({ length: d.count }, (_, i) => d.keyAt(d.index(i)!))).toEqual(['r1', 'r2', 'r3', 'r4', 'r0'].map((x) => dataKey(x)));
  expect(document.querySelectorAll('.dzg-grip')).toHaveLength(5);
});

// R9 (Phase 11 L2): the output of its own name and the controller's typed accessor, as `grouping()` has.
@Component({
  selector: 't-host-out',
  imports: [DzGrid],
  template: `<dz-grid [rows]="rows()" [columns]="columns" [getRowId]="id" [messages]="messages" [features]="features" (rowMove)="moved($event)" (gridReady)="ctl = $event"></dz-grid>`,
})
class HostOut {
  readonly rows = signal(ROWS.slice(0, 3));
  readonly columns = COLUMNS;
  readonly id = rowId;
  readonly messages = MSG;
  readonly features: GridFeature[] = [rowDrag<R>()];
  readonly seen: Moved[] = [];
  ctl: DzgController<R> | null = null;
  moved(e: Moved): void {
    this.seen.push(e);
    this.rows.set(moveRows(this.rows(), e, rowId));
  }
}

it('(rowMove) is an output of its own; ctl.rowDrag() the api, null after the grid (R9)', () => {
  TestBed.configureTestingModule({ providers: [fakeEnv().provider] });
  const fixture = TestBed.createComponent(HostOut);
  document.body.appendChild(fixture.nativeElement);
  fixture.detectChanges();
  const host = fixture.componentInstance;
  const ctl = host.ctl!;
  expect(ctl.rowDrag()!.step(dataKey('r2')!, 'start')).toBe('moved');
  fixture.detectChanges();
  expect(host.seen.map((e) => [e.via, e.keys])).toEqual([['api', [dataKey('r2')]]]);
  expect(host.rows().map((r) => r.id)).toEqual(['r2', 'r0', 'r1']);
  fixture.destroy();
  expect(ctl.rowDrag()).toBeNull();
});
