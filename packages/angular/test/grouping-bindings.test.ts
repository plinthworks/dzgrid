// Phase 7 step 8 (angular-parts.md « Row grouping » 1–5): `[(groupBy)]`, `groupByChanged` through `(gridEvent)`,
// `DzgController.grouping()`, the band through `[features]`, `rowGroups` in `[state]`. Made-up shops; expectations
// by hand, written before the code.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ColumnOrGroup, GridEvent, Problem } from '@dzgrid/core';
import type { GridState } from '@dzgrid/core/state';
import type { GridFeature } from '@dzgrid/dom';
import { grouping } from '@dzgrid/dom/grouping';
import { groupZone } from '@dzgrid/dom/group-zone';
import { gridState } from '@dzgrid/dom/state';
import { EN } from '@dzgrid/dom/locales/en';
import { EN_GROUP } from '@dzgrid/dom/locales/en-group';
import { DzGrid, DzgController } from '@dzgrid/angular';
import { fakeEnv } from './support';

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
});

type S = { id: string; region: string; fruit: string; qty: number };
const ROWS: S[] = [
  { id: 's1', region: 'Nord', fruit: 'apple', qty: 2 },
  { id: 's2', region: 'Sud', fruit: 'fig', qty: 3 },
  { id: 's3', region: 'Nord', fruit: 'fig', qty: 4 },
];
const COLUMNS: ColumnOrGroup<S>[] = [{ id: 'region', header: 'Region' }, { id: 'fruit', header: 'Fruit' }, { id: 'qty', header: 'Qty', type: 'number', aggFunc: 'sum' }];
const MESSAGES = { locale: 'en', text: { ...EN.text, ...EN_GROUP.text } };

@Component({
  selector: 't-host',
  imports: [DzGrid],
  template: `<dz-grid [rows]="rows" [columns]="columns" [getRowId]="id" [messages]="messages" [features]="features"
    [(groupBy)]="by" [state]="saved()" (stateChanged)="saved.set($event.state)"
    (problems)="problems.push(...$event)" (gridEvent)="all.push($event); $event.type === 'groupByChanged' && told.push($event)" />`,
})
class Host {
  readonly rows = ROWS;
  readonly columns = COLUMNS;
  readonly id = (s: S) => s.id;
  readonly messages = MESSAGES;
  features: GridFeature[] = [];
  readonly by = signal<readonly string[] | undefined>(undefined);
  readonly saved = signal<GridState | undefined>(undefined);
  readonly told: { by: readonly string[]; source: string }[] = [];
  readonly problems: Problem[] = [];
  readonly all: GridEvent<S>[] = [];
}

function mount(features: GridFeature[], by?: readonly string[]) {
  TestBed.configureTestingModule({ providers: [fakeEnv().provider] });
  const fixture = TestBed.createComponent(Host);
  const host = fixture.componentInstance;
  host.features = features;
  host.by.set(by);
  document.body.appendChild(fixture.nativeElement);
  const ctl = fixture.debugElement.children[0]!.injector.get(DzgController) as DzgController<S>;
  const shown = () => {
    const d = ctl.kernel()!.rows.displayed;
    return Array.from({ length: d.count }, (_, i) => {
      const n = d.nodeAt(d.index(i)!);
      return n.kind === 'group' ? `[${n.label}]` : n.kind === 'data' ? String(n.id) : n.kind;
    });
  };
  return { fixture, host, ctl, shown, run: () => fixture.detectChanges() };
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('[(groupBy)]', () => {
  it('the host\'s value regroups as the host (told with source host, no stateChanged); an equal value writes nothing', async () => {
    const g = grouping({ by: ['region'] });
    const t = mount([g, gridState({ debounce: 5 })], ['fruit']);
    t.run();
    expect(t.ctl.grouping()!.by()).toEqual(['fruit']);
    expect(t.shown()).toEqual(['[apple]', '[fig]']);
    // groupByChanged tells the host's own regroup too (source host); the model is not written back.
    expect(t.host.told.map((e) => [e.source, e.by])).toEqual([['host', ['fruit']]]);
    t.host.by.set(['fruit']);
    t.run();
    await wait(30);
    t.run();
    expect(t.host.saved()).toBeUndefined();
    expect(t.host.told).toHaveLength(1);
  });

  it('a user\'s regroup comes back in groupBy (groupByChange) and groupByChanged, and in (stateChanged) with rowGroups', async () => {
    const g = grouping({ by: ['region'] });
    const t = mount([g, gridState({ debounce: 5 })]);
    t.run();
    t.ctl.grouping()!.setBy(['fruit', 'region'], { user: true });
    t.run();
    expect(t.host.by()).toEqual(['fruit', 'region']);
    expect(t.host.told.map((e) => [e.source, e.by])).toEqual([['user', ['fruit', 'region']]]);
    await wait(30);
    t.run();
    expect(t.host.saved()!.rowGroups).toEqual(['fruit', 'region']);
    // The model's echo writes nothing: one regroup told.
    expect(t.host.all.filter((e) => e.type === 'groupByChanged')).toHaveLength(1);
  });

  it('without grouping() in [features]: one missing-feature at groupBy, nothing thrown', () => {
    const t = mount([], ['region']);
    t.run();
    t.host.by.set(['fruit']);
    t.run();
    expect(t.host.problems.filter((p) => p.code === 'missing-feature').map((p) => [p.path, p.detail])).toEqual([['groupBy', 'grouping']]);
    expect(t.ctl.grouping()).toBeNull();
  });
});

describe('DzgController', () => {
  it('grouping(): null before the grid; then by, setBy, expandAll(depth?), collapseAll(), totals()', () => {
    const g = grouping({ by: ['region', 'fruit'] });
    const t = mount([g]);
    expect(t.ctl.grouping()).toBeNull();
    t.run();
    const api = t.ctl.grouping()!;
    api.expandAll(1);
    expect(t.shown()).toEqual(['[Nord]', '[apple]', '[fig]', '[Sud]', '[fig]']);
    api.expandAll();
    expect(t.shown()).toEqual(['[Nord]', '[apple]', 's1', '[fig]', 's3', '[Sud]', '[fig]', 's2']);
    api.collapseAll();
    expect(t.shown()).toEqual(['[Nord]', '[Sud]']);
    expect(api.totals()).toEqual({ qty: 9 });
  });

  it('the band through [features]: groupZone() draws its toolbar in the grid', () => {
    const g = grouping({ by: ['region'] });
    const t = mount([g, groupZone({ use: { grouping: g } })]);
    t.run();
    const band = (t.fixture.nativeElement as HTMLElement).querySelector('[role=toolbar]');
    expect(band).not.toBeNull();
    expect(band!.textContent).toContain('Region');
  });
});
