// The filters panel in Angular (Phase 9, filters-panel.md): nothing new in the wrapper; `filtersPanel()` goes in
// `[features]` beside `filters()`, its strip at the side, its api through `ctl.use(feature)`. Expectations by hand.
import { it, expect, afterEach } from 'vitest';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { GridFeature, GridMessages } from '@dzgrid/dom';
import { filters } from '@dzgrid/dom/filters';
import { filtersPanel } from '@dzgrid/dom/filters-panel';
import { EN_FILTERS_PANEL } from '@dzgrid/dom/locales/en-filters-panel';
import { DzGrid, type DzgController } from '@dzgrid/angular';
import { COLUMNS, MESSAGES, ROWS, fakeEnv, rowId, type R } from './support';

afterEach(() => {
  document.body.innerHTML = '';
});

const MSG: GridMessages = { ...MESSAGES, text: { ...MESSAGES.text, ...EN_FILTERS_PANEL.text } };

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
  readonly panel = filtersPanel({ side: 'start' });
  readonly features: GridFeature[] = [filters(), this.panel];
  ctl: DzgController<R> | null = null;
}

it('filtersPanel() in [features]: the strip at the start side; its button opens the panel; its api by ctl.use()', () => {
  TestBed.configureTestingModule({ providers: [fakeEnv().provider] });
  const fixture = TestBed.createComponent(Host);
  document.body.appendChild(fixture.nativeElement);
  fixture.detectChanges();
  const host = fixture.componentInstance;
  const root = document.querySelector<HTMLElement>('.dzg')!;
  expect(root.dataset['dzgFside']).toBe('start');
  root.querySelector<HTMLButtonElement>(':scope > .dzg-fside > .dzg-fp-toggle')!.click();
  const api = host.ctl!.use(host.panel)!;
  expect(api.isOpen).toBe(true);
  expect([...root.querySelectorAll<HTMLElement>('.dzg-fp-item')].map((li) => li.dataset['col'])).toEqual(['name', 'n', 's']);
  api.close();
  expect(root.querySelector<HTMLElement>('.dzg-fpanel')!.hidden).toBe(true);
});
