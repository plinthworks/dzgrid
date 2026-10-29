// `expandedIds(controller)` (docs/behaviors/angular-parts.md « Saving the open rows by the app's own ids », step 16f):
// the ids of the open data rows; fillers left out; restored by `[expanded]` before the rows arrive. By hand.
import { describe, it, expect, afterEach } from 'vitest';
import { Component, computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { dataKey, groupKey, type ColumnOrGroup, type RowKey } from '@dzgrid/core';
import type { GridFeature } from '@dzgrid/dom';
import { tree } from '@dzgrid/dom/tree';
import { EN_TREE } from '@dzgrid/dom/locales/en-tree';
import { DzGrid, DzgController, expandedIds } from '@dzgrid/angular';
import { MESSAGES, fakeEnv } from './support';

afterEach(() => {
  document.body.innerHTML = '';
  TestBed.resetTestingModule();
});

type C = { id: string; name: string; parent: string | null };
// A parent-id tree: A has A1, B has B1.
const ROWS: C[] = [{ id: 'A', name: 'a', parent: null }, { id: 'A1', name: 'a1', parent: 'A' }, { id: 'B', name: 'b', parent: null }, { id: 'B1', name: 'b1', parent: 'B' }];

@Component({
  selector: 't-ids',
  imports: [DzGrid],
  template: `<dz-grid [rows]="rows()" [columns]="cols" [getRowId]="id" [messages]="messages" [features]="features" [expanded]="openKeys()" />`,
})
class Host {
  readonly rows = signal<C[]>(ROWS);
  readonly saved = signal<string[] | undefined>(undefined);
  readonly openKeys = computed(() => { const s = this.saved(); return s && new Set(s.map((id) => dataKey(id)!)); });
  readonly cols: ColumnOrGroup<C>[] = [{ id: 'name', header: 'Name' }];
  readonly id = (r: C) => r.id;
  readonly messages = { ...MESSAGES, text: { ...MESSAGES.text, ...EN_TREE.text } };
  features: GridFeature[] = [tree<C>({ parentId: (r) => r.parent })];
}

function mount(o: { rows?: C[]; saved?: string[]; features?: GridFeature[] } = {}) {
  TestBed.configureTestingModule({ providers: [fakeEnv().provider] });
  const fixture = TestBed.createComponent(Host);
  const host = fixture.componentInstance;
  if (o.rows) host.rows.set(o.rows);
  if (o.saved) host.saved.set(o.saved);
  if (o.features) host.features = o.features;
  document.body.appendChild(fixture.nativeElement);
  fixture.detectChanges();
  const ctl = fixture.debugElement.children[0]!.injector.get(DzgController) as DzgController<C>;
  return { fixture, host, ctl };
}

describe('expandedIds', () => {
  it('null before the grid; [] with nothing open; open A → [A]', () => {
    // A controller whose grid is not made yet (on a server, or before the first render): its kernel is null.
    expect(expandedIds({ kernel: () => null } as unknown as DzgController<C>)).toBeNull();
    const t = mount();
    expect(expandedIds(t.ctl)).toEqual([]);
    t.ctl.dispatch({ type: 'rows.expand', rows: [dataKey('A')!], expanded: true });
    expect(expandedIds(t.ctl)).toEqual(['A']);
  });

  it('a path tree: an open filler (g: key) is not listed, an open data row is', () => {
    type P = { id: string; name: string; at: string[] };
    const rows = [{ id: 'paris', name: 'Paris', at: ['Europe', 'Paris'] }, { id: 'eu', name: 'Europe', at: ['Europe'] }, { id: 'kyoto', name: 'Kyoto', at: ['Asia', 'Kyoto'] }];
    const t = mount({ rows: rows as unknown as C[], features: [tree<P>({ path: (r) => r.at }) as GridFeature] });
    t.ctl.dispatch({ type: 'rows.expand', rows: [groupKey(['Asia']), dataKey('eu')!] as RowKey[], expanded: true });
    expect([...t.ctl.kernel()!.expansion].map(String).sort()).toEqual([String(dataKey('eu')), String(groupKey(['Asia']))].sort());
    expect(expandedIds(t.ctl)).toEqual(['eu']);
  });

  it('restored before the rows arrive: A opens once it arrives', async () => {
    const t = mount({ rows: [], saved: ['A'] });
    expect(expandedIds(t.ctl)).toEqual([]);
    t.host.rows.set(ROWS);
    t.fixture.detectChanges();
    await t.fixture.whenStable();
    expect(expandedIds(t.ctl)).toEqual(['A']);
  });
});

// Review of 16c: a master that stopped being one while open can be closed through [(expanded)].
import { detail } from '@dzgrid/dom/detail';
import { definePart } from '@dzgrid/dom';
import { EN_DETAIL } from '@dzgrid/dom/locales/en-detail';

type M = { id: string; name: string; kids: number };
const MASTERS: M[] = [{ id: '1', name: 'one', kids: 1 }, { id: '3', name: 'three', kids: 2 }];

@Component({
  selector: 't-master',
  imports: [DzGrid],
  template: `<dz-grid [rows]="rows()" [columns]="cols" [getRowId]="id" [messages]="messages" [features]="features" [(expanded)]="open" />`,
})
class MasterHost {
  readonly rows = signal<M[]>(MASTERS);
  readonly open = signal<ReadonlySet<RowKey> | undefined>(new Set([dataKey('3')!]));
  readonly cols: ColumnOrGroup<M>[] = [{ id: 'name', header: 'Name' }];
  readonly id = (r: M) => r.id;
  readonly messages = { ...MESSAGES, text: { ...MESSAGES.text, ...EN_DETAIL.text } };
  readonly features: GridFeature[] = [detail<M>({ height: 60, isMaster: (r) => r.kids > 0, part: definePart('detail', { mount: (h) => ((h.textContent = 'd'), {}) }) })];
}

describe('[(expanded)] with detail({ isMaster })', () => {
  it('an open master patched to no children, then the model emptied: closed, and it stays closed when it has children again', async () => {
    TestBed.configureTestingModule({ providers: [fakeEnv().provider] });
    const fixture = TestBed.createComponent(MasterHost);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await fixture.whenStable();
    const ctl = fixture.debugElement.children[0]!.injector.get(DzgController) as DzgController<M>;
    expect(expandedIds(ctl)).toEqual(['3']);
    fixture.componentInstance.rows.set([MASTERS[0]!, { ...MASTERS[1]!, kids: 0 }]);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.componentInstance.open.set(new Set());
    fixture.detectChanges();
    await fixture.whenStable();
    expect(expandedIds(ctl)).toEqual([]);
    expect([...(fixture.componentInstance.open() ?? [])]).toEqual([]);
    fixture.componentInstance.rows.set(MASTERS);
    fixture.detectChanges();
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('.dzg-dbody')).toHaveLength(0);
  });
});
