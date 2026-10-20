// Components as cell parts (step 22, docs/behaviors/angular-parts.md: mounting, emit, focus, throws).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ChangeDetectionStrategy, Component, ElementRef, inject, input, signal, type OnDestroy } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { dataKey, type ColumnOrGroup, type GridEvent } from '@dzgrid/core';
import type { SlotPart } from '@dzgrid/dom';
import { DzGrid, DzgController, componentPart, type DzgCell, type DzgPartContext } from '@dzgrid/angular';
import { COLUMNS, MESSAGES, ROWS, StatusCell, events, fakeEnv, life, rowId, scroller, type R } from './support';

// Reset before each test: the setup's afterEach destroys the last test's fixture after this file's hooks.
beforeEach(() => life.reset());
afterEach(() => {
  document.body.innerHTML = '';
});

const statusPart = componentPart('cell', StatusCell);

@Component({
  selector: 't-host',
  imports: [DzGrid],
  template: `<dz-grid [rows]="rows()" [columns]="columns()" [getRowId]="id" [messages]="messages" [parts]="parts()"
    (gridEvent)="all.push($event)" (cellAction)="actions.push($event)" />`,
})
class Host {
  readonly rows = signal<R[]>(ROWS);
  readonly columns = signal<ColumnOrGroup<R>[]>(COLUMNS);
  readonly parts = signal<Record<string, SlotPart>>({ status: statusPart });
  readonly id = rowId;
  readonly messages = MESSAGES;
  readonly all: GridEvent<R>[] = [];
  readonly actions: unknown[] = [];
}

function mount(o: { block?: number } = {}) {
  const env = fakeEnv(o);
  TestBed.configureTestingModule({ providers: [env.provider] });
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const buttons = () => [...el.querySelectorAll<HTMLButtonElement>('.dzg-layer [data-col="s"] button.st')];
  const cellOf = (row: number, col = 's') => el.querySelector<HTMLElement>(`.dzg-row[aria-rowindex="${row + 2}"] [data-col="${col}"]`)!;
  return { fixture, el, host: fixture.componentInstance, buttons, cellOf, scroll: scroller(fixture, env.box) };
}

