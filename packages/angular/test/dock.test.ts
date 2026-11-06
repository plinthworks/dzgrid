// The dock in Angular (Phase 9, dock.md; owner « Dock — owner B » 2026-11-06): nothing new in the wrapper (no byte in
// K.8) — `dock()` and the panels go in `[features]`; `ctl.use(feature)` is the dock's api; `onChange` is the dock's own
// callback. Expectations by hand.
import { it, expect, afterEach } from 'vitest';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { DockState } from '@dzgrid/core/dock';
import type { GridFeature, GridMessages } from '@dzgrid/dom';
import { dock } from '@dzgrid/dom/dock';
import { columnsChooser } from '@dzgrid/dom/columns-panel';
import { EN_DOCK } from '@dzgrid/dom/locales/en-dock';
import { EN_COLUMNS } from '@dzgrid/dom/locales/en-columns';
import { DzGrid, DzgController } from '@dzgrid/angular';
import { COLUMNS, MESSAGES, ROWS, fakeEnv, rowId, type R } from './support';

afterEach(() => {
  document.body.innerHTML = '';
});

const MSG: GridMessages = { ...MESSAGES, text: { ...MESSAGES.text, ...EN_DOCK.text, ...EN_COLUMNS.text } };

@Component({
  selector: 't-host',
  imports: [DzGrid],
  template: `<dz-grid [rows]="rows" [columns]="columns" [getRowId]="id" [messages]="messages" [features]="features" (gridReady)="ctl = $event"></dz-grid>`,
})
class Host {
  readonly rows = ROWS.slice(0, 5);
  readonly columns = COLUMNS;
  readonly id = rowId;
  readonly messages = MSG;
  readonly changes: DockState[] = [];
  readonly chooser = columnsChooser();
  readonly dock = dock({ onChange: (l) => this.changes.push(l) });
  readonly features: GridFeature[] = [this.chooser, this.dock];
  ctl: DzgController<R> | null = null;
}

it('[features] takes the dock and the columns panel; ctl.use(dock) moves it; onChange tells the layout', () => {
  TestBed.configureTestingModule({ providers: [fakeEnv().provider] });
  const fixture = TestBed.createComponent(Host);
  document.body.appendChild(fixture.nativeElement);
  fixture.detectChanges();
  const host = fixture.componentInstance;
  expect(host.ctl!.use(host.chooser)!.open()).toBe(true);
  expect(document.querySelector('.dzg-dock[data-area=end] .dzg-cp')).not.toBeNull();
  expect(host.ctl!.use(host.dock)!.move('columns', 'start')).toBe(true);
  expect(document.querySelector('.dzg-dock[data-area=start] .dzg-cp')).not.toBeNull();
  expect(host.changes.at(-1)!.panels).toEqual({ columns: { area: 'start', open: true } });
});
