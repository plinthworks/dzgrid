// Phase 6 step 12 (docs/phase-6-steps/step12-plan.md §1, §6 A1–A9; owner Q12-1–Q12-3): the wrapper's additions, all
// optional, 1.0.0's bindings untouched. `[state]` (restored at creation before the first request: ONE request on a
// server; a later new value restored; the same value, the one just emitted too, does nothing: no echo) and
// `(stateChanged)`; `[pinnedRows]`; `(densityChanged)`; `(selectionChanged)` typed; `DzgController.use()` / `.grid()`;
// `uiData()`, `selectedIds()` (ids, mode and query; `selectedRows` dropped for the line, see the plan « Done »); the 1.0.0 public names all still there. Expectations by hand; written before the code.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { dataKey, type ColumnDef, type GridEvent, type Problem } from '@dzgrid/core';
import { sourceRows, type DataRequest } from '@dzgrid/core/server';
import type { GridState } from '@dzgrid/core/state';
import type { GridFeature, GridMessages } from '@dzgrid/dom';
import { gridState } from '@dzgrid/dom/state';
import { pinnedRows } from '@dzgrid/dom/pinned-rows';
import { columnMenu } from '@dzgrid/dom/column-menu';
import { columnsChooser } from '@dzgrid/dom/columns-panel';
import { EN_PINNED } from '@dzgrid/dom/locales/en-pinned';
import { EN_COLUMN_MENU } from '@dzgrid/dom/locales/en-column-menu';
import { EN_COLUMNS } from '@dzgrid/dom/locales/en-columns';
import * as NG from '@dzgrid/angular';
import { DzGrid, DzgController, selectedIds, uiData } from '@dzgrid/angular';
import { MESSAGES, ROWS, fakeEnv, rowId, type R } from './support';

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
});

const MSG: GridMessages = { ...MESSAGES, text: { ...MESSAGES.text, ...EN_PINNED.text, ...EN_COLUMN_MENU.text, ...EN_COLUMNS.text } };
const COLS: ColumnDef<R, any>[] = [
  { id: 'name', header: 'Name', width: 120, ui: { data: { tone: 'blue' } } },
  { id: 'n', header: 'N', type: 'number', width: 100 },
  { id: 's', header: 'Status', width: 100 },
];
const S1: GridState = { v: 1, columns: [{ id: 's', pinned: null, order: 0, width: 150 }, { id: 'name', pinned: null, order: 1 }, { id: 'n', pinned: null, order: 2 }], sort: [{ column: 'n', dir: 'desc' }] } as never;

@Component({
  selector: 't-host',
  imports: [DzGrid],
  template: `<dz-grid [rows]="rows" [source]="source" [columns]="columns" [getRowId]="id" [messages]="messages" [features]="features"
    [state]="state()" (stateChanged)="changed.push($event); echo && state.set($event.state)" [pinnedRows]="pins()"
    [density]="density()" (densityChanged)="densities.push($event.density)" (selectionChanged)="sel.push($event.count)"
    [selection]="{ mode: 'multi' }" (problems)="problems.push(...$event)" (gridEvent)="all.push($event)" (gridReady)="ctl = $event" />`,
})
class Host {
  rows: R[] | undefined = ROWS;
  source: any = undefined;
  readonly columns = COLS;
  readonly id = rowId;
  readonly messages = MSG;
  features: GridFeature[] = [];
  echo = false;
  readonly state = signal<GridState | null | undefined>(undefined);
  readonly pins = signal<{ top?: readonly R[]; bottom?: readonly R[] } | undefined>(undefined);
  readonly density = signal<'compact' | 'comfortable' | 'spacious' | undefined>(undefined);
  readonly changed: { state: GridState; source: string }[] = [];
  readonly densities: string[] = [];
  readonly sel: (number | null)[] = [];
  readonly problems: Problem[] = [];
  readonly all: GridEvent<R>[] = [];
  ctl: DzgController<R> | null = null;
}

