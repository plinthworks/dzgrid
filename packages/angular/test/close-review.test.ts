// Phase 6 close, Part A (review of 6166f12): `[state]` given back equal to an older value after the grid moved
// (« reset to saved ») is restored; a value then null restores nothing; `gridState({ persist })` with `[state]` on a
// server grid asks ONE request; `selectedIds()` leaves out every key that is not a data row's (groups, pinned rows,
// details, a malformed key). Expectations by hand; written before the fixes.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { dataKey, detailKey, groupKey, pinnedKey, type ColumnDef, type RowKey } from '@dzgrid/core';
import { sourceRows, type DataRequest } from '@dzgrid/core/server';
import type { GridState } from '@dzgrid/core/state';
import type { GridFeature } from '@dzgrid/dom';
import { gridState } from '@dzgrid/dom/state';
import { DzGrid, DzgController, selectedIds } from '@dzgrid/angular';
import { MESSAGES, ROWS, fakeEnv, rowId, type R } from './support';

afterEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
});

const COLS: ColumnDef<R, any>[] = [
  { id: 'name', header: 'Name', width: 120 },
  { id: 'n', header: 'N', type: 'number', width: 100 },
  { id: 's', header: 'Status', width: 100 },
];
const S1: GridState = { v: 1, sort: [{ column: 'n', dir: 'desc' }] } as never;

@Component({
  selector: 't-host',
  imports: [DzGrid],
  template: `<dz-grid [rows]="rows" [source]="source" [columns]="columns" [getRowId]="id" [messages]="messages" [features]="features"
    [state]="state()" [selection]="{ mode: 'multi' }" />`,
})
class Host {
  rows: R[] | undefined = ROWS;
  source: any = undefined;
  readonly columns = COLS;
  readonly id = rowId;
  readonly messages = MESSAGES;
  features: GridFeature[] = [];
  readonly state = signal<GridState | null | undefined>(undefined);
}

function mount(o: { features?: GridFeature[]; state?: GridState; server?: boolean } = {}) {
  TestBed.configureTestingModule({ providers: [fakeEnv().provider] });
  const fixture = TestBed.createComponent(Host);
  const host = fixture.componentInstance;
  const reqs: DataRequest[] = [];
  if (o.server) {
    host.rows = undefined;
    host.source = sourceRows({ fetch: (req: DataRequest) => (reqs.push(req), { rows: ROWS.slice(0, 20), total: 300 }) });
  }
  host.features = o.features ?? [];
  if (o.state) host.state.set(o.state);
  document.body.appendChild(fixture.nativeElement);
  const ctl = fixture.debugElement.children[0]!.injector.get(DzgController) as DzgController<R>;
  return { fixture, host, ctl, reqs, run: () => fixture.detectChanges() };
}

describe('[state] after the grid moved', () => {
  it('« reset to saved »: a NEW object equal to the value restored earlier is restored again once the user changed the grid', () => {
    const st = gridState();
    const t = mount({ features: [st], state: S1 });
    t.run();
    const k = t.ctl.kernel()!;
    expect(k.query.sort).toEqual([{ column: 'n', dir: 'desc' }]);
    k.dispatch({ type: 'sort.set', sort: [{ column: 'name', dir: 'asc' }] }, 'user');
    const spy = vi.spyOn(st.api({ kernel: k })!, 'setState');
    t.host.state.set(JSON.parse(JSON.stringify(S1)));
    t.run();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(k.query.sort).toEqual([{ column: 'n', dir: 'desc' }]);
  });

  it('a value, then null: nothing is restored, the grid keeps what the user did', () => {
    const st = gridState();
    const t = mount({ features: [st], state: S1 });
    t.run();
    const k = t.ctl.kernel()!;
    k.dispatch({ type: 'sort.set', sort: [{ column: 'name', dir: 'asc' }] }, 'user');
    const spy = vi.spyOn(st.api({ kernel: k })!, 'setState');
    t.host.state.set(null);
    t.run();
    t.host.state.set(undefined);
    t.run();
    expect(spy).not.toHaveBeenCalled();
    expect(k.query.sort).toEqual([{ column: 'name', dir: 'asc' }]);
  });
});

describe('gridState({ persist }) and [state] on a server grid', () => {
  it('ONE request, carrying the stored filter and [state]\'s sort (applied after the storage)', () => {
    localStorage.setItem('c6-k', JSON.stringify({ v: 1, sort: [{ column: 's', dir: 'asc' }], filter: { s: { type: 'text', op: 'contains', value: 'odd' } } }));
    const t = mount({ features: [gridState({ persist: { key: 'c6-k' } })], server: true, state: { v: 1, sort: [{ column: 'name', dir: 'desc' }] } as never });
    t.run();
    expect(t.reqs.length).toBe(1);
    expect(t.reqs[0]!.sort).toEqual([{ column: 'name', dir: 'desc' }]);
    expect(JSON.stringify(t.reqs[0]!.filter)).toContain('odd');
  });

  it('persist alone (no [state]): one request with the stored state, as before', () => {
    localStorage.setItem('c6-k', JSON.stringify({ v: 1, sort: [{ column: 's', dir: 'asc' }] }));
    const t = mount({ features: [gridState({ persist: { key: 'c6-k' } })], server: true });
    t.run();
    expect(t.reqs.length).toBe(1);
    expect(t.reqs[0]!.sort).toEqual([{ column: 's', dir: 'asc' }]);
  });
});

describe('selectedIds(): only data rows\' ids', () => {
  it('a group key, a pinned key, a detail key and a malformed key are left out (idOfDataKey gives null)', () => {
    const t = mount();
    t.run();
    const keys = new Set<RowKey>([dataKey('r1')!, groupKey(['odd']), pinnedKey('top', 'r2')!, detailKey(dataKey('r3')!), 'd:9:r4' as RowKey, dataKey('r5')!]);
    t.ctl.dispatch({ type: 'selection.set', selection: { mode: 'exclude', keys } });
    const s = selectedIds(t.ctl)!;
    expect(s.ids).toEqual(['r1', 'r5']);
    expect(s.ids.every((x) => typeof x === 'string')).toBe(true);
  });
});
