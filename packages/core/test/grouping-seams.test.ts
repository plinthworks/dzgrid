// Phase 10 step 2 (docs/phase-10-plan.md fact 5, risk « the double build »): the grouping keys its structure on the
// columns it uses, not on any column change, so a pivot that adds its created columns after a build does not group a
// second time. Expectations by hand.
import { describe, it, expect } from 'vitest';
import { clientRows, createColumnModel, createKernel, localeCtx, makeQuery, type ColumnDef, type ColumnOrGroup } from '@dzgrid/core';
import { groupShape, type GroupedRows } from '@dzgrid/core/grouping';

type Row = { id: string; g: string; h: number; v: number };
const ROWS: Row[] = [
  { id: 'r1', g: 'Nord', h: 1, v: 10 },
  { id: 'r2', g: 'Sud', h: 2, v: 5 },
  { id: 'r3', g: 'Nord', h: 2, v: 2.5 },
];
const G: ColumnDef<Row> = { id: 'g' };
const H: ColumnDef<Row> = { id: 'h', type: 'number' };
const V: ColumnDef<Row> = { id: 'v', type: 'number', aggFunc: 'sum' };
const ctx = localeCtx({ locale: 'en-US', timeZone: 'UTC' });

function setup(defs: ColumnOrGroup<Row>[] = [G, H, V]) {
  const columns = createColumnModel<Row>(defs);
  const shape = groupShape<Row>({ by: ['g'] });
  const model = clientRows<Row>({ rows: ROWS, getRowId: (r) => r.id, columns, ctx, shape });
  const kernel = createKernel<Row>({ rows: model, columns });
  const totals = () => {
    const d = model.displayed as GroupedRows<Row>;
    return Array.from({ length: d.count }, (_, i) => {
      const n = d.nodeAt(d.index(i)!);
      return n.kind === 'group' ? `${n.label} ${JSON.stringify(n.aggs)}` : n.kind;
    });
  };
  return { columns, shape, model, kernel, totals };
}

describe('the grouping keys on the columns it uses', () => {
  it('a host column change that keeps the grouping columns does not group again', () => {
    const t = setup();
    expect(t.shape.diagnostics.builds).toBe(1);
    t.kernel.dispatch({ type: 'columns.set', defs: [G, H, V, { id: 'extra', value: () => null }] }, 'host');
    expect(t.columns.get('extra')).toBeDefined();
    expect(t.shape.diagnostics.builds).toBe(1);
    expect(t.totals()).toEqual(['Nord {"v":12.5}', 'Sud {"v":5}']);
  });

  it('nor under a filter, whose matches come back as a new list of the same rows', () => {
    const t = setup();
    t.kernel.dispatch({ type: 'query.set', query: makeQuery({ filter: { h: { type: 'number', op: 'lte', value: 2 } } }) }, 'user');
    const before = t.shape.diagnostics.builds;
    t.kernel.dispatch({ type: 'columns.set', defs: [G, H, V, { id: 'extra', value: () => null }] }, 'host');
    expect(t.shape.diagnostics.builds).toBe(before);
  });

  it('and the totals are kept: no totalled column changed, nothing is totalled again', () => {
    const t = setup();
    const aggs = t.shape.diagnostics.aggs;
    t.kernel.dispatch({ type: 'columns.set', defs: [G, H, V, { id: 'extra', value: () => null }] }, 'host');
    expect(t.shape.diagnostics.aggs).toBe(aggs);
  });

  it('a new definition of a grouping column groups again (its values may read otherwise)', () => {
    const t = setup();
    t.kernel.dispatch({ type: 'columns.set', defs: [{ id: 'g', value: (r) => (r as Row).g.toUpperCase() }, H, V] }, 'host');
    expect(t.shape.diagnostics.builds).toBe(2);
    expect(t.totals()).toEqual(['NORD {"v":12.5}', 'SUD {"v":5}']);
  });

  it('the totals follow the columns all the same: a column given a total is totalled at once', () => {
    const t = setup();
    t.kernel.dispatch({ type: 'columns.set', defs: [G, { ...H, aggFunc: 'max' }, V] }, 'host');
    expect(t.shape.diagnostics.builds).toBe(1);
    expect(t.totals()).toEqual(['Nord {"h":2,"v":12.5}', 'Sud {"h":2,"v":5}']);
  });

  it('another order of the same rows (a sort) still groups again', () => {
    const t = setup();
    t.kernel.dispatch({ type: 'query.set', query: makeQuery({ sort: [{ column: 'v', dir: 'asc' }] }) }, 'user');
    expect(t.shape.diagnostics.builds).toBe(2);
  });
});
