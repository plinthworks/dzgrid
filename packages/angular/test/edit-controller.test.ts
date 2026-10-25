// `DzgController.edit()` (Phase 5 step 9 T3, docs/behaviors/edit-angular.md 6): the grid's `EditApi`, null
// before the grid, without the `edit` feature, after destroy; undo / redo / reapply act as the keys (S8-O2); one
// feature object in two grids, each its own api. Written first.
import { describe, it, expect, afterEach } from 'vitest';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { dataKey } from '@dzgrid/core';
import type { GridFeature } from '@dzgrid/dom';
import { edit } from '@dzgrid/dom/edit';
import { editors } from '@dzgrid/dom/editors';
import { DzGrid, DzgController } from '@dzgrid/angular';
import { fakeEnv } from './support';
import { EMSG, SCOLS, STOCK, cellIn, sid, type St } from './support-edit';

afterEach(() => {
  document.body.innerHTML = '';
});

const shared = edit<St>();

@Component({
  selector: 't-host',
  imports: [DzGrid],
  template: `<dz-grid [rows]="rows" [columns]="columns" [getRowId]="id" [messages]="messages" [features]="features" (gridReady)="a = $event" />
    @if (two) { <dz-grid [rows]="rows" [columns]="columns" [getRowId]="id" [messages]="messages" [features]="features" (gridReady)="b = $event" /> }`,
})
class Host {
  readonly rows = STOCK;
  readonly columns = SCOLS.map((c) => (c.id === 'stock' ? { ...c, sortable: true } : c));
  readonly id = sid;
  readonly messages = EMSG;
  features: GridFeature[] = [shared, editors()];
  two = false;
  a: DzgController<St> | null = null;
  b: DzgController<St> | null = null;
}

function mount(o: { features?: GridFeature[]; two?: boolean } = {}) {
  TestBed.configureTestingModule({ providers: [fakeEnv().provider] });
  const fixture = TestBed.createComponent(Host);
  const host = fixture.componentInstance;
  if (o.features) host.features = o.features;
  host.two = !!o.two;
  document.body.appendChild(fixture.nativeElement);
  return { fixture, host, el: fixture.nativeElement as HTMLElement };
}
const commit = (c: DzgController<St>, id: string, text: string) => c.edit()!.commit([{ key: dataKey(id)!, column: 'stock', input: { text } }]);

describe('controller.edit()', () => {
  it('null before the grid exists, the api once it does, null after destroy', () => {
    const t = mount();
    const ctl = t.fixture.debugElement.children[0]!.injector.get(DzgController) as DzgController<St>;
    expect(ctl.edit()).toBeNull();
    t.fixture.detectChanges();
    const api = ctl.edit();
    expect(api).not.toBeNull();
    expect(api).toBe(shared.api({ kernel: ctl.kernel()! }));
    t.fixture.destroy();
    expect(ctl.edit()).toBeNull();
  });

  it('found by its id wherever it sits in [features] (mutant: the first feature taken)', () => {
    const own = edit<St>();
    const t = mount({ features: [editors(), own] });
    t.fixture.detectChanges();
    expect(t.host.a!.edit()).toBe(own.api({ kernel: t.host.a!.kernel()! }));
  });

  it('null without the edit feature', () => {
    const t = mount({ features: [editors()] });
    t.fixture.detectChanges();
    expect(t.host.a!.ready()).toBe(true);
    expect(t.host.a!.edit()).toBeNull();
  });

  it('undo() and redo() act as the keys: the value back, the focus on the cell, canUndo / canRedo follow', () => {
    const t = mount();
    t.fixture.detectChanges();
    const c = t.host.a!;
    commit(c, 'p3', '77');
    expect(cellIn(t.el, 'p3', 'stock')!.textContent).toBe('77');
    expect(c.edit()!.canUndo).toBe(true);
    c.edit()!.undo();
    expect(cellIn(t.el, 'p3', 'stock')!.textContent).toBe('30');
    expect(document.activeElement).toBe(cellIn(t.el, 'p3', 'stock'));
    expect([c.edit()!.canUndo, c.edit()!.canRedo]).toEqual([false, true]);
    c.edit()!.redo();
    expect(cellIn(t.el, 'p3', 'stock')!.textContent).toBe('77');
  });

  it('reapply() puts the rows back in order', () => {
    const t = mount();
    t.fixture.detectChanges();
    const c = t.host.a!;
    c.dispatch({ type: 'sort.set', sort: [{ column: 'stock', dir: 'desc' }] });
    commit(c, 'p0', '100000');
    expect(c.kernel()!.rows.orderStale).toBe(true);
    c.edit()!.reapply();
    expect(c.kernel()!.rows.orderStale).toBe(false);
    expect(t.el.querySelector('.dzg-layer .dzg-row[aria-rowindex="2"] .dzg-cell[data-col="stock"]')!.textContent).toBe('100,000');
  });

  it('one feature object in two grids: each its own api, an undo in one leaves the other', () => {
    const t = mount({ two: true });
    t.fixture.detectChanges();
    const [a, b] = [t.host.a!, t.host.b!];
    expect(a.edit()).not.toBe(b.edit());
    commit(a, 'p1', '5');
    expect([a.edit()!.canUndo, b.edit()!.canUndo]).toEqual([true, false]);
    b.edit()!.undo();
    expect(a.edit()!.canUndo).toBe(true);
  });
});
