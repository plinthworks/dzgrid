// <dz-grid>'s inputs, models, outputs, controller and providers (step 22, docs/behaviors/angular-parts.md).
import { describe, it, expect, afterEach, vi } from 'vitest';
import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { dataKey, type ColumnOrGroup, type FilterModel, type GridEvent, type SelectionState } from '@dzgrid/core';
import type { GridFeature, SlotPart } from '@dzgrid/dom';
import { FR } from '@dzgrid/dom/locales/fr';
import { EN_RULES } from '@dzgrid/dom/locales/en-rules';
import { rules } from '@dzgrid/dom/rules';
import { filters } from '@dzgrid/dom/filters';
import { DzGrid, DzgController, componentPart, fromObservable, provideDzGrid, type DzgPartContext } from '@dzgrid/angular';
import { COLUMNS, MESSAGES, ROWS, fakeEnv, rowId, type R } from './support';

afterEach(() => {
  document.body.innerHTML = '';
});

const seenContexts: unknown[] = [];
@Component({ selector: 't-ctx', changeDetection: ChangeDetectionStrategy.OnPush, template: `{{ cell().text }}` })
class CtxCell {
  readonly cell = input.required<DzgPartContext<'cell'>>();
  ngDoCheck(): void {
    seenContexts.push(this.cell().context);
  }
}

@Component({
  selector: 't-host',
  imports: [DzGrid],
  template: `<dz-grid #g="dzGrid" [rows]="rows()" [columns]="columns" [getRowId]="id" [messages]="messages()" [locale]="locale()" [direction]="direction()"
    [density]="density()" [context]="context()" [parts]="parts" [features]="features" [selection]="selection()" [pagination]="paging()" [label]="label()"
    [(quick)]="quick" [(filter)]="filter" [(selected)]="selected"
    (gridEvent)="all.push($event)" (cellClicked)="clicks.push($event)" (rowClicked)="rowClicks.push($event)" (problems)="problems.push($event)"
    (gridReady)="ready.push($event)" />`,
})
class Host {
  readonly rows = signal<R[]>(ROWS);
  columns: ColumnOrGroup<R>[] = COLUMNS;
  readonly id = rowId;
  readonly messages = signal(MESSAGES);
  readonly locale = signal<string | undefined>(undefined);
  readonly direction = signal<'auto' | 'ltr' | 'rtl' | undefined>(undefined);
  readonly density = signal<'compact' | 'comfortable' | 'spacious' | undefined>(undefined);
  readonly context = signal<unknown>(undefined);
  readonly label = signal<string | undefined>(undefined);
  readonly selection = signal<{ mode: 'none' | 'single' | 'multi'; checkbox?: boolean; click?: boolean; canSelect?: (r: { data: R }) => boolean | string } | undefined>({ mode: 'multi' });
  readonly paging = signal<{ pageSize: number } | undefined>(undefined);
  parts: Record<string, SlotPart> = {};
  features: GridFeature[] = [];
  readonly quick = signal<string | undefined>(undefined);
  readonly filter = signal<FilterModel | undefined>(undefined);
  readonly selected = signal<SelectionState | undefined>(undefined);
  readonly all: GridEvent<R>[] = [];
  readonly clicks: unknown[] = [];
  readonly rowClicks: unknown[] = [];
  readonly problems: unknown[] = [];
  readonly ready: unknown[] = [];
}

function mount(o: { setup?: (h: Host) => void; providers?: unknown[] } = {}) {
  const env = fakeEnv();
  TestBed.configureTestingModule({ providers: [env.provider, ...((o.providers ?? []) as never[])] });
  const fixture = TestBed.createComponent(Host);
  o.setup?.(fixture.componentInstance);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const ctrl = fixture.debugElement.children[0]!.injector.get(DzgController);
  const run = () => fixture.detectChanges();
  const of = (type: GridEvent<R>['type']) => fixture.componentInstance.all.filter((e) => e.type === type);
  return { fixture, el, host: fixture.componentInstance, ctrl, run, of, kernel: () => ctrl.kernel()! };
}

