// A <dz-grid> inside a detail panel's component (Phase 4 step 11, docs/phase-4-steps/step11-plan.md point 4,
// docs/behaviors/angular-parts.md « A grid inside a panel »): `<dz-grid [dzgNested]>` — its own controller and keys,
// Escape back to the panel's cell once, focus(), depth past 3 told, destroyed with its panel. Written first.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal, type OnDestroy } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { dataKey, detailKey, type ColumnOrGroup, type GridKernel, type Problem, type RowKey } from '@dzgrid/core';
import type { Geometry, GridFeature, SlotPart } from '@dzgrid/dom';
import { detail } from '@dzgrid/dom/detail';
import { EN_DETAIL } from '@dzgrid/dom/locales/en-detail';
import { DZG_ENV, DzGrid, DzgController, DzgPart, componentPart, type DzgPartContext } from '@dzgrid/angular';
import { MESSAGES, fakeEnv } from './support';

afterEach(() => {
  document.body.innerHTML = '';
});

type M = { id: string; name: string };
const MSG = { ...MESSAGES, text: { ...MESSAGES.text, ...EN_DETAIL.text } };
const COLS: ColumnOrGroup<M>[] = [
  { id: 'name', header: 'Name' },
  { id: 'id', header: 'Id' },
];
const k = (id: string): RowKey => dataKey(id)!;
const rowsOf = (prefix: string, n: number): M[] => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, name: `${prefix} ${i}` }));

/** Each inner grid: its own geometry (jsdom has no layout), synchronous paints. */
const innerEnv = { provide: DZG_ENV, useFactory: () => {
  const box = { block: 160, inline: 600, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => void (box.scrollTop = px), writeScrollInline: (px) => void (box.scrollInline = px) };
  return { geometry, sync: true };
} };

/** What the inner grids did, by depth. */
const seen = { deepPart: 'visits', made: [] as Visits[], grids: 0, gone: 0, problems: [] as Problem[], controllers: [] as DzgController<M>[], kernels: new Map<number, GridKernel<M>>(), maxDepth: 2 };

