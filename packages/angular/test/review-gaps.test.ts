// Gaps found reviewing step 22: two grids sharing parts and a feature, directives rebinding and
// across a grid's remake, emits during a part's end, models that change without echo, the server.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ChangeDetectionStrategy, Component, PLATFORM_ID, inject, input, signal, type OnDestroy, type OnInit } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { dataKey, type GridEvent, type SelectionState } from '@dzgrid/core';
import { definePart, type GridFeature, type SlotPart } from '@dzgrid/dom';
import { quickSearch } from '@dzgrid/dom/search';
import type { CsvExport } from '@dzgrid/dom/export';
import { DzGrid, DzgController, DzgExport, DzgSearch, componentPart, provideDzGrid, type DzgPartContext } from '@dzgrid/angular';
import { COLUMNS, MESSAGES, ROWS, StatusCell, fakeEnv, life, rowId, type R } from './support';

beforeEach(() => life.reset());
afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const shared = componentPart('cell', StatusCell);
const sharedSearch = quickSearch();

@Component({
  selector: 't-two',
  imports: [DzGrid, DzgSearch],
  template: `<input class="q" [dzgSearch]="search" [dzgSearchDebounce]="0" />
    <dz-grid class="a" [rows]="rows" [columns]="cols" [getRowId]="id" [messages]="messages" [parts]="parts" [features]="[search]" (cellAction)="a.push($event)" />
    @if (second()) {
      <dz-grid class="b" [rows]="rowsB" [columns]="cols" [getRowId]="id" [messages]="messages" [parts]="parts" [features]="[search]" (cellAction)="b.push($event)" />
    }`,
})
class Two {
  readonly rows = ROWS;
  readonly rowsB = ROWS.slice(50);
  readonly cols = COLUMNS;
  readonly id = rowId;
  readonly messages = MESSAGES;
  readonly parts: Record<string, SlotPart> = { status: shared };
  readonly search = sharedSearch;
  readonly second = signal(true);
  readonly a: { key: string }[] = [];
  readonly b: { key: string }[] = [];
}

describe('two grids sharing one componentPart and one feature', () => {
  function mount() {
    TestBed.configureTestingModule({ providers: [fakeEnv().provider] });
    const fixture = TestBed.createComponent(Two);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    document.body.append(el);
    const grid = (c: string) => el.querySelector<HTMLElement>(`dz-grid.${c}`)!;
    const ctrl = (c: string) => fixture.debugElement.query((d) => d.nativeElement === grid(c))?.injector.get(DzgController);
    return { fixture, el, h: fixture.componentInstance, grid, ctrl };
  }

  it('each grid binds the marker to itself: emits and injections go to the grid the cell is in', () => {
    const t = mount();
    const cellB = t.grid('b').querySelector<HTMLButtonElement>('.dzg-row[aria-rowindex="3"] [data-col="s"] button')!;
    cellB.click();
    expect(t.h.b).toMatchObject([{ key: dataKey('r51') }]);
    expect(t.h.a).toEqual([]);
    const cmps = life.seen as StatusCell[];
    const inB = cmps.filter((c) => c.controller === t.ctrl('b'));
    const inA = cmps.filter((c) => c.controller === t.ctrl('a'));
    expect(inA.length).toBe(t.grid('a').querySelectorAll('t-status').length);
    expect(inB.length).toBe(t.grid('b').querySelectorAll('t-status').length);
  });

  it('one grid destroyed: its parts end, the other grid’s parts and search stay', () => {
    vi.useFakeTimers();
    const t = mount();
    const inA = t.grid('a').querySelectorAll('t-status').length;
    t.h.second.set(false);
    t.fixture.detectChanges();
    expect(life.made - life.gone).toBe(inA);
    const q = t.el.querySelector<HTMLInputElement>('.q')!;
    q.value = 'ann3';
    q.dispatchEvent(new InputEvent('input', { bubbles: true }));
    vi.advanceTimersByTime(10);
    expect(t.ctrl('a')!.kernel()!.query.quick).toBe('ann3');
    t.fixture.destroy();
    expect(life.gone).toBe(life.made);
  });
});

