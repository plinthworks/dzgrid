import { describe, it, expect } from 'vitest';
import { clientRows, createColumnModel, createKernel, dataKey, localeCtx, type GridEvent } from '@dzgrid/core';
import { sourceRows, type DataSource } from '@dzgrid/core/server';
import { fakeSource } from './support/fake-source.js';

/** Step 7 regressions the suite left open (each passes on d692ad1). */
type R = { id: string; n: number; t: string };
const k = (id: string) => dataKey(id)!;
const UTC = localeCtx({ locale: 'en-US' });
const odd = { type: 'text', op: 'equals', value: 'odd' } as const;
const rows = (n: number) => Array.from({ length: n }, (_, i): R => ({ id: `r${i}`, n: i, t: i % 2 ? 'odd' : 'even' }));
type Sel = Extract<GridEvent<R>, { type: 'selectionChanged' }>;

function client(n = 12, page = 5) {
  const columns = createColumnModel<R>([{ id: 'n', type: 'number' }, { id: 't' }]);
  const model = clientRows<R>({ rows: rows(n), getRowId: (r) => r.id, columns, ctx: UTC, page: { pageSize: page } });
  const kernel = createKernel<R>({ rows: model, columns });
  const events: GridEvent<R>[] = [];
  kernel.subscribe((e) => events.push(e));
  return { model, kernel, sel: () => events.filter((e): e is Sel => e.type === 'selectionChanged') };
}

describe('server pages, "all" after the new query’s request failed', () => {
  it('does not tell the count of the query before', () => {
    const fake = fakeSource();
    const columns = createColumnModel<R>([{ id: 'n', type: 'number' }, { id: 't' }]);
    const model = sourceRows<R>(fake.source as DataSource<R>).create({ getRowId: (r) => r.id, columns, ctx: UTC, abort: fake.abort, operations: 'server', page: { pageSize: 50 } });
    const kernel = createKernel<R>({ rows: model, columns });
    const events: GridEvent<R>[] = [];
    kernel.subscribe((e) => events.push(e));
    fake.last().resolve({ rows: rows(12), total: 120 });
    kernel.dispatch({ type: 'filter.column', column: 't', filter: odd }, 'user');
    fake.last().reject(new Error('503'));
    kernel.dispatch({ type: 'selection.all' }, 'user');
    // 120 was the total without the filter; the filtered total is not known.
    expect(events.filter((e): e is Sel => e.type === 'selectionChanged').at(-1)!.count).not.toBe(120);
    expect(model.counts.filtered).not.toBe(120);
  });
});