describe('required inputs', () => {
  it('columns and getRowId are required: creating the grid without them is NG0950', () => {
    // A template missing them does not compile (NG8008, strictTemplates); set from code, the
    // grid refuses to start rather than run without them.
    TestBed.configureTestingModule({ providers: [fakeEnv().provider] });
    const fixture = TestBed.createComponent(DzGrid<R>);
    fixture.componentRef.setInput('messages', MESSAGES);
    expect(() => fixture.detectChanges()).toThrow(/NG0950/);
  });

  it('messages: from the tag, else from provideDzGrid; neither is a clear error', () => {
    @Component({ selector: 't-nomsg', imports: [DzGrid], template: `<dz-grid [rows]="rows" [columns]="cols" [getRowId]="id" />` })
    class NoMsg {
      rows = ROWS;
      cols = COLUMNS;
      id = rowId;
    }
    TestBed.configureTestingModule({ providers: [fakeEnv().provider] });
    expect(() => TestBed.createComponent(NoMsg).detectChanges()).toThrow(/dz-grid: messages/);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [fakeEnv().provider, provideDzGrid({ messages: FR })] });
    const f = TestBed.createComponent(NoMsg);
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).querySelector('.dzg-viewport')!.getAttribute('aria-label')).toBe(FR.text['grid.label']);
  });
});

describe('the host element and the controller', () => {
  it('takes no box (display: contents), and the grid is its child', () => {
    const t = mount();
    const host = t.el.querySelector<HTMLElement>('dz-grid')!;
    expect(host.style.display).toBe('contents');
    expect(host.getAttribute('style')).toBe('display: contents;');
    expect(host.firstElementChild!.classList.contains('dzg')).toBe(true);
  });

  it('gridReady gives the controller once; ready() and kernel() then hold', () => {
    const t = mount();
    expect(t.host.ready).toEqual([t.ctrl]);
    expect(t.ctrl.ready()).toBe(true);
    expect(t.ctrl.kernel()!.rows.displayed.count).toBe(300);
  });

  it('dispatch acts as the API; openFilter without filters() is false; destroy empties the controller', () => {
    const t = mount();
    expect(t.ctrl.dispatch({ type: 'sort.set', sort: [{ column: 'n', dir: 'desc' }] })).toEqual({ ok: true });
    expect(t.of('sortChanged').map((e) => e.source)).toEqual(['api']);
    expect(t.ctrl.openFilter('name')).toBe(false);
    t.fixture.destroy();
    expect(t.ctrl.ready()).toBe(false);
    expect(t.ctrl.kernel()).toBeNull();
    expect(t.ctrl.dispatch({ type: 'selection.clear' }).ok).toBe(false);
  });

  it('cellClicked and rowClicked come out on their outputs', () => {
    const t = mount();
    t.el.querySelector<HTMLElement>('.dzg-row[aria-rowindex="3"] [data-col="n"]')!.click();
    expect(t.host.clicks).toMatchObject([{ type: 'cellClicked', column: 'n', row: { key: dataKey('r1')! } }]);
    expect(t.host.rowClicks).toMatchObject([{ type: 'rowClicked', row: { key: dataKey('r1')! } }]);
  });
});

