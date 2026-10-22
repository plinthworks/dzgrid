// `[(expanded)]` and `(rowExpanded)` on <dz-grid> (Phase 4 step 11, docs/phase-4-steps/step11-plan.md point 1,
// docs/behaviors/angular-parts.md « Trees and master/detail »). Written before the code.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { dataKey, type ColumnOrGroup, type GridCommand, type GridEvent, type RowKey } from '@dzgrid/core';
import type { GridFeature, SlotPart } from '@dzgrid/dom';
import { tree } from '@dzgrid/dom/tree';
import { detail } from '@dzgrid/dom/detail';
import { EN_TREE } from '@dzgrid/dom/locales/en-tree';
import { EN_DETAIL } from '@dzgrid/dom/locales/en-detail';
import { DzGrid, componentPart } from '@dzgrid/angular';
import { MESSAGES, fakeEnv } from './support';
import { PanelProbe } from './tree-support';

afterEach(() => {
  document.body.innerHTML = '';
});

type N = { id: string; parent: string | null; name: string };
/** 20 parents p0…p19, five children each. */
const TREE: N[] = Array.from({ length: 20 }, (_, i) => [
  { id: `p${i}`, parent: null, name: `parent ${i}` },
  ...Array.from({ length: 5 }, (_, j) => ({ id: `c${i}-${j}`, parent: `p${i}`, name: `child ${i}.${j}` })),
]).flat();
const COLS: ColumnOrGroup<N>[] = [{ id: 'name', header: 'Name' }];
const MSG = { ...MESSAGES, text: { ...MESSAGES.text, ...EN_TREE.text, ...EN_DETAIL.text } };
const k = (id: string): RowKey => dataKey(id)!;
const set = (...ids: string[]): ReadonlySet<RowKey> => new Set(ids.map(k));
const ids = (s: ReadonlySet<RowKey> | undefined): string[] => [...(s ?? [])].map((x) => String(x).replace(/^d:\d+:/, '')).sort();

@Component({
  selector: 't-host',
  imports: [DzGrid],
  template: `<dz-grid [rows]="rows()" [columns]="cols" [getRowId]="id" [messages]="messages" [features]="features" [parts]="parts"
    [expanded]="open()" (expandedChange)="changed($event)" (rowExpanded)="fired.push($event)" (gridEvent)="all.push($event)" />`,
})
class Host {
  readonly rows = signal<N[]>(TREE);
  readonly cols = COLS;
  readonly id = (r: N) => r.id;
  readonly messages = MSG;
  features: GridFeature[] = [tree<N>({ parentId: (r) => r.parent })];
  parts: Record<string, SlotPart> = {};
  readonly open = signal<ReadonlySet<RowKey> | undefined>(undefined);
  /** What came back through the model (a two-way binding, written out to see each value). */
  readonly changes: ReadonlySet<RowKey>[] = [];
  readonly fired: Extract<GridEvent<N>, { type: 'rowExpanded' }>[] = [];
  readonly all: GridEvent<N>[] = [];
  changed(s: ReadonlySet<RowKey> | undefined): void {
    this.changes.push(s!);
    this.open.set(s);
  }
}

function mount(setup: (h: Host) => void = () => {}) {
  TestBed.configureTestingModule({ providers: [fakeEnv().provider] });
  const fixture = TestBed.createComponent(Host);
  const host = fixture.componentInstance;
  setup(host);
  fixture.detectChanges();
  const grid = fixture.debugElement.query(By.directive(DzGrid)).componentInstance as DzGrid<N>;
  const kernel = grid.controller.kernel()!;
  const sent: { cmd: GridCommand; source: string }[] = [];
  const real = kernel.dispatch.bind(kernel);
  vi.spyOn(kernel, 'dispatch').mockImplementation((cmd, source) => (sent.push({ cmd, source }), real(cmd, source)));
  const expands = () => sent.filter((s) => s.cmd.type === 'rows.expand' || s.cmd.type === 'rows.expandAll');
  return { fixture, host, kernel, sent, expands, el: fixture.nativeElement as HTMLElement };
}

