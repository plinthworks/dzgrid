// [(expanded)] with filler rows (a `path` tree) and with no model at all while rows arrive late
// (coverage review of phase 4 step 11).
import { describe, it, expect, afterEach } from 'vitest';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { dataKey, groupKey, type ColumnOrGroup, type GridEvent, type RowKey } from '@dzgrid/core';
import type { GridFeature } from '@dzgrid/dom';
import { tree } from '@dzgrid/dom/tree';
import { EN_TREE } from '@dzgrid/dom/locales/en-tree';
import { DzGrid } from '@dzgrid/angular';
import { MESSAGES, fakeEnv } from './support';

afterEach(() => {
  document.body.innerHTML = '';
  TestBed.resetTestingModule();
});

type C = { id: string; name: string; at: string[]; parent?: string | null };
const CITIES: C[] = [
  { id: 'paris', name: 'Paris', at: ['Europe', 'France', 'Paris'] },
  { id: 'lyon', name: 'Lyon', at: ['Europe', 'France', 'Lyon'] },
  { id: 'rome', name: 'Rome', at: ['Europe', 'Italy', 'Rome'] },
];
const ASIA: C[] = [{ id: 'kyoto', name: 'Kyoto', at: ['Asia', 'Japan', 'Kyoto'] }];
const show = (s: ReadonlySet<RowKey> | undefined) => [...(s ?? [])].map(String).sort();
const g = (...p: string[]) => groupKey(p);

@Component({
  selector: 't-path',
  imports: [DzGrid],
  template: `<dz-grid [rows]="rows()" [columns]="cols" [getRowId]="id" [messages]="messages" [features]="features"
    [expanded]="open()" (expandedChange)="changes.push($event!); open.set($event)" (problems)="problems.push($event)" (rowExpanded)="fired.push($event)" />`,
})
class PathHost {
  readonly rows = signal<C[]>(CITIES);
  readonly cols: ColumnOrGroup<C>[] = [{ id: 'name', header: 'Name' }];
  readonly id = (r: C) => r.id;
  readonly messages = { ...MESSAGES, text: { ...MESSAGES.text, ...EN_TREE.text } };
  features: GridFeature[] = [tree<C>({ path: (r) => r.at })];
  readonly open = signal<ReadonlySet<RowKey> | undefined>(undefined);
  readonly changes: ReadonlySet<RowKey>[] = [];
  readonly problems: unknown[] = [];
  readonly fired: Extract<GridEvent<C>, { type: 'rowExpanded' }>[] = [];
}

function mount(setup: (h: PathHost) => void = () => {}) {
  TestBed.configureTestingModule({ providers: [fakeEnv().provider] });
  const fixture = TestBed.createComponent(PathHost);
  setup(fixture.componentInstance);
  fixture.detectChanges();
  const grid = fixture.debugElement.query(By.directive(DzGrid)).componentInstance as DzGrid<C>;
  return { fixture, host: fixture.componentInstance, kernel: grid.controller.kernel()! };
}

describe('[(expanded)] with filler rows (tree path)', () => {
  it('filler keys written by the host open, as the host, with no echo and no problem', () => {
    const t = mount((h) => h.open.set(new Set([g('Europe'), g('Europe', 'France')])));
    expect(show(t.kernel.expansion)).toEqual(show(new Set([g('Europe'), g('Europe', 'France')])));
    expect(t.host.changes).toEqual([]);
    expect(t.host.problems).toEqual([]);
    expect(t.host.fired.every((e) => e.source === 'host')).toBe(true);
  });

  it('a filler key of a group not there yet does not stop the others, and opens when its rows arrive', () => {
    const t = mount((h) => h.open.set(new Set([g('Europe'), g('Asia'), dataKey('nowhere')!])));
    expect(show(t.kernel.expansion)).toEqual([String(g('Europe'))]);
    expect(t.host.problems).toEqual([]);
    t.host.rows.set([...CITIES, ...ASIA]);
    t.fixture.detectChanges();
    expect(show(t.kernel.expansion)).toEqual(show(new Set([g('Europe'), g('Asia')])));
  });

  it('an empty set closes fillers; a user toggle on a filler comes back', () => {
    const t = mount((h) => h.open.set(new Set([g('Europe'), g('Europe', 'Italy')])));
    t.host.open.set(new Set());
    t.fixture.detectChanges();
    expect(t.kernel.expansion.size).toBe(0);
    t.kernel.dispatch({ type: 'rows.expand', rows: [g('Europe')], expanded: true }, 'user');
    expect(show(t.host.changes.at(-1))).toEqual([String(g('Europe'))]);
  });
});

describe('[(expanded)] with no model, rows arriving after the grid is made', () => {
  it('the tree’s initial opening, applied at the first non-empty load, comes back', () => {
    const t = mount((h) => {
      h.rows.set([]);
      h.features = [tree<C>({ parentId: (r) => r.parent ?? null, initial: 'all' })];
    });
    expect(t.host.changes).toEqual([]);
    t.host.rows.set([{ id: 'a', name: 'A', at: [], parent: null }, { id: 'a1', name: 'A1', at: [], parent: 'a' }]);
    t.fixture.detectChanges();
    expect(show(t.kernel.expansion)).toEqual([String(dataKey('a'))]);
    expect(show(t.host.open())).toEqual([String(dataKey('a'))]);
    expect(t.host.changes).toHaveLength(1);
  });
});