describe('a component as a cell part', () => {
  it('mounts one instance per pooled cell, with the cell context in its `cell` input', () => {
    const t = mount();
    const cells = t.el.querySelectorAll('.dzg-layer [data-col="s"]').length;
    expect(cells).toBeGreaterThan(5);
    expect(life.made).toBe(cells);
    expect(t.buttons()).toHaveLength(cells);
    // Row 3 is odd: the button shows the cell's text.
    expect(t.cellOf(3).querySelector('button')!.textContent!.trim()).toBe('odd');
    expect(t.cellOf(4).querySelector('button')!.textContent!.trim()).toBe('even');
  });

  it('keeps the instance when the pooled cell is rebound: the same element, a new `cell()`', () => {
    const t = mount();
    const before = life.made;
    const host = t.el.querySelector('t-status')!;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    for (let i = 1; i <= 30; i++) {
      t.scroll(i * 8 * 32);
      vi.advanceTimersByTime(300);
    }
    vi.useRealTimers();
    // Scrolling rebinds: a few cells for the overscan at most, never one per row shown.
    expect(life.made).toBeLessThanOrEqual(before + 4);
    expect(life.gone).toBe(life.made - t.el.querySelectorAll('t-status').length);
    expect(host.isConnected).toBe(true);
    // The rows now shown are far down: their cells say what those rows hold.
    const shown = [...t.el.querySelectorAll<HTMLElement>('.dzg-layer .dzg-row')].filter((r) => r.querySelector('t-status'));
    const index = Number(shown.at(-1)!.getAttribute('aria-rowindex')) - 2;
    expect(index).toBeGreaterThan(200);
    expect(shown.at(-1)!.querySelector('button')!.textContent!.trim()).toBe(index % 2 ? 'odd' : 'even');
  });

  it('emit sends cellAction with the column and the key of the row the cell shows at the call', () => {
    const t = mount();
    t.cellOf(3).querySelector('button')!.click();
    expect(t.host.actions).toEqual([{ type: 'cellAction', source: 'user', column: 's', key: 'd:2:r3', name: 'open', detail: 'odd' }]);
    expect(events(t.host.all, 'cellAction')).toHaveLength(1);
    // Rebound to other rows: the same button now speaks for its new row.
    const button = t.cellOf(3).querySelector('button')!;
    t.scroll(100 * 32);
    const row = button.closest('.dzg-row')!;
    const index = Number(row.getAttribute('aria-rowindex')) - 2;
    expect(index).not.toBe(3);
    button.click();
    expect(t.host.actions.at(-1)).toMatchObject({ column: 's', key: `d:${`r${index}`.length}:r${index}` });
  });

  it('emit reaches the kernel’s subscribers (the grid’s onEvent side), not only the outputs', () => {
    const t = mount();
    const ctrl = t.fixture.debugElement.children[0]!.injector.get(DzgController);
    const heard: GridEvent<R>[] = [];
    ctrl.kernel()!.subscribe((e) => heard.push(e as GridEvent<R>));
    t.cellOf(0).querySelector('button')!.click();
    // The button's own handler first, then the click reaches the grid's cell.
    expect(heard.map((e) => e.type)).toEqual(['cellAction', 'cellClicked', 'rowClicked']);
  });

  it('can inject the grid’s controller and the grid', () => {
    const t = mount();
    const cmp = life.seen[0] as StatusCell;
    expect(cmp.controller).toBe(t.fixture.debugElement.children[0]!.injector.get(DzgController));
    expect(cmp.controller.ready()).toBe(true);
  });

  it('is destroyed with the grid: mounts equal destroys, no node left', () => {
    const t = mount();
    expect(life.made).toBeGreaterThan(0);
    t.fixture.destroy();
    expect(life.gone).toBe(life.made);
    expect(t.el.querySelector('.dzg')).toBeNull();
    expect(t.el.querySelector('t-status')).toBeNull();
  });

  it('is destroyed and its nodes removed when its column leaves, and when the registry drops it', () => {
    const t = mount();
    const n = life.made;
    t.host.columns.set(COLUMNS.filter((c) => c.id !== 's'));
    t.fixture.detectChanges();
    expect(life.gone).toBe(n);
    expect(t.el.querySelector('t-status')).toBeNull();
    t.host.columns.set(COLUMNS);
    t.fixture.detectChanges();
    expect(t.el.querySelectorAll('t-status').length).toBe(life.made - life.gone);
    expect(life.made - life.gone).toBeGreaterThan(0);
    // The registry without the name: plain text again.
    t.host.parts.set({});
    t.fixture.detectChanges();
    expect(life.gone).toBe(life.made);
    expect(t.cellOf(3).textContent).toBe('odd');
  });

  it('keeps the same instances when the registry is a new object with the same parts', () => {
    const t = mount();
    const n = life.made;
    t.host.parts.set({ status: statusPart });
    t.fixture.detectChanges();
    expect(life.made).toBe(n);
    expect(life.gone).toBe(0);
  });
});

/** A cell component that throws in its constructor for one row. */
@Component({ selector: 't-broken', template: `<span class="ok">{{ cell().text }}</span>` })
class Broken implements OnDestroy {
  readonly cell = input.required<DzgPartContext<'cell'>>();
  constructor() {
    life.made++;
  }
  ngOnDestroy(): void {
    life.gone++;
  }
}
/** Throws while checking its view for row 3. */
@Component({ selector: 't-bad-check', template: `<span class="ok">{{ check() }}</span>` })
class BadCheck implements OnDestroy {
  readonly cell = input.required<DzgPartContext<'cell'>>();
  constructor() {
    life.made++;
  }
  check(): string {
    if (this.cell().key === 'd:2:r3') throw new Error('cell broke');
    return this.cell().text;
  }
  ngOnDestroy(): void {
    life.gone++;
  }
}

