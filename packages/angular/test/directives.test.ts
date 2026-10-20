// dzgSearch and dzgExport: the page's own field and button bound to a feature (step 22).
import { describe, it, expect, afterEach, vi } from 'vitest';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { GridEvent } from '@dzgrid/core';
import type { GridFeature } from '@dzgrid/dom';
import { quickSearch } from '@dzgrid/dom/search';
import type { CsvExport } from '@dzgrid/dom/export';
import { DzGrid, DzgController, DzgExport, DzgSearch } from '@dzgrid/angular';
import { COLUMNS, MESSAGES, ROWS, fakeEnv, rowId, type R } from './support';

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
});

/** A stand-in export feature: records its binds and unbinds. */
function fakeExport() {
  const log: string[] = [];
  const feature = {
    id: 'export',
    busy: false,
    run: vi.fn(async () => 'done' as const),
    cancel() {},
    prefetch() {},
    bind: vi.fn((b: HTMLElement, o?: { scope?: string }) => {
      log.push(`bind ${b.tagName.toLowerCase()} ${o?.scope ?? '-'}`);
      return () => void log.push('unbind');
    }),
    setup: () => ({ destroy() {} }),
  };
  return { log, feature: feature as unknown as CsvExport };
}

const search = quickSearch();
const exporter = fakeExport();

@Component({
  selector: 't-host',
  imports: [DzGrid, DzgSearch, DzgExport],
  template: `
    @if (before()) { <input class="q1" [dzgSearch]="search" [dzgSearchDebounce]="0" /> }
    @if (shown()) {
      <dz-grid [rows]="rows" [columns]="cols" [getRowId]="id" [messages]="messages" [features]="features" (gridEvent)="all.push($event)" />
    }
    @if (after()) { <input class="q2" [dzgSearch]="search" /> }
    @if (button()) { <button type="button" class="x" [dzgExport]="exporter.feature" dzgExportScope="all">CSV</button> }`,
})
class Host {
  readonly rows = ROWS;
  readonly cols = COLUMNS;
  readonly id = rowId;
  readonly messages = MESSAGES;
  readonly search = search;
  readonly exporter = exporter;
  readonly features: GridFeature[] = [search];
  readonly before = signal(true);
  readonly after = signal(false);
  readonly shown = signal(true);
  readonly button = signal(false);
  readonly all: GridEvent<R>[] = [];
}

function mount(o: { shown?: boolean } = {}) {
  TestBed.configureTestingModule({ providers: [fakeEnv().provider] });
  const fixture = TestBed.createComponent(Host);
  if (o.shown === false) fixture.componentInstance.shown.set(false);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  document.body.append(el);
  const type = (sel: string, text: string) => {
    const i = el.querySelector<HTMLInputElement>(sel)!;
    i.value = text;
    i.dispatchEvent(new InputEvent('input', { bubbles: true }));
  };
  const ctrl = () => fixture.debugElement.query((d) => d.name === 'dz-grid')?.injector.get(DzgController);
  return { fixture, el, host: fixture.componentInstance, type, ctrl, run: () => fixture.detectChanges() };
}

describe('dzgSearch', () => {
  it('binds a field placed before the grid: typing searches', () => {
    vi.useFakeTimers();
    const t = mount();
    t.type('.q1', 'ann');
    vi.advanceTimersByTime(10);
    expect(t.ctrl()!.kernel()!.query.quick).toBe('ann');
  });

  it('binds a field made after the grid, and a field bound while no grid exists yet', () => {
    vi.useFakeTimers();
    const t = mount({ shown: false });
    t.host.after.set(true);
    t.run();
    t.host.shown.set(true);
    t.run();
    t.type('.q2', 'bob1');
    vi.advanceTimersByTime(400);
    expect(t.ctrl()!.kernel()!.query.quick).toBe('bob1');
  });

  it('unbinds on destroy: the field no longer drives the grid', () => {
    vi.useFakeTimers();
    const t = mount();
    const field = t.el.querySelector<HTMLInputElement>('.q1')!;
    t.host.before.set(false);
    t.run();
    field.value = 'zzz';
    field.dispatchEvent(new InputEvent('input', { bubbles: true }));
    vi.advanceTimersByTime(400);
    expect(t.ctrl()!.kernel()!.query.quick).toBe('');
  });
});

describe('dzgExport', () => {
  it('binds the button with its scope after the first render, before the grid or not, and unbinds on destroy', async () => {
    exporter.log.length = 0;
    const t = mount({ shown: false });
    t.host.button.set(true);
    t.run();
    await t.fixture.whenStable();
    expect(exporter.log).toEqual(['bind button all']);
    t.host.button.set(false);
    t.run();
    expect(exporter.log).toEqual(['bind button all', 'unbind']);
  });
});