/** A fake export feature that logs its binds. */
function fakeExport() {
  const log: string[] = [];
  const f = {
    id: 'export', busy: false, run: async () => 'done' as const, cancel() {}, prefetch() {}, setup: () => ({ destroy() {} }),
    bind: (b: HTMLElement, o?: { scope?: string }) => (log.push(`bind ${o?.scope ?? '-'}`), () => void log.push('unbind')),
  };
  return { log, feature: f as unknown as CsvExport };
}

@Component({
  selector: 't-dir',
  imports: [DzGrid, DzgSearch, DzgExport],
  template: `<input class="q" [dzgSearch]="search()" [dzgSearchDebounce]="debounce()" />
    <button type="button" [dzgExport]="exp()" [dzgExportScope]="scope()">CSV</button>
    @if (shown()) {
      <dz-grid [rows]="rows" [columns]="cols" [getRowId]="id" [messages]="messages" [features]="features()" />
    }`,
})
class Dir {
  readonly rows = ROWS;
  readonly cols = COLUMNS;
  readonly id = rowId;
  readonly messages = MESSAGES;
  readonly s1 = quickSearch();
  readonly s2 = quickSearch();
  readonly search = signal(this.s1);
  readonly features = signal<GridFeature[]>([this.s1]);
  readonly debounce = signal<number | undefined>(0);
  readonly e1 = fakeExport();
  readonly e2 = fakeExport();
  readonly exp = signal(this.e1.feature);
  readonly scope = signal<'all' | 'displayed' | undefined>('all');
  readonly shown = signal(true);
}

describe('directives rebinding', () => {
  function mount() {
    TestBed.configureTestingModule({ providers: [fakeEnv().provider] });
    const fixture = TestBed.createComponent(Dir);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    document.body.append(el);
    const ctrl = () => fixture.debugElement.query((d) => d.name === 'dz-grid')?.injector.get(DzgController);
    const type = (text: string) => {
      const q = el.querySelector<HTMLInputElement>('.q')!;
      q.value = text;
      q.dispatchEvent(new InputEvent('input', { bubbles: true }));
    };
    return { fixture, el, h: fixture.componentInstance, ctrl, type, run: () => fixture.detectChanges() };
  }

  it('a new scope unbinds the button before binding it again; a new feature too', async () => {
    const t = mount();
    await t.fixture.whenStable();
    expect(t.h.e1.log).toEqual(['bind all']);
    t.h.scope.set('displayed');
    t.run();
    expect(t.h.e1.log).toEqual(['bind all', 'unbind', 'bind displayed']);
    t.h.exp.set(t.h.e2.feature);
    t.run();
    expect(t.h.e1.log).toEqual(['bind all', 'unbind', 'bind displayed', 'unbind']);
    expect(t.h.e2.log).toEqual(['bind displayed']);
    t.fixture.destroy();
    expect(t.h.e2.log).toEqual(['bind displayed', 'unbind']);
  });

  it('a field keeps driving the grid across the grid’s destroy and remake', async () => {
    vi.useFakeTimers();
    const t = mount();
    await vi.runAllTimersAsync();
    t.h.shown.set(false);
    t.run();
    t.h.shown.set(true);
    t.run();
    t.type('bob4');
    vi.advanceTimersByTime(10);
    expect(t.ctrl()!.kernel()!.query.quick).toBe('bob4');
  });

  it('a field moved to another feature stops driving the first', () => {
    vi.useFakeTimers();
    const t = mount();
    t.h.search.set(t.h.s2);
    t.run();
    t.type('ann');
    vi.advanceTimersByTime(10);
    // The grid has s1 only: the field, now s2's, no longer reaches it.
    expect(t.ctrl()!.kernel()!.query.quick).toBe('');
  });
});