function mount(o: { features?: GridFeature[]; state?: GridState; server?: boolean; echo?: boolean; pins?: { top?: R[]; bottom?: R[] } } = {}) {
  TestBed.configureTestingModule({ providers: [fakeEnv().provider] });
  const fixture = TestBed.createComponent(Host);
  const host = fixture.componentInstance;
  const reqs: DataRequest[] = [];
  if (o.server) {
    host.rows = undefined;
    host.source = sourceRows({ fetch: (req: DataRequest) => (reqs.push(req), { rows: ROWS.slice(0, 20), total: 300 }) });
  }
  host.features = o.features ?? [];
  host.echo = !!o.echo;
  if (o.state) host.state.set(o.state);
  if (o.pins) host.pins.set(o.pins);
  document.body.appendChild(fixture.nativeElement);
  const ctl = fixture.debugElement.children[0]!.injector.get(DzgController) as DzgController<R>;
  return { fixture, host, ctl, reqs, run: () => fixture.detectChanges() };
}
const order = (t: ReturnType<typeof mount>) => t.ctl.kernel()!.columns.visible().map((c) => c.id);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('[state] and (stateChanged)', () => {
  it('a state set before the grid is made is restored at creation: order, width, sort', () => {
    const st = gridState();
    const t = mount({ features: [st], state: S1 });
    t.run();
    expect(order(t)).toEqual(['s', 'name', 'n']);
    expect(t.ctl.kernel()!.columns.state().find((c) => c.id === 's')!.width).toBe(150);
    expect(t.ctl.kernel()!.query.sort).toEqual([{ column: 'n', dir: 'desc' }]);
  });

  it('a later new value restores again; the same value (canonically equal) does nothing', () => {
    const st = gridState();
    const t = mount({ features: [st] });
    t.run();
    const api = st.api({ kernel: t.ctl.kernel()! })!;
    const spy = vi.spyOn(api, 'setState');
    t.host.state.set(S1);
    t.run();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(order(t)).toEqual(['s', 'name', 'n']);
    // Equal content, another object, keys in another order: nothing.
    t.host.state.set(JSON.parse(JSON.stringify({ sort: S1.sort, columns: S1.columns, v: 1 })));
    t.run();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('(stateChanged) once per gesture, after the pause, source user; never for the host\'s restore', async () => {
    const t = mount({ features: [gridState({ debounce: 5 })], state: S1 });
    t.run();
    await wait(30);
    expect(t.host.changed).toEqual([]);
    t.ctl.kernel()!.dispatch({ type: 'sort.set', sort: [{ column: 'name', dir: 'asc' }] }, 'user');
    t.ctl.kernel()!.dispatch({ type: 'sort.set', sort: [{ column: 'name', dir: 'desc' }] }, 'user');
    await wait(30);
    expect(t.host.changed.length).toBe(1);
    expect(t.host.changed[0]!.source).toBe('user');
    expect(t.host.changed[0]!.state.sort).toEqual([{ column: 'name', dir: 'desc' }]);
  });

  it('the echo loop settles: [state]="s()" (stateChanged)="s.set($event.state)" never restores what it just received', async () => {
    const st = gridState({ debounce: 5 });
    const t = mount({ features: [st], echo: true });
    t.run();
    const spy = vi.spyOn(st.api({ kernel: t.ctl.kernel()! })!, 'setState');
    t.ctl.kernel()!.dispatch({ type: 'column.state', patch: [{ id: 'n', hidden: true }] }, 'user');
    await wait(30);
    t.run();
    await wait(30);
    t.run();
    expect(t.host.changed.length).toBe(1);
    expect(spy).not.toHaveBeenCalled();
    expect(order(t)).toEqual(['name', 's']);
  });

  it('a server grid with [state] at creation: exactly ONE request, carrying the restored sort and filter (E5-1)', () => {
    const t = mount({ features: [gridState()], server: true, state: { v: 1, sort: [{ column: 'name', dir: 'asc' }], filter: { s: { type: 'text', op: 'contains', value: 'odd' } } } as never });
    t.run();
    expect(t.reqs.length).toBe(1);
    expect(t.reqs[0]!.sort).toEqual([{ column: 'name', dir: 'asc' }]);
    expect(JSON.stringify(t.reqs[0]!.filter)).toContain('odd');
  });

  it('a server grid without [state]: one request, as before', () => {
    const t = mount({ features: [gridState()], server: true });
    t.run();
    expect(t.reqs.length).toBe(1);
  });

  it('without gridState(): one missing-feature (path state); a server grid still asks its rows once', () => {
    const t = mount({ server: true, state: S1 });
    t.run();
    t.host.state.set({ ...S1, sort: [] });
    t.run();
    expect(t.host.problems.filter((p) => p.code === 'missing-feature' && p.path === 'state')).toEqual([{ code: 'missing-feature', severity: 'warning', path: 'state', detail: 'state' }]);
    expect(t.reqs.length).toBe(1);
  });

  it('a bad state: its problems come in stateRestored; the grid stays usable', () => {
    const t = mount({ features: [gridState()], state: { v: 1, columns: [{ id: 'gone', pinned: null, order: 0 }] } as never });
    t.run();
    const restored = t.host.all.filter((e) => e.type === 'stateRestored') as Extract<GridEvent<R>, { type: 'stateRestored' }>[];
    expect(restored.length).toBe(1);
    expect(restored[0]!.problems.map((p) => p.code)).toEqual(['state-column']);
    expect(order(t)).toEqual(['name', 'n', 's']);
  });
});

describe('[pinnedRows]', () => {
  it('at creation and live: a new value is set; [] empties a side; the same identity does nothing', () => {
    const pins = pinnedRows<R>();
    const t = mount({ features: [pins], pins: { bottom: [ROWS[0]!] } });
    t.run();
    const api = pins.api({ kernel: t.ctl.kernel()! })!;
    expect(api.get().bottom).toEqual([ROWS[0]]);
    const spy = vi.spyOn(api, 'set');
    t.host.pins.set({ top: [ROWS[1]!], bottom: [] });
    t.run();
    expect(api.get()).toEqual({ top: [ROWS[1]], bottom: [] });
    t.run();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('without pinnedRows(): one missing-feature (path pinnedRows)', () => {
    const t = mount({ pins: { bottom: [ROWS[0]!] } });
    t.run();
    t.host.pins.set({ bottom: [] });
    t.run();
    expect(t.host.problems.filter((p) => p.path === 'pinnedRows')).toEqual([{ code: 'missing-feature', severity: 'warning', path: 'pinnedRows', detail: 'pinned-rows' }]);
  });
});

describe('(densityChanged)', () => {
  it('the menu\'s density choice: once, source user; the bound value stays, a NEW value bound applies', () => {
    const menu = columnMenu({ density: true });
    const t = mount({ features: [menu] });
    t.host.density.set('comfortable');
    t.run();
    expect(t.ctl.use(menu)!.open('name')).toBe(true);
    (document.querySelector('[data-id="density.compact"]') as HTMLElement).click();
    t.run();
    expect(t.host.densities).toEqual(['compact']);
    const ev = t.host.all.find((e) => e.type === 'densityChanged')!;
    expect(ev.source).toBe('user');
    expect(document.querySelector('.dzg')!.getAttribute('data-density')).toBe('compact');
    t.host.density.set('spacious');
    t.run();
    expect(document.querySelector('.dzg')!.getAttribute('data-density')).toBe('spacious');
  });
});

describe('(selectionChanged)', () => {
  it('an output of its own, with the event\'s real shape (selection, count, source); the selected model still agrees', () => {
    const t = mount();
    t.run();
    t.ctl.dispatch({ type: 'selection.set', selection: { mode: 'include', keys: new Set([dataKey('r1')!, dataKey('r2')!]) } });
    t.run();
    expect(t.host.sel).toEqual([2]);
    const ev = t.host.all.find((e) => e.type === 'selectionChanged') as Extract<GridEvent<R>, { type: 'selectionChanged' }>;
    expect([ev.selection.mode, ev.count, ev.source]).toEqual(['include', 2, 'api']);
  });

});

describe('selectedIds() (allergen-detector: keys are not ids; « all but these » needs the query)', () => {
  it('the row ids, never the keys, held rows or not; the mode; the grid\'s query (filter, sort, search) to replay « all but these »; null before the grid', () => {
    const t = mount();
    expect(selectedIds(t.ctl)).toBeNull();
    t.run();
    t.ctl.dispatch({ type: 'filter.set', filter: { s: { type: 'text', op: 'equals', value: 'odd' } } });
    t.ctl.dispatch({ type: 'sort.set', sort: [{ column: 'n', dir: 'desc' }] });
    t.ctl.dispatch({ type: 'selection.set', selection: { mode: 'exclude', keys: new Set([dataKey('r3')!, dataKey('r5')!]) } });
    const s = selectedIds(t.ctl)!;
    expect(s.mode).toBe('exclude');
    expect(s.ids).toEqual(['r3', 'r5']);
    expect(s.query.sort).toEqual([{ column: 'n', dir: 'desc' }]);
    expect(JSON.stringify(s.query.filter)).toContain('odd');
    expect(s.query.quick).toBe('');
    t.ctl.dispatch({ type: 'selection.set', selection: { mode: 'include', keys: new Set([dataKey('r1')!]) } });
    expect(selectedIds(t.ctl)).toMatchObject({ mode: 'include', ids: ['r1'] });
  });
});

describe('DzgController.use() and .grid()', () => {
  it('null before the grid and after it; the feature\'s api and the instance while it lives; no cast', () => {
    const chooser = columnsChooser();
    const t = mount({ features: [chooser] });
    expect(t.ctl.use(chooser)).toBeNull();
    expect(t.ctl.grid()).toBeNull();
    t.run();
    const api = t.ctl.use(chooser);
    expect(api).toBe(chooser.api({ kernel: t.ctl.kernel()! }));
    expect(typeof api!.open).toBe('function');
    expect(t.ctl.grid()!.kernel).toBe(t.ctl.kernel());
    t.fixture.destroy();
    expect(t.ctl.use(chooser)).toBeNull();
    expect(t.ctl.grid()).toBeNull();
  });
});

describe('uiData()', () => {
  it('the column\'s ui.data bag, typed by the caller; undefined when absent', () => {
    const t = mount();
    t.run();
    const col = (id: string) => ({ column: t.ctl.kernel()!.columns.get(id)! });
    expect(uiData<{ tone: string }>(col('name'))?.tone).toBe('blue');
    expect(uiData(col('n'))).toBeUndefined();
  });
});

describe('backward compatibility with 1.0.0 (additive only)', () => {
  // By hand, from 1.0.0's `index.ts` and `<dz-grid>`'s inputs and outputs (unchanged since 8812b97).
  const EXPORTS_1_0 = ['DZGRID_ANGULAR_VERSION', 'DzGrid', 'DzgController', 'DzgPart', 'componentPart', 'DzgSearch', 'DzgExport', 'fromObservable', 'DZG_DEFAULTS', 'DZG_ENV', 'DZG_MESSAGES', 'DZG_PARTS', 'provideDzGrid'];
  const INPUTS_1_0 = ['rows', 'source', 'columns', 'getRowId', 'messages', 'locale', 'timeZone', 'numerals', 'direction', 'density', 'rowHeight', 'overlay', 'label', 'tooltips', 'overscan', 'searchWarmup', 'selection', 'context', 'rowClass', 'fullWidth', 'parts', 'dzgNested', 'operations', 'pagination', 'filterKinds', 'clock', 'injectStyles', 'nonce', 'features', 'floatingFilters', 'save', 'quick', 'filter', 'selected', 'expanded'];
  const OUTPUTS_1_0 = ['quickChange', 'filterChange', 'selectedChange', 'expandedChange', 'gridEvent', 'cellClicked', 'rowClicked', 'cellAction', 'partAction', 'fetchFailed', 'rowExpanded', 'cellEdited', 'saveFailed', 'orderStale', 'undoChanged', 'rangeChanged', 'rangeCopied', 'problems', 'gridReady'];
  const CONTROLLER_1_0 = ['dispatch', 'focusCell', 'ensureVisible', 'refresh', 'announce', 'openFilter', 'closeFilter', 'edit', 'range', 'fill'];

  it('every 1.0.0 export, input, output and controller method is still there; the new ones beside them', () => {
    expect(Object.keys(NG)).toEqual(expect.arrayContaining([...EXPORTS_1_0, 'selectedIds', 'uiData']));
    const cmp = (DzGrid as unknown as { ɵcmp: { inputs: Record<string, unknown>; outputs: Record<string, unknown> } }).ɵcmp;
    expect(Object.keys(cmp.inputs)).toEqual(expect.arrayContaining([...INPUTS_1_0, 'state', 'pinnedRows']));
    expect(Object.keys(cmp.outputs)).toEqual(expect.arrayContaining([...OUTPUTS_1_0, 'stateChanged', 'densityChanged', 'selectionChanged']));
    for (const m of [...CONTROLLER_1_0, 'use', 'grid']) expect(typeof (DzgController.prototype as unknown as Record<string, unknown>)[m], m).toBe('function');
  });

  it('a host with 1.0.0 bindings only: no new problem, rows drawn', () => {
    const t = mount();
    t.run();
    expect(t.host.problems).toEqual([]);
    expect(document.querySelectorAll('.dzg-row').length).toBeGreaterThan(0);
  });
});
