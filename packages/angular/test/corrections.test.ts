// Corrections after the review and test analysis of step 22 (docs/behaviors/angular-parts.md):
// focus fallback, fromObservable's abort listener, the selected model after host-caused clears,
// a template changing slot, messages unset after creation, part-shadowed inside one layer.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { ApplicationRef, Component, EnvironmentInjector, Injector, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { dataKey, type FilterModel, type GridEvent, type Problem, type SelectionState } from '@dzgrid/core';
import { definePart, type GridFeature, type GridMessages, type SlotContext, type SlotPart } from '@dzgrid/dom';
import { slots } from '@dzgrid/dom/slots';
import { DzGrid, DzgController, DzgPart, fromObservable, type ObservableLike } from '@dzgrid/angular';
import { boundPart } from '../src/part-bind';
import { COLUMNS, MESSAGES, ROWS, fakeEnv, rowId, type R } from './support';

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('focus fallback of a part without focus()', () => {
  @Component({ selector: 't-ctl', template: `<input type="hidden" /><button type="button" disabled class="off">x</button><button type="button" class="on">y</button>` })
  class Controls {}
  @Component({ selector: 't-none', template: `<input type="hidden" /><button type="button" disabled>x</button>` })
  class Nothing {}

  function mountPart(what: typeof Controls | typeof Nothing) {
    TestBed.configureTestingModule({});
    const b = { env: TestBed.inject(EnvironmentInjector), app: TestBed.inject(ApplicationRef), injector: TestBed.inject(Injector), kernel: () => null };
    const host = document.createElement('div');
    document.body.append(host);
    const ctx = { text: 'x', value: 'x', key: dataKey('r1'), column: { id: 's' } } as unknown as SlotContext['cell'];
    return boundPart(b, 'cell', what).part.mount(host, ctx) as { focus(): boolean; destroy(): void };
  }

  it('skips disabled controls and hidden inputs', () => {
    const m = mountPart(Controls);
    expect(m.focus()).toBe(true);
    expect(document.activeElement?.className).toBe('on');
    m.destroy();
  });

  it('returns false when nothing inside can take the focus', () => {
    const m = mountPart(Nothing);
    expect(m.focus()).toBe(false);
    expect(document.activeElement).toBe(document.body);
    m.destroy();
  });
});

describe('fromObservable: the abort listener', () => {
  const of = <V>(run: (o: { next(v: V): void; error(e: unknown): void; complete(): void }) => void): ObservableLike<V> => ({
    subscribe(o) {
      queueMicrotask(() => run(o));
      return { unsubscribe() {} };
    },
  });
  const req = (signal: AbortSignal) => ({ signal }) as never;

  it.each([
    ['a value', (o: { next(v: unknown): void }) => o.next({ rows: [], total: 0 })],
    ['an error', (o: { error(e: unknown): void }) => o.error(new Error('x'))],
    ['completing empty', (o: { complete(): void }) => o.complete()],
  ])('is removed once settled by %s', async (_n, run) => {
    const ac = new AbortController();
    const add = vi.spyOn(ac.signal, 'addEventListener');
    const remove = vi.spyOn(ac.signal, 'removeEventListener');
    const src = fromObservable(() => of(run as never));
    await Promise.resolve(src.fetch(req(ac.signal))).catch(() => {});
    expect(add).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith('abort', add.mock.calls[0]![1]);
  });
});

@Component({
  selector: 't-sel',
  imports: [DzGrid],
  template: `<dz-grid [rows]="rows" [columns]="cols" [getRowId]="id" [messages]="messages()" [selection]="selection()"
    [(filter)]="filter" [(selected)]="selected" (gridEvent)="all.push($event)" />`,
})
class Sel {
  readonly rows = ROWS;
  readonly cols = COLUMNS;
  readonly id = rowId;
  readonly messages = signal<GridMessages | undefined>(MESSAGES);
  readonly selection = signal<{ mode: 'none' | 'single' | 'multi'; keepOnFilter?: boolean }>({ mode: 'multi' });
  readonly filter = signal<FilterModel | undefined>(undefined);
  readonly selected = signal<SelectionState | undefined>(undefined);
  readonly all: GridEvent<R>[] = [];
}

function mountSel(setup?: (h: Sel) => void) {
  TestBed.configureTestingModule({ providers: [fakeEnv().provider] });
  const fixture = TestBed.createComponent(Sel);
  setup?.(fixture.componentInstance);
  fixture.detectChanges();
  const de = fixture.debugElement.query((d) => d.name === 'dz-grid')!;
  const k = () => de.injector.get(DzgController).kernel()!;
  const run = () => (fixture.detectChanges(), fixture.detectChanges());
  return { fixture, h: fixture.componentInstance, k, run, grid: de.componentInstance as DzGrid<R> };
}

const two = (): SelectionState => ({ mode: 'include', keys: new Set([dataKey('r4')!, dataKey('r5')!]) });

describe('selected after a change the host caused', () => {
  it('a narrower [selection] mode clears the grid: the model follows, once, no echo', () => {
    const t = mountSel((h) => h.selected.set(two()));
    expect(t.k().selection.keys.size).toBe(2);
    t.h.selection.set({ mode: 'single' });
    t.run();
    expect(t.k().selection.keys.size).toBe(0);
    expect(t.h.selected()!.keys.size).toBe(0);
    expect(t.h.all.filter((e) => e.type === 'selectionChanged').map((e) => e.source)).toEqual(['host', 'host']);
  });

  it('a [(filter)] write that clears the selection (keepOnFilter false): the model follows', () => {
    const t = mountSel((h) => {
      h.selection.set({ mode: 'multi', keepOnFilter: false });
      h.selected.set(two());
    });
    t.h.filter.set({ name: { type: 'text', op: 'contains', value: 'ann' } });
    t.run();
    expect(t.k().selection.keys.size).toBe(0);
    expect(t.h.selected()!.keys.size).toBe(0);
    expect(t.h.all.filter((e) => e.type === 'selectionChanged')).toHaveLength(2);
  });
});

