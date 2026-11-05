// Row grouping and the band in Angular (Phase 7 steps 5–6; the full Angular API is step 8): nothing new in the wrapper,
// `grouping()` and `groupZone()` go in `[features]`. Expectations by hand (support.ts: `s` is « odd » / « even »).
import { it, expect, afterEach } from 'vitest';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { GridFeature, GridMessages } from '@dzgrid/dom';
import { grouping } from '@dzgrid/dom/grouping';
import { groupZone } from '@dzgrid/dom/group-zone';
import { EN_GROUP } from '@dzgrid/dom/locales/en-group';
import { DzGrid, type DzgController } from '@dzgrid/angular';
import { COLUMNS, MESSAGES, ROWS, fakeEnv, rowId, type R } from './support';

afterEach(() => {
  document.body.innerHTML = '';
});

const MSG: GridMessages = { ...MESSAGES, text: { ...MESSAGES.text, ...EN_GROUP.text } };
const g = grouping({ by: ['s'], footers: 'grand' });

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
  readonly features: GridFeature[] = [g, groupZone({ use: { grouping: g } })];
  ctl: DzgController<R> | null = null;
}

it('grouping() and groupZone() in [features]: two groups of 150, the grand total, a treegrid, one chip; the API reached', () => {
  TestBed.configureTestingModule({ providers: [fakeEnv().provider] });
  const fixture = TestBed.createComponent(Host);
  document.body.appendChild(fixture.nativeElement);
  fixture.detectChanges();
  const labels = [...document.querySelectorAll('.dzg-layer > .dzg-row .dzg-label')].map((l) => l.textContent);
  expect(labels).toEqual(['even (150)', 'odd (150)', 'Total']);
  expect(document.querySelector('.dzg-viewport')!.getAttribute('role')).toBe('treegrid');
  expect([...document.querySelectorAll('.dzg-gzone .dzg-chip')].map((c) => c.textContent)).toEqual(['Status']);
  const api = g.api(fixture.componentInstance.ctl!.grid()!)!;
  api.setBy([]);
  fixture.detectChanges();
  expect(document.querySelector('.dzg-viewport')!.getAttribute('role')).toBe('grid');
  expect(document.querySelector('.dzg-gzone')!.textContent).toBe('Drag a column here to group');
});
