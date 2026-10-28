// The owner's two 1.1.0 controller methods: `clearFilters()` (every column filter and the search emptied, the sort kept,
// one request on a server; the no-results panel's action) and `resetState()` (the `gridState()` feature's `reset()`: the
// grid as defined at creation). With `[state]="saved()" (stateChanged)="saved.set($event.state)"`, a reset settles: one
// stateChanged, no restore back. Expectations by hand; written before the code.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { GridEvent } from '@dzgrid/core';
import { sourceRows, type DataRequest } from '@dzgrid/core/server';
import { stateText, type GridState } from '@dzgrid/core/state';
import type { GridFeature } from '@dzgrid/dom';
import { gridState } from '@dzgrid/dom/state';
import { DzGrid, DzgController } from '@dzgrid/angular';
import { COLUMNS, MESSAGES, ROWS, fakeEnv, rowId, type R } from './support';

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
});

@Component({
  selector: 't-host',
  imports: [DzGrid],
  template: `<dz-grid [rows]="rows" [source]="source" [columns]="columns" [getRowId]="id" [messages]="messages" [features]="features"
    [state]="saved()" (stateChanged)="changed.push($event); saved.set($event.state)" (gridEvent)="all.push($event)" />`,
})
class Host {
  rows: R[] | undefined = ROWS;
  source: any = undefined;
  readonly columns = COLUMNS;
  readonly id = rowId;
  readonly messages = MESSAGES;
  features: GridFeature[] = [];
  readonly saved = signal<GridState | undefined>(undefined);
  readonly changed: { state: GridState; source: string }[] = [];
  readonly all: GridEvent<R>[] = [];
}

function mount(o: { features?: GridFeature[]; server?: boolean } = {}) {
  TestBed.configureTestingModule({ providers: [fakeEnv().provider] });
  const fixture = TestBed.createComponent(Host);
  const host = fixture.componentInstance;
  const reqs: DataRequest[] = [];
  if (o.server) {
    host.rows = undefined;
    host.source = sourceRows({ fetch: (req: DataRequest) => (reqs.push(req), { rows: ROWS.slice(0, 20), total: 300 }) });
  }
  host.features = o.features ?? [];
  document.body.appendChild(fixture.nativeElement);
  const ctl = fixture.debugElement.children[0]!.injector.get(DzgController) as DzgController<R>;
  return { fixture, host, ctl, reqs, run: () => fixture.detectChanges() };
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const FILTER = { s: { type: 'text', op: 'contains', value: 'odd' } } as const;

describe('DzgController.clearFilters()', () => {
  it('false before the grid; then every filter and the search emptied, the sort kept; stateChanged follows (source api)', async () => {
    const t = mount({ features: [gridState({ debounce: 5 })] });
    expect(t.ctl.clearFilters()).toBe(false);
    t.run();
    const k = t.ctl.kernel()!;
    k.dispatch({ type: 'sort.set', sort: [{ column: 'n', dir: 'desc' }] }, 'user');
    k.dispatch({ type: 'filter.set', filter: FILTER as never }, 'user');
    k.dispatch({ type: 'quick.set', text: 'bob' }, 'user');
    await wait(30);
    t.run();
    expect(t.host.changed.length).toBe(1);
    expect(t.ctl.clearFilters()).toBe(true);
    expect([k.query.filter, k.query.quick, k.query.sort]).toEqual([{}, '', [{ column: 'n', dir: 'desc' }]]);
    await wait(30);
    expect(t.host.changed.map((e) => e.source)).toEqual(['user', 'api']);
  });

  it('a server grid: one request, the sort kept', () => {
    const t = mount({ server: true });
    t.run();
    const k = t.ctl.kernel()!;
    k.dispatch({ type: 'sort.set', sort: [{ column: 'name', dir: 'asc' }] }, 'user');
    k.dispatch({ type: 'filter.set', filter: FILTER as never }, 'user');
    k.dispatch({ type: 'quick.set', text: 'x' }, 'user');
    const n = t.reqs.length;
    expect(t.ctl.clearFilters()).toBe(true);
    expect(t.reqs.length - n).toBe(1);
    const r = t.reqs.at(-1)!;
    expect([r.sort, r.quick ?? '', JSON.stringify(r.filter ?? {})]).toEqual([[{ column: 'name', dir: 'asc' }], '', '{}']);
  });
});

describe('DzgController.resetState()', () => {
  it('null before the grid and without gridState(); with it, the restore\'s problems ([] here)', () => {
    const none = mount();
    expect(none.ctl.resetState()).toBeNull();
    none.run();
    expect(none.ctl.resetState()).toBeNull();
    TestBed.resetTestingModule();
    const t = mount({ features: [gridState()] });
    expect(t.ctl.resetState()).toBeNull();
    t.run();
    expect(t.ctl.resetState()).toEqual([]);
  });

  it('with [state] and (stateChanged) bound to one signal: back to the initial state, one stateChanged, no restore back (no loop)', async () => {
    const st = gridState({ debounce: 5 });
    const t = mount({ features: [st] });
    t.run();
    const api = st.api({ kernel: t.ctl.kernel()! })!;
    const initial = stateText(api.state());
    const spy = vi.spyOn(api, 'setState');
    const k = t.ctl.kernel()!;
    k.dispatch({ type: 'column.state', patch: [{ id: 'n', hidden: true }, { id: 's', order: 0, width: 150 }] }, 'user');
    k.dispatch({ type: 'sort.set', sort: [{ column: 'name', dir: 'desc' }] }, 'user');
    k.dispatch({ type: 'quick.set', text: 'bob' }, 'user');
    await wait(30);
    t.run();
    expect(t.host.changed.length).toBe(1);
    expect(t.ctl.resetState()).toEqual([]);
    expect(stateText(api.state())).toBe(initial);
    await wait(30);
    t.run();
    await wait(30);
    t.run();
    expect(t.host.changed.map((e) => e.source)).toEqual(['user', 'api']);
    expect(stateText(t.host.saved()!)).toBe(initial);
    expect(spy).not.toHaveBeenCalled();
    expect(t.host.all.filter((e) => e.type === 'stateRestored')).toEqual([]);
  });

  it('a server grid: ONE request for the reset', () => {
    const t = mount({ features: [gridState()], server: true });
    t.run();
    const k = t.ctl.kernel()!;
    k.dispatch({ type: 'sort.set', sort: [{ column: 'name', dir: 'asc' }] }, 'user');
    k.dispatch({ type: 'quick.set', text: 'x' }, 'user');
    const n = t.reqs.length;
    t.ctl.resetState();
    expect(t.reqs.length - n).toBe(1);
    expect([t.reqs.at(-1)!.sort, t.reqs.at(-1)!.quick ?? '']).toEqual([[], '']);
  });
});
