// A server's answer compared by value (row-identity-transactions.md « Rows compared by value », step 16e): a refresh
// of the same page is a live change, not a reset. Expectations by hand.
import { describe, it, expect } from 'vitest';
import { createColumnModel, dataKey, localeCtx, type ModelChange } from '@dzgrid/core';
import { sourceRows, type DataSource } from '@dzgrid/core/server';
import { sameValues } from '@dzgrid/core/compare';
import { fakeSource } from './support/fake-source.js';

type R = { id: string; name: string };
const page = (ids: string[]): R[] => ids.map((id) => ({ id, name: `n${id}` }));
const k = (id: string) => dataKey(id)!;

function setup(same?: (a: R, b: R) => boolean) {
  const fake = fakeSource();
  const columns = createColumnModel<R>([{ id: 'name' }]);
  const model = sourceRows<R>(fake.source as DataSource<R>).create({ getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'en-US' }), operations: 'server', page: { pageSize: 10 }, ...(same && { sameRow: same }) });
  const changes: ModelChange<R>[] = [];
  model.subscribe((c) => changes.push(c));
  return { fake, model, changes };
}
const TEN = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];

describe('sourceRows with sameRow', () => {
  it('a refresh of the same page, 2 new rows on top and 2 gone at the bottom: a delta adding 2, removing 2', () => {
    const t = setup(sameValues);
    t.fake.calls.at(-1)!.resolve({ rows: page(TEN), total: 10 });
    const before = t.model.row(k('3'))!.data;
    t.model.invalidate();
    t.fake.calls.at(-1)!.resolve({ rows: page(['a', 'b', ...TEN.slice(0, 8)]), total: 10 });
    const tx = t.changes.at(-1)!.transaction!;
    expect(tx.kind).toBe('delta');
    expect(tx.added).toEqual([k('a'), k('b')]);
    expect(tx.removed).toEqual([k('9'), k('10')]);
    expect(tx.updated).toEqual([]);
    // The equal row kept its object.
    expect(t.model.row(k('3'))!.data).toBe(before);
  });

  it('without sameRow, the same refresh is a reset (as before)', () => {
    const t = setup();
    t.fake.calls.at(-1)!.resolve({ rows: page(TEN), total: 10 });
    t.model.invalidate();
    t.fake.calls.at(-1)!.resolve({ rows: page(['a', 'b', ...TEN.slice(0, 8)]), total: 10 });
    expect(t.changes.at(-1)!.transaction!.kind).toBe('reset');
  });
});