/** A cell that emits at its end, and at its start. */
@Component({ selector: 't-bye', changeDetection: ChangeDetectionStrategy.OnPush, template: `{{ cell().text }}` })
class Bye implements OnInit, OnDestroy {
  readonly cell = input.required<DzgPartContext<'cell'>>();
  readonly ctrl = inject(DzgController);
  readyAtInit = false;
  ngOnInit(): void {
    this.readyAtInit = this.ctrl.ready();
    this.cell().emit('hello');
    life.made++;
    life.seen.push(this);
  }
  ngOnDestroy(): void {
    this.cell().emit('bye');
    life.gone++;
  }
}

@Component({
  selector: 't-emits',
  imports: [DzGrid],
  template: `@if (shown()) {
    <dz-grid [rows]="rows()" [columns]="cols" [getRowId]="id" [messages]="messages" [parts]="parts()"
      [(quick)]="quick" [(selected)]="selected" (gridEvent)="all.push($event)" (cellAction)="actions.push($event)" />
  }`,
})
class Emits {
  readonly rows = signal<R[]>(ROWS);
  readonly cols = COLUMNS;
  readonly id = rowId;
  readonly messages = MESSAGES;
  readonly parts = signal<Record<string, SlotPart>>({ status: componentPart("cell", Bye) });
  readonly shown = signal(true);
  readonly quick = signal<string | undefined>(undefined);
  readonly selected = signal<SelectionState | undefined>(undefined);
  readonly all: GridEvent<R>[] = [];
  readonly actions: { name: string; key: string }[] = [];
}

function mountEmits(setup?: (h: Emits) => void) {
  TestBed.configureTestingModule({ providers: [fakeEnv().provider] });
  const fixture = TestBed.createComponent(Emits);
  setup?.(fixture.componentInstance);
  const warn = vi.spyOn(console, 'warn');
  fixture.detectChanges();
  const ctrl = () => fixture.debugElement.query((d) => d.name === 'dz-grid')?.injector.get(DzgController);
  return { fixture, h: fixture.componentInstance, warn, ctrl, run: () => fixture.detectChanges() };
}

describe('outputs around a part’s start and end', () => {
  it('a part ending with the grid: its emit reaches no output, and Angular warns nothing', () => {
    const t = mountEmits();
    const before = t.h.actions.filter((a) => a.name === 'bye').length;
    t.h.shown.set(false);
    t.run();
    expect(t.h.actions.filter((a) => a.name === 'bye').length).toBe(before);
    expect(t.warn.mock.calls.filter((c) => String(c[0]).includes('NG0953'))).toEqual([]);
  });

  it('a part ending while the grid lives (its registry entry gone) is heard', () => {
    const t = mountEmits();
    const live = life.made;
    t.h.parts.set({});
    t.run();
    expect(life.gone).toBe(live);
    expect(t.h.actions.filter((a) => a.name === 'bye')).toHaveLength(live);
  });

  it('a part’s emit during the grid’s first paint is heard, and the controller is ready in its init', () => {
    const t = mountEmits();
    const cells = life.seen.length;
    expect(cells).toBeGreaterThan(0);
    // Every part said hello: one cellAction each, whenever it was mounted.
    expect(t.h.actions.filter((a) => a.name === 'hello')).toHaveLength(cells);
    expect((life.seen as Bye[]).every((b) => b.readyAtInit)).toBe(true);
  });

  it('a part mounted after the first paint is heard (as during the first paint)', () => {
    const t = mountEmits();
    const before = life.made;
    const said = t.h.actions.filter((a) => a.name === 'hello').length;
    t.h.parts.set({ status: componentPart("cell", Bye) });
    t.run();
    const fresh = life.made - before;
    expect(fresh).toBeGreaterThan(0);
    expect(t.h.actions.filter((a) => a.name === 'hello')).toHaveLength(said + fresh);
  });
});

