// Phase 8 step 8 (Q-NG A, row-transactions-async.md, server-side-groups.md): the controller's `refresh({ purge })`,
// `applyTransaction` and `applyTransactionAsync`, and `[(groupBy)]` on a `serverSideRows` source. Made-up shops;
// expectations by hand, written before the code.
import { describe, it, expect, afterEach } from 'vitest';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { dataKey, type ColumnOrGroup, type SourceBinding, type TransactionResult } from '@dzgrid/core';
import type { DataRequest, DataSource } from '@dzgrid/core/server';
import { infiniteRows } from '@dzgrid/core/infinite';
import { serverSideRows } from '@dzgrid/core/server-side';
import type { GridFeature } from '@dzgrid/dom';
import { grouping } from '@dzgrid/dom/grouping';
import { EN } from '@dzgrid/dom/locales/en';
import { EN_GROUP } from '@dzgrid/dom/locales/en-group';
import { DzGrid, DzgController } from '@dzgrid/angular';
import { fakeEnv } from './support';

afterEach(() => void (document.body.innerHTML = ''));

type S = { id: string; region: string; qty: number };
const COLUMNS: ColumnOrGroup<S>[] = [{ id: 'region', header: 'Region' }, { id: 'qty', header: 'Qty', type: 'number', aggFunc: 'sum' }];
const MESSAGES = { locale: 'en', text: { ...EN.text, ...EN_GROUP.text } };

/** A server answered by the test: thenables, so answers land synchronously. */
function server() {
  const calls: { req: DataRequest; ok(v: unknown): void }[] = [];
  const data: DataSource<S> = {
    fetch: (req) => ({ then(ok: (v: never) => void) { calls.push({ req, ok: ok as never }); } }) as never, // never: a thenable stands for the promise
  };
  const rows = (c: (typeof calls)[number]) => {
    const { offset, size } = c.req.page!;
    c.ok({ rows: Array.from({ length: Math.min(size, 30 - offset) }, (_, j) => ({ id: `s${offset + j}`, region: 'Nord', qty: 1 })), total: 30 });
  };
  return { calls, data, rows };
}

@Component({
  selector: 't-host',
  imports: [DzGrid],
  template: `<dz-grid [source]="source" [columns]="columns" [getRowId]="id" [messages]="messages" [features]="features" [(groupBy)]="by" />`,
})
class Host {
  source: SourceBinding<S> | undefined;
  readonly columns = COLUMNS;
  readonly id = (s: S) => s.id;
  readonly messages = MESSAGES;
  features: GridFeature[] = [];
  readonly by = signal<readonly string[] | undefined>(undefined);
}

function mount(source: SourceBinding<S>, features: GridFeature[] = [], by?: readonly string[]) {
  TestBed.configureTestingModule({ providers: [fakeEnv().provider] });
  const fixture = TestBed.createComponent(Host);
  const host = fixture.componentInstance;
  host.source = source;
  host.features = features;
  host.by.set(by);
  document.body.appendChild(fixture.nativeElement);
  fixture.detectChanges();
  const ctl = fixture.debugElement.children[0]!.injector.get(DzgController) as DzgController<S>;
  return { fixture, host, ctl, run: () => fixture.detectChanges() };
}

describe('DzgController on a list loaded in blocks (Q-NG A)', () => {
  it('refresh() paints only; refresh({}) asks the window again, rows kept; refresh({ purge: true }) starts over from block 0', () => {
    const s = server();
    const t = mount(infiniteRows(s.data, { blockSize: 10 }));
    for (const c of s.calls.slice()) s.rows(c);
    const n = s.calls.length;
    t.ctl.refresh();
    expect(s.calls).toHaveLength(n);
    t.ctl.refresh({});
    expect(s.calls.length).toBeGreaterThan(n);
    const d = t.ctl.kernel()!.rows.displayed;
    expect(d.nodeAt(d.index(0)!).kind).toBe('data');
    for (const c of s.calls.slice(n)) s.rows(c);
    const m = s.calls.length;
    t.ctl.refresh({ purge: true });
    expect(s.calls.slice(m).map((c) => c.req.page!.index)).toEqual([0]);
    // Every row let go.
    expect(t.ctl.kernel()!.rows.row(dataKey('s1')!)).toBeUndefined();
  });

  it('applyTransaction updates a row held; applyTransactionAsync gathers, done per transaction; null without a grid', async () => {
    const s = server();
    const t = mount(infiniteRows(s.data, { blockSize: 10, batchMs: 5 }));
    for (const c of s.calls.slice()) s.rows(c);
    const r = t.ctl.applyTransaction({ patch: [{ id: 's1', set: { qty: 9 } }] });
    expect(r?.updated).toEqual([dataKey('s1')]);
    expect((t.ctl.kernel()!.rows.row(dataKey('s1')!)!.data as S).qty).toBe(9);
    const done: TransactionResult[] = [];
    t.ctl.applyTransactionAsync({ patch: [{ id: 's2', set: { qty: 7 } }] }, (x) => done.push(x));
    t.ctl.applyTransactionAsync({ patch: [{ id: 's3', set: { qty: 8 } }] }, (x) => done.push(x));
    expect(done).toEqual([]);
    await new Promise((ok) => setTimeout(ok, 30));
    expect(done.map((x) => x.updated)).toEqual([[dataKey('s2')], [dataKey('s3')]]);
    t.fixture.destroy();
    expect(t.ctl.applyTransaction({ patch: [{ id: 's1', set: { qty: 1 } }] })).toBeNull();
  });

  it('a client grid: applyTransaction reaches its rows; applyTransactionAsync applies and calls done', () => {
    TestBed.configureTestingModule({ providers: [fakeEnv().provider] });
    @Component({ selector: 't-client', imports: [DzGrid], template: `<dz-grid [rows]="rows" [columns]="columns" [getRowId]="id" [messages]="messages" />` })
    class Client {
      readonly rows: S[] = [{ id: 'a', region: 'Nord', qty: 1 }];
      readonly columns = COLUMNS;
      readonly id = (s: S) => s.id;
      readonly messages = MESSAGES;
    }
    const fixture = TestBed.createComponent(Client);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const ctl = fixture.debugElement.children[0]!.injector.get(DzgController) as DzgController<S>;
    expect(ctl.applyTransaction({ add: [{ id: 'b', region: 'Sud', qty: 2 }] })?.added).toEqual([dataKey('b')]);
    const done: string[] = [];
    ctl.applyTransactionAsync({ remove: ['a'] }, (x) => done.push(x.kind));
    expect(done).toEqual(['delta']);
  });
});

describe('[(groupBy)] on a server-side source', () => {
  it('the host\'s value is the server\'s grouping: one grouped request; a user\'s regroup comes back and asks again', () => {
    const s = server();
    const g = grouping({ by: ['region'] });
    const t = mount(serverSideRows(s.data, { blockSize: 10 }), [g], ['qty']);
    t.run();
    expect(s.calls.at(-1)!.req.group).toMatchObject({ by: ['qty'], path: [] });
    expect(s.calls.filter((c) => c.req.group)).toHaveLength(s.calls.length);
    const n = s.calls.length;
    t.ctl.grouping()!.setBy(['region'], { user: true });
    t.run();
    expect(t.host.by()).toEqual(['region']);
    expect(s.calls.slice(n).map((c) => c.req.group!.by)).toEqual([['region']]);
    t.host.by.set([]);
    t.run();
    expect(s.calls.at(-1)!.req.group).toBeUndefined();
  });
});
