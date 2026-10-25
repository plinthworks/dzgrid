// The editing outputs of `<dz-grid>` (Phase 5 step 9 T2, docs/behaviors/edit-angular.md 3): `(cellEdited)`,
// `(saveFailed)`, `(orderStale)`, `(undoChanged)`, each the grid's own event; `(gridEvent)` still gets them all;
// none after destroy; what the grid tells before the first render held, then told in order. Written first.
import { describe, it, expect, afterEach } from 'vitest';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { dataKey, type GridEvent } from '@dzgrid/core';
import { emit } from '@dzgrid/core/internal';
import type { SaveHandler } from '@dzgrid/core/edit';
import { edit, type EditFeature } from '@dzgrid/dom/edit';
import { editors } from '@dzgrid/dom/editors';
import { DzGrid, type DzgController } from '@dzgrid/angular';
import { fakeEnv } from './support';
import { EMSG, SCOLS, STOCK, cellIn, key, ofType, settle, sid, typeIn, type St } from './support-edit';

afterEach(() => {
  document.body.innerHTML = '';
});

type Out = { name: string; e: GridEvent<St> };

@Component({
  selector: 't-host',
  imports: [DzGrid],
  template: `<dz-grid [rows]="rows" [columns]="columns" [getRowId]="id" [messages]="messages" [features]="features" [save]="save()"
    (gridEvent)="all.push($event)" (gridReady)="ready($event)"
    (cellEdited)="out.push({ name: 'cellEdited', e: $event })" (saveFailed)="out.push({ name: 'saveFailed', e: $event })"
    (orderStale)="out.push({ name: 'orderStale', e: $event })" (undoChanged)="out.push({ name: 'undoChanged', e: $event })" />`,
})
class Host {
  readonly rows = STOCK;
  readonly columns = SCOLS.map((c) => (c.id === 'stock' ? { ...c, sortable: true } : c));
  readonly id = sid;
  readonly messages = EMSG;
  readonly editing: EditFeature<St> = edit<St>();
  readonly features = [this.editing, editors()];
  readonly save = signal<SaveHandler<St> | undefined>(undefined);
  readonly all: GridEvent<St>[] = [];
  readonly out: Out[] = [];
  ctl: DzgController<St> | null = null;
  /** Set by a test: a commit made from `(gridReady)`, before the first render. */
  static commitAtReady = false;
  ready(c: DzgController<St>): void {
    this.ctl = c;
    if (Host.commitAtReady) this.editing.api({ kernel: c.kernel()! })!.commit([{ key: dataKey('p1')!, column: 'stock', input: { text: '5' } }]);
  }
}

function mount(save?: SaveHandler<St>) {
  TestBed.configureTestingModule({ providers: [fakeEnv().provider] });
  const fixture = TestBed.createComponent(Host);
  const host = fixture.componentInstance;
  if (save) host.save.set(save);
  document.body.appendChild(fixture.nativeElement);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const write = (id: string, text: string) => {
    host.ctl!.focusCell(dataKey(id)!, 'stock');
    cellIn(el, id, 'stock')!.focus();
    key('F2');
    const f = el.querySelector<HTMLInputElement>('.dzg-field')!;
    typeIn(f, text);
    key('Enter', {}, f);
  };
  const named = (n: string) => host.out.filter((o) => o.name === n).map((o) => o.e);
  return { fixture, host, el, write, named };
}

afterEach(() => {
  Host.commitAtReady = false;
});

describe('the editing outputs', () => {
  it('(cellEdited) and (undoChanged): once per event, the grid’s own objects, as (gridEvent) got them', () => {
    const t = mount();
    t.write('p2', '7');
    expect(t.named('cellEdited')).toEqual(ofType(t.host.all, 'cellEdited'));
    expect(t.named('cellEdited').length).toBe(1);
    expect(t.named('cellEdited')[0]).toBe(ofType(t.host.all, 'cellEdited')[0]);
    expect(t.named('undoChanged').length).toBe(1);
    expect(t.named('undoChanged')[0]).toBe(ofType(t.host.all, 'undoChanged')[0]);
    expect(t.named('undoChanged')[0]).toMatchObject({ canUndo: true, canRedo: false });
    // editingStarted / editingStopped: not outputs, still in (gridEvent).
    expect(ofType(t.host.all, 'editingStarted').length).toBe(1);
    expect(ofType(t.host.all, 'editingStopped').length).toBe(1);
  });

  it('(saveFailed): the host’s error unchanged (the same object)', async () => {
    const error = Object.assign(new Error('no'), { reason: 'locked' });
    const t = mount(() => Promise.reject(error));
    t.write('p2', '7');
    await settle();
    const f = t.named('saveFailed');
    expect(f.length).toBe(1);
    expect((f[0] as Extract<GridEvent<St>, { type: 'saveFailed' }>).error).toBe(error);
    expect(f[0]).toBe(ofType(t.host.all, 'saveFailed')[0]);
  });

  it('(orderStale): true when an edit puts the sorted column out of order, false after reapply', () => {
    const t = mount();
    t.host.ctl!.dispatch({ type: 'sort.set', sort: [{ column: 'stock', dir: 'asc' }] });
    t.write('p2', '9999');
    expect(t.named('orderStale').map((e) => (e as Extract<GridEvent<St>, { type: 'orderStale' }>).stale)).toEqual([true]);
    t.host.editing.api({ kernel: t.host.ctl!.kernel()! })!.reapply();
    expect(t.named('orderStale').map((e) => (e as Extract<GridEvent<St>, { type: 'orderStale' }>).stale)).toEqual([true, false]);
    expect(t.named('orderStale')).toEqual(ofType(t.host.all, 'orderStale'));
  });

  it('none after destroy', () => {
    const t = mount();
    const k = t.host.ctl!.kernel()!;
    t.fixture.destroy();
    emit(k, { type: 'undoChanged', source: 'user', canUndo: true, canRedo: false });
    emit(k, { type: 'cellEdited', source: 'user', key: dataKey('p1')!, column: 'stock', value: 1, previous: 0, origin: 'edit' } as never);
    expect(t.host.out).toEqual([]);
  });

  it('a commit from (gridReady), before the first render: held, then told in order after it', () => {
    Host.commitAtReady = true;
    const t = mount();
    expect(t.host.out.map((o) => o.name)).toEqual(['cellEdited', 'undoChanged']);
    expect(t.host.out.map((o) => o.e)).toEqual(t.host.all.filter((e) => e.type === 'cellEdited' || e.type === 'undoChanged'));
    expect(cellIn(t.el, 'p1', 'stock')!.textContent).toBe('5');
  });
});
