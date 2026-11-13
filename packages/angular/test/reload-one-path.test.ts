// `reload()` is one path (reload.md 2–5; review 1.12.0): `DzgController.reload()` is the grid's `api.reload()` (the
// element's is too); `refresh({})`, its own path, asks the same thing, keeps the same state and paints the same rows.
// Made-up shops; expectations by hand.
import { describe, it, expect, afterEach } from 'vitest';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { dataKey, type ColumnOrGroup, type GridKernel, type RowModel, type SourceBinding } from '@dzgrid/core';
import { sourceRows, type DataRequest, type DataSource } from '@dzgrid/core/server';
import type { GridInstance } from '@dzgrid/dom';
import { EN } from '@dzgrid/dom/locales/en';
import { DzGrid, DzgController } from '@dzgrid/angular';
import { fakeEnv } from './support';

afterEach(() => void (document.body.innerHTML = ''));

type S = { id: string; region: string };
const COLUMNS: ColumnOrGroup<S>[] = [{ id: 'region', header: 'Region' }];
const MESSAGES = { locale: 'en', text: EN.text };

@Component({
  selector: 't-reload',
  imports: [DzGrid],
  template: `<dz-grid [source]="source" [rows]="rows" [operations]="ops" [pagination]="paging" [columns]="columns" [getRowId]="id" [messages]="messages" />`,
})
class Host {
  source: SourceBinding<S> | undefined;
  rows: S[] | undefined;
  ops: 'server' | undefined;
  paging: { pageSize: number } | undefined;
  readonly columns = COLUMNS;
  readonly id = (s: S) => s.id;
  readonly messages = MESSAGES;
}

type How = 'api.reload' | 'ctl.reload' | 'ctl.refresh({})';
function mount(o: Partial<Pick<Host, 'source' | 'rows' | 'ops' | 'paging'>>) {
  TestBed.resetTestingModule(); // several grids in one test, one module each
  TestBed.configureTestingModule({ providers: [fakeEnv().provider] });
  const fixture = TestBed.createComponent(Host);
  Object.assign(fixture.componentInstance, o);
  document.body.appendChild(fixture.nativeElement);
  fixture.detectChanges();
  const el = fixture.debugElement.children[0]!;
  const ctl = el.injector.get(DzgController) as DzgController<S>;
  const grid = (el.componentInstance as { _grid(): GridInstance<S, RowModel<S>> })._grid(); // the component's grid signal is private: read here to call the grid's own api
  const go = (how: How) => (how === 'api.reload' ? grid.api.reload!() : how === 'ctl.reload' ? ctl.reload() : ctl.refresh({}));
  const shown = () => [...(fixture.nativeElement as HTMLElement).querySelectorAll('.dzg-layer > .dzg-row .dzg-cell[data-col="region"]')].map((c) => c.textContent);
  return { fixture, ctl, kernel: ctl.kernel()! as GridKernel<S, RowModel<S>>, go, shown };
}

describe('reload(): one path for the grid\'s api, the controller and refresh({})', () => {
  it('the controller\'s reload() is the grid\'s api.reload(); refresh() paints, refresh({}) and refresh({ purge }) invalidate then paint', () => {
    const calls: string[] = [];
    const ctl = new DzgController<S>();
    const api = { reload: () => calls.push('reload'), refresh: () => calls.push('refresh') };
    const kernel = { rows: { invalidate: (o: object) => calls.push(`invalidate ${JSON.stringify(o)}`) } };
    ctl._attach(kernel as never, { api } as never); // never: a stand-in kernel and grid, only the members these methods reach
    ctl.reload();
    ctl.refresh({});
    ctl.refresh();
    ctl.refresh({ purge: true });
    expect(calls).toEqual(['reload', 'invalidate {}', 'refresh', 'refresh', 'invalidate {"purge":true}', 'refresh']);
  });

  it('server pages, a request in flight: the same requests, the same page, sort, filter and selection, the same rows', () => {
    const run = (how: How) => {
      const calls: { req: DataRequest; ok(v: unknown): void }[] = [];
      let town = 'Oran';
      const data: DataSource<S> = { fetch: (req) => ({ then(ok: (v: never) => void) { calls.push({ req, ok: ok as never }); } }) as never }; // never: a thenable stands for the promise
      const answer = (c: (typeof calls)[number]) => c.ok({ rows: [0, 1].map((j) => ({ id: `p${c.req.page!.index}r${j}`, region: `${town} ${c.req.page!.index}.${j}` })), total: 6 });
      const t = mount({ source: sourceRows(data), ops: 'server', paging: { pageSize: 2 } });
      answer(calls[0]!);
      t.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'region', dir: 'desc' }] }, 'user');
      t.kernel.dispatch({ type: 'filter.set', filter: { region: { type: 'text', op: 'contains', value: 'r' } } }, 'user');
      for (const c of calls.slice(1)) answer(c);
      t.kernel.dispatch({ type: 'page.go', index: 1 }, 'user');
      answer(calls.at(-1)!);
      t.kernel.dispatch({ type: 'selection.toggle', row: dataKey('p1r0')! }, 'user');
      const before = calls.length;
      // A request in flight (a page asked, not answered), then the reload.
      t.kernel.dispatch({ type: 'page.go', index: 2 }, 'user');
      t.kernel.dispatch({ type: 'page.go', index: 1 }, 'user');
      town = 'Blida';
      t.go(how);
      const asked = calls.slice(before).map((c) => [c.req.page!.index, c.req.sort, c.req.filter]);
      for (const c of calls.slice(before)) answer(c);
      t.fixture.detectChanges();
      return { asked, page: t.kernel.rows.page!.index, sort: t.kernel.query.sort, filter: t.kernel.query.filter, selected: t.kernel.selection, shown: t.shown() };
    };
    const api = run('api.reload');
    const sort = [{ column: 'region', dir: 'desc' }];
    const filter = { region: { type: 'text', op: 'contains', value: 'r' } };
    expect(api.asked.at(-1)).toEqual([1, sort, filter]);
    expect(api.page).toBe(1);
    expect(api.sort).toEqual(sort);
    expect(api.filter).toEqual(filter);
    expect(api.shown).toEqual(['Blida 1.0', 'Blida 1.1']);
    expect(run('ctl.reload')).toEqual(api);
    expect(run('ctl.refresh({})')).toEqual(api);
  });

  it('rows given by the application: nothing fetched, the same rows painted, the selection kept, by each path', () => {
    const run = (how: How) => {
      const t = mount({ rows: [{ id: 'a', region: 'Alger' }, { id: 'b', region: 'Oran' }] });
      t.kernel.dispatch({ type: 'selection.toggle', row: dataKey('b')! }, 'user');
      expect(() => t.go(how)).not.toThrow();
      t.fixture.detectChanges();
      return { selected: t.kernel.selection, shown: t.shown() };
    };
    const api = run('api.reload');
    expect(api.shown).toEqual(['Alger', 'Oran']);
    expect(run('ctl.reload')).toEqual(api);
    expect(run('ctl.refresh({})')).toEqual(api);
  });
});