describe('messages unset after creation, no provider', () => {
  it('keeps the bundle in force: update() never gets a null bundle, the grid keeps its words', () => {
    const t = mountSel();
    const g = (t.grid as unknown as { _grid(): { update(p: object): void } })._grid();
    const update = vi.spyOn(g, 'update');
    const label = (t.fixture.nativeElement as HTMLElement).querySelector('.dzg-viewport')!.outerHTML;
    t.h.messages.set(undefined);
    expect(() => t.run()).not.toThrow();
    for (const [p] of update.mock.calls) expect('messages' in p && !(p as { messages?: unknown }).messages).toBe(false);
    expect((t.fixture.nativeElement as HTMLElement).querySelector('.dzg-viewport')!.outerHTML).toBe(label);
  });
});

@Component({
  selector: 't-slot',
  imports: [DzGrid, DzgPart],
  template: `<dz-grid [rows]="rows" [columns]="cols" [getRowId]="id" [messages]="messages" [features]="features" (gridEvent)="all.push($event)">
    <ng-template dzgPart="p" [slot]="slot()" let-c><button type="button" class="p" (click)="c.emit('go')">p</button></ng-template>
  </dz-grid>`,
})
class Slot {
  readonly rows = ROWS;
  readonly cols = [
    { id: 'name', header: 'Name', ui: { header: 'p' } },
    { id: 's', header: 'Status', ui: { cell: 'p' } },
  ];
  readonly id = rowId;
  readonly messages = MESSAGES;
  readonly features: GridFeature[] = [slots()];
  readonly slot = signal<'cell' | 'header'>('cell');
  readonly all: GridEvent<R>[] = [];
}

describe('a dzgPart template whose slot changes', () => {
  it('is bound again for its new slot: a click sends partAction, never a stale cellAction', () => {
    TestBed.configureTestingModule({ providers: [fakeEnv().provider] });
    const fixture = TestBed.createComponent(Slot);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const h = fixture.componentInstance;
    (el.querySelector('.dzg-row [data-col="s"] .p') as HTMLElement).click();
    expect(h.all.filter((e) => e.type === 'cellAction')).toHaveLength(1);
    h.slot.set('header');
    fixture.detectChanges();
    h.all.length = 0;
    for (const b of el.querySelectorAll<HTMLElement>('.p')) b.click();
    expect(el.querySelector('.dzg-hcell[data-col="name"] .p')).not.toBeNull();
    expect(h.all.filter((e) => e.type === 'cellAction')).toEqual([]);
    expect(h.all.filter((e) => e.type === 'partAction')).toEqual([{ type: 'partAction', source: 'user', slot: 'header', column: 'name', name: 'go', detail: undefined }]);
  });
});

const text = (label: string): SlotPart => definePart('cell', { mount: (h, c) => (h.append(`${label}:${c.text}`), {}) }) as SlotPart;

@Component({
  selector: 't-twice',
  imports: [DzGrid, DzgPart],
  template: `<dz-grid [rows]="rows" [columns]="cols" [getRowId]="id" [messages]="messages" [features]="features" (gridEvent)="all.push($event)">
    <ng-template dzgPart="status" let-c><i class="one">{{ c.text }}</i></ng-template>
    <ng-template dzgPart="status" let-c><i class="two">{{ c.text }}</i></ng-template>
  </dz-grid>`,
})
class Twice {
  readonly rows = ROWS;
  readonly cols = COLUMNS;
  readonly id = rowId;
  readonly messages = MESSAGES;
  features: GridFeature[] = [];
  readonly all: GridEvent<R>[] = [];
}

describe('part-shadowed inside one layer', () => {
  function mountTwice(features: GridFeature[] = []) {
    TestBed.configureTestingModule({ providers: [fakeEnv().provider] });
    const fixture = TestBed.createComponent(Twice);
    fixture.componentInstance.features = features;
    fixture.detectChanges();
    fixture.detectChanges();
    const shadowed = () => fixture.componentInstance.all.flatMap((e) => (e.type === 'problems' ? e.problems : [])).filter((p: Problem) => p.code === 'part-shadowed');
    return { el: fixture.nativeElement as HTMLElement, shadowed };
  }

  it('two templates of one name: the last wins, the hidden one is told once, detail template', () => {
    const t = mountTwice();
    expect(t.el.querySelector('.dzg-row [data-col="s"] .two')).not.toBeNull();
    expect(t.el.querySelector('.one')).toBeNull();
    expect(t.shadowed()).toEqual([{ code: 'part-shadowed', severity: 'warning', path: 'parts.status', detail: 'template' }]);
  });

  it('two features giving one name: told once, detail feature', () => {
    const f = (id: string): GridFeature => ({ id, parts: { other: text(id) }, setup: () => ({ destroy() {} }) });
    const t = mountTwice([f('a'), f('b')]);
    expect(t.shadowed()).toContainEqual({ code: 'part-shadowed', severity: 'warning', path: 'parts.other', detail: 'feature' });
    expect(t.shadowed().filter((p) => p.path === 'parts.other')).toHaveLength(1);
  });
});
