// Find in the grid in Angular (Phase 9, find.md): nothing new in the wrapper; `find()` goes in `[features]`, its bar
// above the headers, its api through `ctl.use(feature)`; Ctrl+F inside the grid opens it. Expectations by hand.
import { it, expect, afterEach } from 'vitest';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { GridFeature, GridMessages } from '@dzgrid/dom';
import { find } from '@dzgrid/dom/find';
import { EN_FIND } from '@dzgrid/dom/locales/en-find';
import { DzGrid, type DzgController } from '@dzgrid/angular';
import { COLUMNS, MESSAGES, ROWS, fakeEnv, rowId, type R } from './support';

afterEach(() => {
  document.body.innerHTML = '';
});

const MSG: GridMessages = { ...MESSAGES, text: { ...MESSAGES.text, ...EN_FIND.text } };

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
  readonly finder = find({ debounceMs: 0 });
  readonly features: GridFeature[] = [this.finder];
  ctl: DzgController<R> | null = null;
}

it('find() in [features]: Ctrl+F in the grid opens the bar; its api by ctl.use(); the hits counted', () => {
  TestBed.configureTestingModule({ providers: [fakeEnv().provider] });
  const fixture = TestBed.createComponent(Host);
  document.body.appendChild(fixture.nativeElement);
  fixture.detectChanges();
  const host = fixture.componentInstance;
  const vp = document.querySelector<HTMLElement>('.dzg-viewport')!;
  const e = new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true, cancelable: true });
  vp.dispatchEvent(e);
  expect(e.defaultPrevented).toBe(true);
  const bar = document.querySelector<HTMLElement>('.dzg > .dzg-find')!;
  expect(bar.hidden).toBe(false);
  const api = host.ctl!.use(host.finder)!;
  api.open(String(ROWS[0]!.name));
  expect(api.state().count).toBeGreaterThan(0);
  expect(bar.querySelector('.dzg-find-count')!.textContent).toMatch(/^1 \/ \d+$/);
});