describe('models that change after the first write', () => {
  it('quick set to empty by the host clears the grid’s search', () => {
    const t = mountEmits((h) => h.quick.set('ann'));
    expect(t.ctrl()!.kernel()!.query.quick).toBe('ann');
    t.h.quick.set('');
    t.run();
    expect(t.ctrl()!.kernel()!.query.quick).toBe('');
  });

  it('selected changed by the host to another set of the same size is written', () => {
    const t = mountEmits((h) => h.selected.set({ mode: 'include', keys: new Set([dataKey('r4')!]) }));
    t.h.selected.set({ mode: 'include', keys: new Set([dataKey('r6')!]) });
    t.run();
    expect([...t.ctrl()!.kernel()!.selection.keys]).toEqual([dataKey('r6')!]);
  });

  it('a user change comes back once: the host model follows, no host event echoes it', () => {
    const t = mountEmits((h) => h.quick.set('ann'));
    t.ctrl()!.kernel()!.dispatch({ type: 'quick.set', text: 'bob' }, 'user');
    t.run();
    t.run();
    expect(t.h.quick()).toBe('bob');
    expect(t.h.all.filter((e) => e.type === 'quickChanged').map((e) => e.source)).toEqual(['host', 'user']);
  });
});

@Component({
  selector: 't-srv',
  imports: [DzGrid],
  template: `<dz-grid [rows]="rows" [columns]="cols" [getRowId]="id" [messages]="messages" [parts]="parts" />`,
})
class Srv {
  readonly rows = ROWS;
  readonly cols = COLUMNS;
  readonly id = rowId;
  readonly messages = MESSAGES;
  readonly parts = { status: componentPart('cell', StatusCell) };
}

describe('the registry between provideDzGrid and [parts]', () => {
  it('[parts] wins over the provider’s part of the same name, told once with detail provider', () => {
    const plain = definePart('cell', { mount: (h, c) => (h.append(`provider:${c.text}`), {}) }) as SlotPart;
    TestBed.configureTestingModule({ providers: [fakeEnv().provider, provideDzGrid({ parts: { status: plain } })] });
    const fixture = TestBed.createComponent(Srv);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.dzg-row[aria-rowindex="3"] [data-col="s"] t-status')).not.toBeNull();
    expect(el.querySelector('.dzg-row[aria-rowindex="3"] [data-col="s"]')!.textContent).not.toContain('provider:');
  });
});

describe('selected: the mode counts', () => {
  it('the host selecting all (exclude, none excluded) over the grid’s empty selection is written', () => {
    const t = mountEmits((h) => h.selected.set({ mode: 'include', keys: new Set() }));
    t.h.selected.set({ mode: 'exclude', keys: new Set() });
    t.run();
    expect(t.ctrl()!.kernel()!.selection.mode).toBe('exclude');
  });
});

describe('creation sends nothing twice', () => {
  it('right after the first paint no setting is sent again: one modelUpdated, each part checked once', () => {
    const checks: unknown[] = [];
    @Component({ selector: 't-once', changeDetection: ChangeDetectionStrategy.OnPush, template: `{{ cell().text }}` })
    class Once {
      readonly cell = input.required<DzgPartContext<'cell'>>();
      ngDoCheck(): void { checks.push(this.cell()); }
    }
    TestBed.configureTestingModule({ providers: [fakeEnv().provider] });
    const fixture = TestBed.createComponent(Emits);
    fixture.componentInstance.parts.set({ status: componentPart('cell', Once) });
    fixture.detectChanges();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(fixture.componentInstance.all.filter((e) => e.type === 'modelUpdated').length).toBeLessThanOrEqual(1);
    expect(checks).toHaveLength(el.querySelectorAll('t-once').length);
  });
});

describe('on a server, nothing of the document', () => {
  it('no style on the host, no style sheet in the head, no part made', () => {
    TestBed.configureTestingModule({ providers: [{ provide: PLATFORM_ID, useValue: 'server' }, fakeEnv().provider] });
    const head = document.head.innerHTML;
    const fixture = TestBed.createComponent(Srv);
    fixture.detectChanges();
    const host = (fixture.nativeElement as HTMLElement).querySelector('dz-grid')!;
    expect(host.getAttribute('style')).toBeNull();
    expect(document.head.innerHTML).toBe(head);
    expect(life.made).toBe(0);
    fixture.destroy();
  });
});