describe('a component that throws', () => {
  it('in its first check costs its own cell only: empty, reported, destroyed; the rest paints', () => {
    const report = vi.fn();
    (window as unknown as { reportError: unknown }).reportError = report;
    const env = fakeEnv();
    TestBed.configureTestingModule({ providers: [env.provider] });
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.parts.set({ status: componentPart('cell', BadCheck) });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const cell = (i: number) => el.querySelector<HTMLElement>(`.dzg-row[aria-rowindex="${i + 2}"] [data-col="s"]`)!;
    expect(cell(3).textContent).toBe('');
    expect(cell(4).querySelector('.ok')!.textContent).toBe('even');
    expect(report).toHaveBeenCalledTimes(1);
    fixture.destroy();
    expect(life.gone).toBe(life.made);
    delete (window as unknown as { reportError?: unknown }).reportError;
  });

  it('on a later rebind is destroyed there, and the cell left empty', () => {
    const report = vi.fn();
    (window as unknown as { reportError: unknown }).reportError = report;
    const env = fakeEnv();
    TestBed.configureTestingModule({ providers: [env.provider] });
    const fixture = TestBed.createComponent(Host);
    // Rows 0..2 first, then row 3 slides into a cell that already holds a component.
    fixture.componentInstance.rows.set(ROWS.slice(0, 3).concat(ROWS.slice(5, 8)));
    fixture.componentInstance.parts.set({ status: componentPart('cell', BadCheck) });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const n = life.made;
    fixture.componentInstance.rows.set(ROWS.slice(0, 8));
    fixture.detectChanges();
    const cell = (i: number) => el.querySelector<HTMLElement>(`.dzg-row[aria-rowindex="${i + 2}"] [data-col="s"]`)!;
    expect(cell(3).textContent).toBe('');
    expect(cell(2).querySelector('.ok')!.textContent).toBe('even');
    expect(report).toHaveBeenCalledTimes(1);
    expect(life.gone).toBeGreaterThan(0);
    expect(life.made).toBeGreaterThanOrEqual(n);
    fixture.destroy();
    expect(life.gone).toBe(life.made);
    delete (window as unknown as { reportError?: unknown }).reportError;
  });

  it('in its constructor: the cell is empty, and nothing is left behind', () => {
    const report = vi.fn();
    (window as unknown as { reportError: unknown }).reportError = report;
    const env = fakeEnv();
    TestBed.configureTestingModule({ providers: [env.provider] });
    const fixture = TestBed.createComponent(Host);
    let n = 0;
    @Component({ selector: 't-ctor', template: `x` })
    class Ctor {
      readonly cell = input.required<DzgPartContext<'cell'>>();
      constructor() {
        if (n++ === 2) throw new Error('constructor broke');
      }
    }
    fixture.componentInstance.parts.set({ status: componentPart('cell', Ctor) });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.dzg-row[aria-rowindex="4"] [data-col="s"]')!.textContent).toBe('');
    expect(el.querySelector('.dzg-row[aria-rowindex="3"] [data-col="s"]')!.textContent).toBe('x');
    expect(report).toHaveBeenCalledTimes(1);
    expect(el.querySelectorAll('t-ctor').length).toBe(el.querySelectorAll('.dzg-layer [data-col="s"]').length - 1);
    delete (window as unknown as { reportError?: unknown }).reportError;
  });
});

/** A cell with two buttons; `focus()` takes the second. */
@Component({
  selector: 't-two',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<button type="button" class="a">a</button><button type="button" class="b">b</button>`,
})
class Two implements DzgCell {
  readonly cell = input.required<DzgPartContext<'cell'>>();
  focus(): boolean {
    (this.el.querySelector('.b') as HTMLElement).focus();
    return true;
  }
  private readonly el: HTMLElement = inject(ElementRef).nativeElement;
}
@Component({ selector: 't-plain', template: `<span>text</span><button type="button" class="first">go</button>` })
class Plain {
  readonly cell = input.required<DzgPartContext<'cell'>>();
}

describe('focus in a component cell', () => {
  function focusMount(cmp: typeof Two | typeof Plain) {
    const env = fakeEnv();
    TestBed.configureTestingModule({ providers: [env.provider] });
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.parts.set({ status: componentPart('cell', cmp) });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    document.body.append(el);
    const ctrl = fixture.debugElement.children[0]!.injector.get(DzgController);
    ctrl.focusCell(dataKey('r1')!, 's');
    const cell = el.querySelector<HTMLElement>('.dzg-row[aria-rowindex="3"] [data-col="s"]')!;
    return { el, ctrl, cell, fixture };
  }

  it('Enter calls the component’s focus()', () => {
    const t = focusMount(Two);
    t.cell.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(document.activeElement?.className).toBe('b');
    expect(t.cell.contains(document.activeElement)).toBe(true);
  });

  it('without focus(), F2 focuses the first tabbable element inside', () => {
    const t = focusMount(Plain);
    t.cell.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', bubbles: true }));
    expect(document.activeElement?.className).toBe('first');
  });

  it('a control inside owns its arrows: the grid’s focus stays on the cell (cell-widget)', () => {
    const t = focusMount(Plain);
    t.cell.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', bubbles: true }));
    const before = t.ctrl.kernel()!.focus;
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(t.ctrl.kernel()!.focus).toEqual(before);
    expect(document.activeElement?.className).toBe('first');
  });
});
