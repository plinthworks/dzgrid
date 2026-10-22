// <dz-grid [floatingFilters]>: the floating filter row shown or hidden live (Phase 4 step 12; docs/behaviors/floating-toggle.md).
// Owner decision Q16 (budget 6 250). Written first: 3 of 5 failed without the input.
import { describe, it, expect, afterEach } from 'vitest';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { GridEvent } from '@dzgrid/core';
import type { GridFeature } from '@dzgrid/dom';
import { filters } from '@dzgrid/dom/filters';
import { DzGrid } from '@dzgrid/angular';
import { COLUMNS, MESSAGES, ROWS, fakeEnv, rowId, type R } from './support';

afterEach(() => {
  document.body.innerHTML = '';
});

@Component({
  selector: 't-floating',
  imports: [DzGrid],
  template: `<dz-grid [rows]="rows" [columns]="columns" [getRowId]="id" [messages]="messages" [features]="features()" [label]="label()"
    [floatingFilters]="floating()" (gridEvent)="all.push($event)" />`,
})
class Host {
  rows = ROWS;
  columns = COLUMNS;
  readonly id = rowId;
  messages = MESSAGES;
  readonly f = filters();
  readonly features = signal<GridFeature[]>([this.f]);
  readonly floating = signal<boolean | undefined>(undefined);
  readonly label = signal('a');
  readonly all: GridEvent<R>[] = [];
}

function mount(setup?: (h: Host) => void) {
  TestBed.configureTestingModule({ providers: [fakeEnv().provider] });
  const fixture = TestBed.createComponent(Host);
  setup?.(fixture.componentInstance);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const rows = () => el.querySelectorAll('.dzg-header > [role=row]').length;
  return { fixture, el, host: fixture.componentInstance, rows, run: () => fixture.detectChanges() };
}

describe('[floatingFilters]', () => {
  it('unset leaves the feature’s own state; set at creation is the state the grid starts with', () => {
    const t = mount();
    expect(t.rows()).toBe(1);
    TestBed.resetTestingModule();
    document.body.innerHTML = '';
    const u = mount((h) => h.floating.set(true));
    expect(u.rows()).toBe(2);
    expect(u.host.f.floating.get()).toBe(true);
  });

  it('is live: true shows the row, false hides it, the counts follow', () => {
    const t = mount();
    t.host.floating.set(true);
    t.run();
    expect(t.rows()).toBe(2);
    expect(t.el.querySelector('.dzg-viewport')!.getAttribute('aria-rowcount')).toBe(String(ROWS.length + 2));
    t.host.floating.set(false);
    t.run();
    expect(t.rows()).toBe(1);
    expect(t.el.querySelector('.dzg-viewport')!.getAttribute('aria-rowcount')).toBe(String(ROWS.length + 1));
  });

  it('never writes back over the user’s toggle: another input changing leaves it, only a new value of its own counts', () => {
    const t = mount((h) => h.floating.set(true));
    const b = document.createElement('button');
    document.body.append(b);
    t.host.f.floating.bind(b);
    b.click();
    expect(t.rows()).toBe(1);
    // An unrelated input: the user's choice stays.
    t.host.label.set('b');
    t.run();
    expect(t.rows()).toBe(1);
    expect(b.getAttribute('aria-pressed')).toBe('false');
    // The host's value again (unchanged): no echo, still the user's.
    t.host.floating.set(true);
    t.run();
    expect(t.rows()).toBe(1);
    // A new value: the host's wins.
    t.host.floating.set(false);
    t.run();
    t.host.floating.set(true);
    t.run();
    expect(t.rows()).toBe(2);
    expect(b.getAttribute('aria-pressed')).toBe('true');
  });

  it('says nothing and emits no filter event for the host’s toggle', () => {
    const t = mount();
    const n = t.host.all.length;
    t.host.floating.set(true);
    t.run();
    t.host.floating.set(false);
    t.run();
    expect(t.host.all.slice(n).filter((e) => e.type === 'filterChanged')).toEqual([]);
    expect(t.el.querySelector('[aria-live]')?.textContent ?? '').not.toMatch(/Filter row/);
  });

  it('without the filters feature: ignored, no error', () => {
    const t = mount((h) => h.features.set([]));
    t.host.floating.set(true);
    expect(() => t.run()).not.toThrow();
    expect(t.rows()).toBe(1);
  });
});