describe('[(expanded)]', () => {
  it('a set given at creation opens those rows as the host', () => {
    const t = mount((h) => h.open.set(set('p1', 'p3')));
    expect(ids(t.kernel.expansion)).toEqual(['p1', 'p3']);
    expect(t.host.fired.map((e) => [e.source, e.expanded, ids(new Set(e.rows))])).toEqual([['host', true, ['p1', 'p3']]]);
    // The host's own write never comes back.
    expect(t.host.changes).toEqual([]);
  });

  it('a new set later opens what it adds and closes what it drops, as the host', () => {
    const t = mount((h) => h.open.set(set('p1', 'p2')));
    t.host.open.set(set('p2', 'p5'));
    t.fixture.detectChanges();
    expect(ids(t.kernel.expansion)).toEqual(['p2', 'p5']);
    const sent = t.expands().map((s) => [s.cmd.type, s.source, (s.cmd as { expanded: boolean }).expanded, ids(new Set((s.cmd as { rows?: RowKey[] }).rows ?? []))]);
    expect(sent).toEqual([
      ['rows.expand', 'host', false, ['p1']],
      ['rows.expand', 'host', true, ['p5']],
    ]);
    expect(t.host.changes).toEqual([]);
  });

  it('a set naming a row the grid does not hold: the others open, the set stays as the host wrote it', () => {
    const t = mount((h) => h.open.set(set('p1', 'zz')));
    expect(ids(t.kernel.expansion)).toEqual(['p1']);
    expect(t.host.changes).toEqual([]);
    expect(ids(t.host.open())).toEqual(['p1', 'zz']);
  });

  it('an equal set (another object, same keys) writes nothing: the echo guard', () => {
    const t = mount((h) => h.open.set(set('p1', 'p2')));
    t.host.open.set(set('p2', 'p1'));
    t.fixture.detectChanges();
    expect(t.expands()).toEqual([]);
    expect(t.host.changes).toEqual([]);
  });

  it('an empty set closes everything', () => {
    const t = mount((h) => h.open.set(set('p1', 'p2', 'p7')));
    t.host.open.set(new Set());
    t.fixture.detectChanges();
    expect(t.kernel.expansion.size).toBe(0);
    expect(t.expands().map((s) => [s.cmd.type, s.source, (s.cmd as { expanded: boolean }).expanded])).toEqual([['rows.expand', 'host', false]]);
  });

  it('a user toggle comes back as a new set (a copy, not the grid’s live one) and fires (rowExpanded)', () => {
    const t = mount((h) => h.open.set(set('p1')));
    t.kernel.dispatch({ type: 'rows.expand', rows: [k('p4')], expanded: true }, 'user');
    expect(ids(t.host.changes.at(-1))).toEqual(['p1', 'p4']);
    expect(t.host.changes.at(-1)).not.toBe(t.kernel.expansion);
    expect(t.host.fired.at(-1)).toMatchObject({ type: 'rowExpanded', source: 'user', expanded: true, rows: [k('p4')] });
    // The model came back: no command goes out for it (the grid holds it already).
    t.fixture.detectChanges();
    expect(t.expands().filter((s) => s.source === 'host')).toEqual([]);
    // A later toggle does not change the set the model was given.
    const given = t.host.changes.at(-1)!;
    t.kernel.dispatch({ type: 'rows.expand', rows: [k('p1')], expanded: false }, 'user');
    expect(ids(given)).toEqual(['p1', 'p4']);
    expect(ids(t.host.changes.at(-1))).toEqual(['p4']);
  });

  it('a click on a tree toggle comes back into the model', () => {
    const t = mount();
    const toggle = t.el.querySelector<HTMLElement>('.dzg-row[aria-rowindex="2"] .dzg-toggle')!;
    expect(toggle).not.toBeNull();
    toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(ids(t.host.changes.at(-1))).toEqual(['p0']);
    expect(t.host.fired.at(-1)!.source).toBe('user');
  });

  it('an API command (the controller) comes back too', () => {
    const t = mount();
    const grid = t.fixture.debugElement.query(By.directive(DzGrid)).componentInstance as DzGrid<N>;
    grid.controller.dispatch({ type: 'rows.expandAll', expanded: true, depth: 1 });
    expect(ids(t.host.changes.at(-1))).toHaveLength(20);
  });

  it('keys of rows the grid does not hold are skipped, then open when [rows] brings them', () => {
    const t = mount((h) => {
      h.rows.set([]);
      h.open.set(set('p2', 'p9'));
    });
    // Nothing refused: the unknown keys were not sent.
    expect(t.host.all.filter((e) => e.type === 'problems')).toEqual([]);
    expect(t.kernel.expansion.size).toBe(0);
    t.host.rows.set(TREE);
    t.fixture.detectChanges();
    expect(ids(t.kernel.expansion)).toEqual(['p2', 'p9']);
    // The model kept the host's set all along: nothing came back.
    expect(t.host.changes).toEqual([]);
  });

  it('a row removed by the data leaves the model', () => {
    const t = mount((h) => h.open.set(set('p1', 'p2')));
    t.host.rows.set(TREE.filter((r) => r.id !== 'p1' && r.parent !== 'p1'));
    t.fixture.detectChanges();
    expect(ids(t.kernel.expansion)).toEqual(['p2']);
    expect(ids(t.host.changes.at(-1))).toEqual(['p2']);
  });

  it('with no model, the tree’s initial opening comes back; with one, the model wins over it', () => {
    const a = mount((h) => (h.features = [tree<N>({ parentId: (r) => r.parent, initial: 'all' })]));
    expect(ids(a.host.changes.at(-1))).toHaveLength(20);
    TestBed.resetTestingModule();
    const b = mount((h) => {
      h.features = [tree<N>({ parentId: (r) => r.parent, initial: 'all' })];
      h.open.set(set('p3'));
    });
    expect(ids(b.kernel.expansion)).toEqual(['p3']);
  });

  it('under a tree filter, a user’s close is not undone when another model is written (review scenario, guard)', () => {
    const t = mount((h) => (h.features = [tree<N>({ parentId: (r) => r.parent })]));
    t.kernel.dispatch({ type: 'quick.set', text: 'child 4' }, 'api');
    t.host.open.set(set('p4'));
    t.fixture.detectChanges();
    t.kernel.dispatch({ type: 'rows.expand', rows: [k('p4')], expanded: false }, 'user');
    expect(t.kernel.rows.isExpanded!(k('p4'))).toBe(false);
    // Any model write (here the search, written as the host) runs the same path.
    const grid = t.fixture.debugElement.query(By.directive(DzGrid)).componentInstance as DzGrid<N>;
    grid.quick.set('child 4');
    t.fixture.detectChanges();
    expect(t.kernel.rows.isExpanded!(k('p4'))).toBe(false);
  });

  it('opens and closes detail masters the same way', () => {
    const t = mount((h) => {
      h.features = [detail<N>({ part: 'panel', height: 60 })];
      h.parts = { panel: componentPart('detail', PanelProbe) };
      h.rows.set(TREE.filter((r) => !r.parent));
      h.open.set(set('p0'));
    });
    expect(ids(t.kernel.expansion)).toEqual(['p0']);
    expect(t.el.querySelectorAll('t-panel')).toHaveLength(1);
    t.kernel.dispatch({ type: 'rows.expand', rows: [k('p1')], expanded: true }, 'user');
    expect(ids(t.host.changes.at(-1))).toEqual(['p0', 'p1']);
    t.fixture.detectChanges();
    expect(t.el.querySelectorAll('t-panel')).toHaveLength(2);
    t.host.open.set(new Set());
    t.fixture.detectChanges();
    expect(t.el.querySelectorAll('t-panel')).toHaveLength(0);
  });
});
