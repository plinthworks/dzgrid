// `[busy]` on <dz-grid> (1.4.0, overlays.md « Busy bar »): an NgRx app writes `[busy]="loading()"`. Expectations by hand.
import { it, expect, afterEach, vi } from 'vitest';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DzGrid } from '@dzgrid/angular';
import { COLUMNS, MESSAGES, ROWS, fakeEnv, rowId } from './support';

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
});

@Component({
  selector: 't-host',
  imports: [DzGrid],
  template: `<dz-grid [rows]="rows" [columns]="columns" [getRowId]="id" [messages]="messages" [busy]="loading()" />`,
})
class Host {
  readonly rows = ROWS;
  readonly columns = COLUMNS;
  readonly id = rowId;
  readonly messages = MESSAGES;
  readonly loading = signal(false);
}

it('[busy] follows the signal: aria-busy at once, the bar after 200 ms, gone when no longer busy', () => {
  vi.useFakeTimers();
  TestBed.configureTestingModule({ providers: [fakeEnv().provider] });
  const fixture = TestBed.createComponent(Host);
  document.body.appendChild(fixture.nativeElement);
  fixture.detectChanges();
  const vp = document.querySelector<HTMLElement>('.dzg-viewport')!;
  const shown = () => !!document.querySelector('.dzg-busy:not([hidden])');
  expect(vp.hasAttribute('aria-busy')).toBe(false);
  fixture.componentInstance.loading.set(true);
  fixture.detectChanges();
  expect(vp.getAttribute('aria-busy')).toBe('true');
  vi.advanceTimersByTime(200);
  expect(shown()).toBe(true);
  vi.advanceTimersByTime(400);
  fixture.componentInstance.loading.set(false);
  fixture.detectChanges();
  expect(vp.hasAttribute('aria-busy')).toBe(false);
  expect(shown()).toBe(false);
  fixture.destroy();
});
