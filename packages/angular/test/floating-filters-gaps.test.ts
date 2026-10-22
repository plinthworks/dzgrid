// <dz-grid [floatingFilters]>: initial value against the feature's own state, and the user's toggle (Phase 4 step 12).
import { describe, it, expect, afterEach } from 'vitest';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { GridFeature } from '@dzgrid/dom';
import { filters } from '@dzgrid/dom/filters';
import { DzGrid, provideDzGrid } from '@dzgrid/angular';
import { COLUMNS, MESSAGES, ROWS, fakeEnv, rowId } from './support';

afterEach(() => {
  document.body.innerHTML = '';
  TestBed.resetTestingModule();
});

@Component({
  selector: 't-floating-gaps',
  imports: [DzGrid],
  template: `<dz-grid [rows]="rows" [columns]="columns" [getRowId]="id" [messages]="messages" [features]="features()" [floatingFilters]="floating()" />`,
})
class Host {
  rows = ROWS;
  columns = COLUMNS;
  readonly id = rowId;
  messages = MESSAGES;
  f = filters({ floating: true });
  readonly features = signal<GridFeature[]>([]);
  readonly floating = signal<boolean | undefined>(undefined);
}

function mount(setup?: (h: Host) => void) {
  TestBed.configureTestingModule({ providers: [fakeEnv().provider] });
  const fixture = TestBed.createComponent(Host);
  const h = fixture.componentInstance;
  h.features.set([h.f]);
  setup?.(h);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const rows = () => el.querySelectorAll('.dzg-header > [role=row]').length;
  return { fixture, el, host: h, rows, run: () => fixture.detectChanges() };
}

describe('[floatingFilters] gaps', () => {
  it('false at creation wins over filters({ floating: true }): the grid starts without the row', () => {
    const t = mount((h) => h.floating.set(false));
    expect(t.rows()).toBe(1);
    expect(t.host.f.floating.get()).toBe(false);
    expect(t.el.querySelector('.dzg-viewport')!.getAttribute('aria-rowcount')).toBe(String(ROWS.length + 1));
  });

  it('back to undefined after a value: the state stays as it is', () => {
    const t = mount((h) => h.floating.set(false));
    t.host.floating.set(undefined);
    t.run();
    expect(t.rows()).toBe(1);
    t.host.f.floating.set(true);
    t.host.floating.set(false);
    t.run();
    t.host.floating.set(undefined);
    t.run();
    expect(t.rows()).toBe(1);
  });

  it('unset on a grid whose filters({ floating: true }) shows the row: shown, untouched', () => {
    const t = mount();
    expect(t.rows()).toBe(2);
    expect(t.host.f.floating.get()).toBe(true);
  });

  it('a user toggle at creation-time state, then the same host value: no echo', () => {
    const t = mount((h) => h.floating.set(true));
    const b = document.createElement('button');
    document.body.append(b);
    t.host.f.floating.bind(b);
    b.click();
    t.run();
    expect(t.rows()).toBe(1);
  });

  // Was a bug: the effect also read `features()`: a new [features] array (same filters object) ran it again and
  // wrote the old [floatingFilters] value over the user's toggle, the echo the input promises never to make.
  it('a new [features] array (same filters object) does not write the input over the user’s toggle', () => {
    const t = mount((h) => h.floating.set(true));
    const b = document.createElement('button');
    document.body.append(b);
    t.host.f.floating.bind(b);
    b.click();
    expect(t.rows()).toBe(1);
    t.host.features.set([t.host.f]);
    t.run();
    expect(t.host.f.floating.get()).toBe(false);
    expect(t.rows()).toBe(1);
  });
});

@Component({
  selector: 't-floating-defaults',
  imports: [DzGrid],
  template: `<dz-grid [rows]="rows" [columns]="columns" [getRowId]="id" [messages]="messages" [floatingFilters]="floating()" />`,
})
class Defaults {
  rows = ROWS;
  columns = COLUMNS;
  readonly id = rowId;
  messages = MESSAGES;
  readonly floating = signal<boolean | undefined>(false);
}

describe('[floatingFilters] with provideDzGrid({ defaults: { features } })', () => {
  it('acts on the application’s filters() when the tag has no [features]: at creation and live', () => {
    const f = filters({ floating: true });
    // `DzGridDefaults` does not type `features`, but the grid reads it among its defaults (grid.ts KEYS).
    TestBed.configureTestingModule({ providers: [fakeEnv().provider, provideDzGrid({ defaults: { features: [f] } as never })] });
    const fixture = TestBed.createComponent(Defaults);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const rows = () => el.querySelectorAll('.dzg-header > [role=row]').length;
    expect(f.floating.get()).toBe(false);
    expect(rows()).toBe(1);
    fixture.componentInstance.floating.set(true);
    fixture.detectChanges();
    expect(f.floating.get()).toBe(true);
    expect(rows()).toBe(2);
  });
});
