// `[busy]` on <dz-grid> (1.4.0, overlays.md « Busy bar »): an NgRx app writes `[busy]="loading()"`. Expectations by hand.
import { it, expect, afterEach, vi } from 'vitest';
import { Component, input, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { slots } from '@dzgrid/dom/slots';
import { DzGrid, DzgPart, componentPart, type DzgPartContext } from '@dzgrid/angular';
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

// The busy part (1.4.0, overlays.md « The busy part »): a component or a template draws the busy mark; the grid says when.
@Component({
  selector: 't-brand',
  template: `<i class="brand" [attr.data-active]="cell().active" [attr.data-still]="cell().reducedMotion"></i>`,
})
class Brand {
  readonly cell = input.required<DzgPartContext<'busy'>>();
}

@Component({
  selector: 't-host-part',
  imports: [DzGrid],
  template: `<dz-grid [rows]="rows" [columns]="columns" [getRowId]="id" [messages]="messages" [busy]="loading()" [features]="features" [parts]="parts" />`,
})
class HostPart {
  readonly rows = ROWS;
  readonly columns = COLUMNS;
  readonly id = rowId;
  readonly messages = MESSAGES;
  readonly features = [slots()];
  readonly parts = { busy: componentPart('busy', Brand) };
  readonly loading = signal(false);
}

@Component({
  selector: 't-host-tpl',
  imports: [DzGrid, DzgPart],
  template: `<dz-grid [rows]="rows" [columns]="columns" [getRowId]="id" [messages]="messages" [busy]="loading()" [features]="features">
    <ng-template dzgPart="busy" slot="busy" let-c><b class="tpl" [attr.data-active]="c.active">{{ c.dir }}</b></ng-template>
  </dz-grid>`,
})
class HostTpl {
  readonly rows = ROWS;
  readonly columns = COLUMNS;
  readonly id = rowId;
  readonly messages = MESSAGES;
  readonly features = [slots()];
  readonly loading = signal(false);
}

for (const [name, cmp, sel] of [['componentPart', HostPart, '.brand'], ['a dzgPart template', HostTpl, '.tpl']] as const) {
  it(`${name} for the busy slot: mounted at the first show, kept, its active followed; no built-in line`, () => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ providers: [fakeEnv().provider] });
    const fixture = TestBed.createComponent<{ loading: ReturnType<typeof signal<boolean>> }>(cmp);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const mark = () => document.querySelector<HTMLElement>(`.dzg-busy-part ${sel}`);
    expect(mark()).toBeNull();
    fixture.componentInstance.loading.set(true);
    fixture.detectChanges();
    vi.advanceTimersByTime(200);
    const first = mark()!;
    expect(first.dataset['active']).toBe('true');
    expect(document.querySelector('.dzg-busy-part')!.getAttribute('aria-hidden')).toBe('true');
    expect(document.querySelector('.dzg-busy')).toBeNull();
    vi.advanceTimersByTime(400);
    fixture.componentInstance.loading.set(false);
    fixture.detectChanges();
    expect(mark()!.dataset['active']).toBe('false');
    expect(document.querySelector<HTMLElement>('.dzg-busy-part')!.hidden).toBe(true);
    fixture.componentInstance.loading.set(true);
    fixture.detectChanges();
    vi.advanceTimersByTime(200);
    // The same element: kept, not made again.
    expect(mark()).toBe(first);
    expect(first.dataset['active']).toBe('true');
    fixture.destroy();
  });
}
