// Phase 11 L2, R4 (docs/phase-11-plan.md): the base's column cache knows a column by its definition, not by the
// resolved object a column change makes anew — new column definitions that keep a column's own do not read its
// cells again (a pivot setting its created columns). Expectations by hand.
import { describe, it, expect } from 'vitest';
import { clientRows, createColumnModel, createKernel, localeCtx, type ColumnDef } from '@dzgrid/core';

type Row = { id: string; n: number };
const ROWS: Row[] = [
  { id: 'r1', n: 3 },
  { id: 'r2', n: 1 },
  { id: 'r3', n: 2 },
];
const ctx = localeCtx({ locale: 'en-US', timeZone: 'UTC' });

describe('the column cache keys on the definition', () => {
  it('new definitions keeping the sorted column: its cells are not read again', () => {
    let reads = 0;
    const N: ColumnDef<Row> = { id: 'n', type: 'number', value: (r) => (reads++, r.n) };
    const columns = createColumnModel<Row>([N]);
    const model = clientRows<Row>({ rows: ROWS, getRowId: (r) => r.id, columns, ctx });
    const kernel = createKernel<Row>({ rows: model, columns });
    kernel.dispatch({ type: 'sort.set', sort: [{ column: 'n', dir: 'asc' }] }, 'user');
    const order = () => Array.from({ length: model.displayed.count }, (_, i) => String(model.displayed.keyAt(model.displayed.index(i)!)).split(':').pop());
    expect(order()).toEqual(['r2', 'r3', 'r1']);
    const first = reads;
    expect(first).toBe(3);
    kernel.dispatch({ type: 'columns.set', defs: [N, { id: 'extra', value: () => null }] }, 'host');
    kernel.dispatch({ type: 'sort.set', sort: [{ column: 'n', dir: 'desc' }] }, 'user');
    expect(order()).toEqual(['r1', 'r3', 'r2']);
    expect(reads).toBe(first);
  });

  it('a new definition of the column: read again', () => {
    let reads = 0;
    const N: ColumnDef<Row> = { id: 'n', type: 'number', value: (r) => (reads++, r.n) };
    const columns = createColumnModel<Row>([N]);
    const model = clientRows<Row>({ rows: ROWS, getRowId: (r) => r.id, columns, ctx });
    const kernel = createKernel<Row>({ rows: model, columns });
    kernel.dispatch({ type: 'sort.set', sort: [{ column: 'n', dir: 'asc' }] }, 'user');
    expect(reads).toBe(3);
    const M: ColumnDef<Row> = { ...N, value: (r) => (reads++, -r.n) };
    kernel.dispatch({ type: 'columns.set', defs: [M] }, 'host');
    kernel.dispatch({ type: 'sort.set', sort: [{ column: 'n', dir: 'desc' }] }, 'user');
    expect(reads).toBe(6);
  });
});