/** A detail component holding a grid of the master's visits; that grid opens its first row's panel while deeper than `maxDepth` allows. */
@Component({
  selector: 't-visits',
  imports: [DzGrid],
  providers: [innerEnv],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<dz-grid [dzgNested]="cell()" [rows]="rows()" [columns]="cols" [getRowId]="id" [messages]="messages" [features]="features" [parts]="parts"
    [expanded]="open()" (problems)="told($event)" (gridReady)="ready($event)" />`,
})
class Visits implements OnDestroy {
  readonly cell = input.required<DzgPartContext<'detail'>>();
  readonly outer = inject(DzgController);
  readonly rows = computed(() => rowsOf(`${(this.cell().row as M).id}.v`, 12));
  readonly cols = COLS;
  readonly id = (r: M) => r.id;
  readonly messages = MSG;
  readonly features: GridFeature[] = [detail<M>({ part: seen.deepPart, height: 200 })];
  readonly parts: Record<string, SlotPart> = { visits: componentPart('detail', Visits), plain: componentPart('detail', Plain) };
  readonly open = computed<ReadonlySet<RowKey>>(() => (this.cell().depth! <= seen.maxDepth ? new Set([this.rows()[0]!.id].map(k)) : new Set()));
  constructor() {
    seen.grids++;
    seen.made.push(this);
  }
  told(p: readonly Problem[]): void {
    seen.problems.push(...p);
  }
  ready(c: DzgController<M>): void {
    seen.controllers.push(c);
    seen.kernels.set(this.cell().depth!, c.kernel() as GridKernel<M>);
  }
  ngOnDestroy(): void {
    seen.gone++;
  }
}

/** A panel whose grid is not bound to it (no dzgNested): its Escape is its own business. */
@Component({
  selector: 't-plain',
  imports: [DzGrid],
  providers: [innerEnv],
  template: `<dz-grid [rows]="rows" [columns]="cols" [getRowId]="id" [messages]="messages" />`,
})
class Plain {
  readonly cell = input.required<DzgPartContext<'detail'>>();
  readonly rows = rowsOf('q', 4);
  readonly cols = COLS;
  readonly id = (r: M) => r.id;
  readonly messages = MSG;
}

@Component({
  selector: 't-host',
  imports: [DzGrid, DzgPart],
  template: `<dz-grid [rows]="rows" [columns]="cols" [getRowId]="id" [messages]="messages" [features]="features" [parts]="parts" [expanded]="open()">
      <ng-template dzgPart="tvisits" slot="detail" let-c>
        <dz-grid class="tv" [dzgNested]="c" [rows]="tplRows" [columns]="tplCols" [getRowId]="id" [messages]="messages">
          <ng-template dzgPart="btn" let-x><button type="button" class="ib">{{ x.text }}</button></ng-template>
        </dz-grid>
      </ng-template>
    </dz-grid>`,
})
class Host {
  readonly rows = rowsOf('m', 30);
  readonly cols = COLS;
  readonly id = (r: M) => r.id;
  readonly messages = MSG;
  features: GridFeature[] = [detail<M>({ part: 'visits', height: 200 })];
  readonly parts: Record<string, SlotPart> = { visits: componentPart('detail', Visits) };
  readonly tplRows = rowsOf('t', 8);
  readonly tplCols: ColumnOrGroup<M>[] = [{ id: 'name', header: 'Name' }, { id: 'id', header: 'Id', ui: { cell: 'btn' } }];
  readonly open = signal<ReadonlySet<RowKey>>(new Set([k('m0')]));
}

beforeEach(() => {
  seen.grids = seen.gone = 0;
  seen.made = [];
  seen.deepPart = 'visits';
  seen.problems = [];
  seen.controllers = [];
  seen.kernels = new Map();
  seen.maxDepth = 1;
});

function mount(setup: (h: Host) => void = () => {}) {
  TestBed.configureTestingModule({ providers: [fakeEnv({ block: 600 }).provider] });
  const fixture = TestBed.createComponent(Host);
  setup(fixture.componentInstance);
  fixture.detectChanges();
  document.body.append(fixture.nativeElement);
  const grid = fixture.debugElement.query(By.directive(DzGrid)).componentInstance as DzGrid<M>;
  const outer = grid.controller.kernel()!;
  const el = fixture.nativeElement as HTMLElement;
  const roots = () => [...el.querySelectorAll<HTMLElement>('.dzg')];
  const key = (target: Element, key: string, o: KeyboardEventInit = {}) => {
    const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...o });
    target.dispatchEvent(e);
    return e;
  };
  return { fixture, host: fixture.componentInstance, grid, outer, el, roots, key };
}

describe('[dzgNested]: a grid inside a detail component', () => {
  it('is a grid of its own in the panel: its own controller and kernel, made inside the panel box', () => {
    const t = mount();
    expect(t.roots()).toHaveLength(2);
    const inner = t.roots()[1]!;
    expect(inner.closest('.dzg-dbody')).not.toBeNull();
    expect(seen.controllers).toHaveLength(1);
    expect(seen.controllers[0]).not.toBe(t.grid.controller);
    expect(seen.kernels.get(2)).not.toBe(t.outer);
    expect(seen.kernels.get(2)!.rows.displayed.count).toBe(12);
    // The panel's component itself sees the grid around it.
    expect(seen.made[0]!.outer).toBe(t.grid.controller);
  });

  it('keys in the inner grid move its focus only', () => {
    const t = mount();
    t.outer.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: k('m3'), column: 'name' } }, 'api');
    const ctl = seen.controllers[0]!;
    const inner = seen.kernels.get(2)!;
    ctl.focusCell(k('m0.v0'), 'name');
    expect(inner.focus).toMatchObject({ row: k('m0.v0') });
    const before = t.outer.focus;
    t.key(document.activeElement!, 'ArrowDown');
    expect(inner.focus).toMatchObject({ kind: 'cell', row: k('m0.v1'), column: 'name' });
    expect(t.outer.focus).toEqual(before);
  });

  it('Escape the inner grid does not use goes back to the panel’s cell (prevented), once', () => {
    const t = mount();
    seen.controllers[0]!.focusCell(k('m0.v2'), 'name');
    const e = t.key(document.activeElement!, 'Escape');
    expect(e.defaultPrevented).toBe(true);
    expect(t.outer.focus).toMatchObject({ kind: 'cell', row: detailKey(k('m0')) });
    expect(document.activeElement!.closest('.dzg')).toBe(t.roots()[0]);
  });

  it('two levels down, Escape goes back one level only', () => {
    seen.maxDepth = 2;
    const t = mount();
    expect(t.roots()).toHaveLength(3);
    const mid = seen.kernels.get(2)!;
    const deep = seen.controllers.find((c) => c.kernel() === seen.kernels.get(3))!;
    deep.focusCell(k('m0.v0.v4'), 'name');
    const e = t.key(document.activeElement!, 'Escape');
    expect(e.defaultPrevented).toBe(true);
    // The middle grid's panel cell: its focus, and the page's; the outer grid's stays its panel (the focus is in it).
    expect(mid.focus).toMatchObject({ row: detailKey(k('m0.v0')) });
    expect(document.activeElement!.closest('.dzg')).toBe(t.roots()[1]);
    expect(t.outer.focus).toMatchObject({ row: detailKey(k('m0')) });
    // Escape again: now one more level up.
    t.key(document.activeElement!, 'Escape');
    expect(document.activeElement!.closest('.dzg')).toBe(t.roots()[0]);
  });

  it('an Escape in a grid deeper inside, not bound to its panel, is not taken by the grid around it', () => {
    seen.maxDepth = 2;
    seen.deepPart = 'plain';
    const t = mount();
    expect(t.roots()).toHaveLength(3);
    const cell = t.roots()[2]!.querySelector<HTMLElement>('.dzg-layer .dzg-row [data-col="name"]')!;
    cell.focus();
    const e = t.key(cell, 'Escape');
    expect(e.defaultPrevented).toBe(false);
    expect(document.activeElement!.closest('.dzg')).toBe(t.roots()[2]);
  });

  it('a grid not inside a panel never takes Escape', () => {
    const t = mount();
    t.grid.controller.focusCell(k('m3'), 'name');
    const e = t.key(document.activeElement!, 'Escape');
    expect(e.defaultPrevented).toBe(false);
    expect(t.outer.focus).toMatchObject({ row: k('m3') });
  });

  it('an Escape during a composition, or that only hid the inner tooltip, stays inside', () => {
    const t = mount();
    const inner = seen.kernels.get(2)!;
    seen.controllers[0]!.focusCell(k('m0.v1'), 'name');
    const at = document.activeElement!;
    const a = t.key(at, 'Escape', { isComposing: true });
    expect(a.defaultPrevented).toBe(false);
    expect(inner.focus).toMatchObject({ row: k('m0.v1') });
    expect(document.activeElement).toBe(at);
    const tip = t.roots()[1]!.querySelector<HTMLElement>(':scope > .dzg-tooltip')!;
    tip.hidden = false;
    tip.textContent = 'a tip';
    t.key(at, 'Escape');
    expect(tip.hidden).toBe(true);
    expect(inner.focus).toMatchObject({ row: k('m0.v1') });
    expect(document.activeElement).toBe(at);
    // The tooltip gone, the next Escape leaves.
    t.key(at, 'Escape');
    expect(document.activeElement!.closest('.dzg')).toBe(t.roots()[0]);
  });

  it('Enter on the panel’s cell goes into the inner grid (its first cell, then where it was left): the focus fallback finds its tab stop', () => {
    const t = mount();
    const inner = seen.kernels.get(2)!;
    t.outer.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: detailKey(k('m0')), column: 'name' } }, 'api');
    t.grid.controller.focusCell(detailKey(k('m0')), 'name');
    t.key(document.activeElement!, 'Enter');
    expect(inner.focus).toMatchObject({ kind: 'cell', row: k('m0.v0'), column: 'name' });
    expect(document.activeElement!.closest('.dzg')).toBe(t.roots()[1]);
    t.key(document.activeElement!, 'ArrowDown');
    t.key(document.activeElement!, 'Escape');
    t.key(document.activeElement!, 'Enter');
    expect(inner.focus).toMatchObject({ row: k('m0.v1') });
    expect(document.activeElement!.closest('.dzg')).toBe(t.roots()[1]);
  });

  it('is destroyed with its panel: collapse, then the grid’s end', () => {
    seen.maxDepth = 2;
    const t = mount();
    expect(seen.grids).toBe(2);
    t.host.open.set(new Set());
    t.fixture.detectChanges();
    expect(seen.gone).toBe(2);
    expect(t.roots()).toHaveLength(1);
    t.host.open.set(new Set([k('m0'), k('m1')]));
    t.fixture.detectChanges();
    expect(t.roots().length).toBeGreaterThan(1);
    t.fixture.destroy();
    expect(seen.gone).toBe(seen.grids);
  });

  it('past three levels the inner grid tells unsupported-combination (detail.depth); not before', () => {
    seen.maxDepth = 2;
    mount();
    expect(seen.problems.filter((p) => p.path === 'detail.depth')).toEqual([]);
    TestBed.resetTestingModule();
    seen.maxDepth = 3;
    mount();
    expect(seen.kernels.has(4)).toBe(true);
    expect(seen.problems.filter((p) => p.path === 'detail.depth')).toEqual([{ code: 'unsupported-combination', severity: 'warning', path: 'detail.depth', detail: '4' }]);
  });

  it('works from a template too (let-c bound to dzgNested)', () => {
    const t = mount((h) => (h.features = [detail<M>({ part: 'tvisits', height: 200 })]));
    const inner = t.el.querySelector<HTMLElement>('dz-grid.tv .dzg')!;
    expect(inner).not.toBeNull();
    const cell = inner.querySelector<HTMLElement>('.dzg-layer .dzg-row [data-col="name"]')!;
    cell.focus();
    t.key(cell, 'Escape');
    expect(t.outer.focus).toMatchObject({ row: detailKey(k('m0')) });
  });

  it('an Escape the inner grid used (a control in its cell back to the cell) stays inside', () => {
    const t = mount((h) => (h.features = [detail<M>({ part: 'tvisits', height: 200 })]));
    const inner = t.el.querySelector<HTMLElement>('dz-grid.tv .dzg')!;
    const button = inner.querySelector<HTMLButtonElement>('.dzg-layer .dzg-row button.ib')!;
    button.focus();
    const e = t.key(button, 'Escape');
    expect(e.defaultPrevented).toBe(true);
    expect(document.activeElement!.closest('.dzg')).toBe(inner);
    expect(document.activeElement!.classList.contains('dzg-cell')).toBe(true);
  });
});