describe('live and fixed inputs', () => {
  it('rows, label, density and direction reach the grid as they change', () => {
    const t = mount();
    t.host.rows.set(ROWS.slice(0, 7));
    t.host.label.set('Patients');
    t.host.density.set('compact');
    t.host.direction.set('rtl');
    t.run();
    expect(t.kernel().rows.displayed.count).toBe(7);
    expect(t.el.querySelector('.dzg-viewport')!.getAttribute('aria-label')).toBe('Patients');
    expect(t.el.querySelector('.dzg')!.getAttribute('dir')).toBe('rtl');
  });

  it('an unchanged input is not sent again: no second rows change', () => {
    const t = mount();
    const before = t.of('modelUpdated').length;
    t.host.label.set('Other');
    t.run();
    expect(t.of('modelUpdated').length).toBe(before);
  });

  it('locale and messages are live', () => {
    const t = mount();
    t.host.messages.set(FR);
    t.run();
    expect(t.el.querySelector('.dzg-viewport')!.getAttribute('aria-label')).toBe(FR.text['grid.label']);
  });

  it('a fixed input changed later is refused by the grid: unsupported-live-change', () => {
    const t = mount();
    t.host.paging.set({ pageSize: 10 });
    t.run();
    expect(t.host.problems).toContainEqual([{ code: 'unsupported-live-change', severity: 'error', path: 'settings.pagination' }]);
    expect(t.kernel().rows.displayed.count).toBe(300);
  });

  it('context: a new identity updates each part once; the same value updates none', () => {
    const t = mount({ setup: (h) => { h.parts = { status: componentPart('cell', CtxCell) }; } });
    const ctx = { user: 'a' };
    t.host.context.set(ctx);
    t.run();
    seenContexts.length = 0;
    t.host.context.set(ctx);
    t.run();
    expect(seenContexts).toEqual([]);
    // Another input changing (the label) does not reach the parts either: only what changed is sent.
    t.host.label.set('Other');
    t.run();
    expect(seenContexts).toEqual([]);
    t.host.context.set({ user: 'b' });
    t.run();
    const cells = t.el.querySelectorAll('t-ctx').length;
    expect(seenContexts.filter((c) => (c as { user: string }).user === 'b')).toHaveLength(cells);
  });

  it('canSelect needs rules(): without it the grid selects nothing and says so', () => {
    const t = mount({ setup: (h) => h.selection.set({ mode: 'multi', click: true, canSelect: () => true }) });
    expect(t.host.problems.flat()).toContainEqual({ code: 'missing-feature', severity: 'error', path: 'settings.selection.canSelect', detail: 'rules' });
    // A click on a row would select it; with the grid closed it selects nothing.
    t.el.querySelector<HTMLElement>('.dzg-row[aria-rowindex="3"] [data-col="n"]')!.click();
    expect(t.kernel().selection.keys.size).toBe(0);
  });

  it('canSelect with rules() vets each row', () => {
    const t = mount({
      setup: (h) => {
        h.messages.set({ ...MESSAGES, text: { ...MESSAGES.text, ...EN_RULES.text } });
        h.features = [rules()];
        h.selection.set({ mode: 'multi', click: true, canSelect: (r) => r.data.n % 2 === 0 });
      },
    });
    t.el.querySelector<HTMLElement>('.dzg-row[aria-rowindex="3"] [data-col="n"]')!.click();
    t.el.querySelector<HTMLElement>('.dzg-row[aria-rowindex="4"] [data-col="n"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true, metaKey: true }));
    expect([...t.kernel().selection.keys]).toEqual([dataKey('r2')!]);
  });
});

describe('models and their echo', () => {
  it('quick: the host’s value is written as the host, the user’s comes back, nothing echoes', () => {
    const t = mount({ setup: (h) => h.quick.set('ann') });
    expect(t.kernel().query.quick).toBe('ann');
    expect(t.of('quickChanged').map((e) => e.source)).toEqual(['host']);
    t.ctrl.kernel()!.dispatch({ type: 'quick.set', text: 'bob' }, 'user');
    t.run();
    expect(t.host.quick()).toBe('bob');
    expect(t.of('quickChanged').map((e) => e.source)).toEqual(['host', 'user']);
  });

  it('filter: written as the host, the user’s filter comes back, nothing echoes', () => {
    const f: FilterModel = { name: { type: 'text', op: 'contains', value: 'ann' } };
    const t = mount({ setup: (h) => h.filter.set(f) });
    expect(t.kernel().rows.displayed.count).toBe(100);
    const g: FilterModel = { n: { type: 'number', op: 'lt', value: 10 } };
    t.kernel().dispatch({ type: 'filter.set', filter: g }, 'user');
    t.run();
    expect(t.host.filter()).toEqual(g);
    expect(t.of('filterChanged').map((e) => e.source)).toEqual(['host', 'user']);
    // A host value equal to the grid's (another object) is not written again.
    t.host.filter.set({ n: { type: 'number', op: 'lt', value: 10 } });
    t.run();
    expect(t.of('filterChanged')).toHaveLength(2);
  });

  it('selected: written with selection.set, the user’s ticks come back, nothing echoes', () => {
    const mine: SelectionState = { mode: 'include', keys: new Set([dataKey('r4')!]) };
    const t = mount({ setup: (h) => h.selected.set(mine) });
    expect([...t.kernel().selection.keys]).toEqual([dataKey('r4')!]);
    // The host's own write does not come back into its model (the grid's copy is another object).
    expect(t.host.selected()).toBe(mine);
    t.kernel().dispatch({ type: 'selection.toggle', row: dataKey('r5')! }, 'user');
    t.run();
    expect([...t.host.selected()!.keys]).toEqual([dataKey('r4')!, dataKey('r5')!]);
    expect(t.of('selectionChanged').map((e) => e.source)).toEqual(['host', 'user']);
  });

  it('a host value equal to the grid’s is not dispatched: a filter edit pending in the floating row survives', () => {
    vi.useFakeTimers();
    try {
      const t = mount({ setup: (h) => { h.features = [filters({ floating: true })]; } });
      const box = t.el.querySelector<HTMLInputElement>('.dzg-hextra[data-col="name"] input')!;
      box.value = 'ann';
      box.dispatchEvent(new InputEvent('input', { bubbles: true }));
      // The application writes back what the grid holds (no filter): nothing to send, nothing dropped.
      t.host.filter.set({});
      t.run();
      vi.advanceTimersByTime(400);
      expect(t.kernel().query.filter).toEqual({ name: { type: 'text', op: 'contains', value: 'ann' } });
    } finally {
      vi.useRealTimers();
    }
  });

  it('unset, the models leave the grid’s state alone', () => {
    const t = mount();
    expect(t.of('quickChanged')).toEqual([]);
    expect(t.of('filterChanged')).toEqual([]);
    expect(t.of('selectionChanged')).toEqual([]);
  });
});

describe('provideDzGrid', () => {
  it('defaults the application’s locale and direction; a binding wins', () => {
    const t = mount({ providers: [provideDzGrid({ defaults: { direction: 'rtl', density: 'compact' } })] });
    expect(t.el.querySelector('.dzg')!.getAttribute('dir')).toBe('rtl');
    t.host.direction.set('ltr');
    t.run();
    expect(t.el.querySelector('.dzg')!.getAttribute('dir')).toBe('ltr');
  });
});

describe('fromObservable', () => {
  type Obs<V> = { subscribe(o: { next(v: V): void; error(e: unknown): void; complete(): void }): { unsubscribe(): void } };
  const req = (signal = new AbortController().signal) => ({ params: {}, zone: 'UTC', key: 'k', signal });

  it('answers with the first value and unsubscribes', async () => {
    let gone = 0;
    const obs: Obs<{ rows: R[] }> = { subscribe: (o) => (o.next({ rows: ROWS.slice(0, 2) }), o.next({ rows: [] }), { unsubscribe: () => void gone++ }) };
    const src = fromObservable(() => obs);
    await expect(src.fetch(req())).resolves.toEqual({ rows: ROWS.slice(0, 2) });
    expect(gone).toBe(1);
  });

  it('an abort unsubscribes; an error rejects; completing empty rejects', async () => {
    let gone = 0;
    let push: ((v: { rows: R[] }) => void) | null = null;
    const slow: Obs<{ rows: R[] }> = { subscribe: (o) => ((push = (v) => o.next(v)), { unsubscribe: () => void gone++ }) };
    const ac = new AbortController();
    const p = fromObservable(() => slow).fetch(req(ac.signal));
    ac.abort();
    expect(gone).toBe(1);
    await expect(p).rejects.toBeDefined();
    void push;
    const boom: Obs<never> = { subscribe: (o) => (o.error(new Error('down')), { unsubscribe() {} }) };
    await expect(fromObservable(() => boom).fetch(req())).rejects.toThrow('down');
    const empty: Obs<never> = { subscribe: (o) => (o.complete(), { unsubscribe() {} }) };
    await expect(fromObservable(() => empty).fetch(req())).rejects.toThrow(/without a value/);
  });
});
