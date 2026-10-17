import { describe, it, expect } from 'vitest';
import { clientRows, createColumnModel, createKernel, dataKey, liveChangeProblems, localeCtx, partNameFor, type GridEvent, type RowModel } from '@dzgrid/core';

type R = { id: string; n: number; t: string };
const k = (id: string) => dataKey(id)!;

describe('columns.set over a model that does not recompute for columns (a server)', () => {
  it('still moves the focus off a dropped column', () => {
    const columns = createColumnModel<R>([{ id: 'n', type: 'number' }, { id: 't' }]);
    const m = clientRows<R>({ rows: [{ id: 'r1', n: 1, t: 'a' }], getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'en-US' }) });
    const model: RowModel<R> = {
      kind: 'source',
      get ops() { return { filter: 'server', quick: 'server', sort: 'server', page: 'server' } as const; },
      get displayed() { return m.displayed; },
      get status() { return m.status; },
      get counts() { return { total: 1, filtered: 1, displayed: 1 }; },
      selectAll: 'query',
      keeps: () => true,
      row: (key) => m.row(key),
      setQuery: (q, s) => m.setQuery(q, s),
      setColumns: () => {},
      setContext: (c, s) => m.setContext(c, s),
      invalidate: () => {},
      subscribe: (fn) => m.subscribe(fn),
      destroy: () => m.destroy(),
    };
    const kernel = createKernel<R>({ rows: model, columns });
    kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: k('r1'), column: 't' } }, 'user');
    const events: GridEvent<R>[] = [];
    kernel.subscribe((e) => events.push(e));
    kernel.dispatch({ type: 'columns.set', defs: [{ id: 'n', type: 'number' }] }, 'host');
    expect(kernel.focus).toEqual({ kind: 'cell', row: k('r1'), column: 'n' });
    expect(events.some((e) => e.type === 'focusChanged')).toBe(true);
  });
});

describe('part names, the other slots', () => {
  const none = new Set<string>();
  it('takes a header’s and a tooltip’s own part name, and says an unknown one', () => {
    const col = { id: 'a', type: 'text' as const, ui: { header: 'fancyHeader', tooltip: 'richTip' } };
    expect(partNameFor('header', col, new Set(['fancyHeader'])).name).toBe('fancyHeader');
    expect(partNameFor('tooltip', col, new Set(['richTip'])).name).toBe('richTip');
    expect(partNameFor('header', col, none).problems.map((p) => p.path)).toEqual(['columns.a.ui.header']);
  });

  it('picks a filter by the kind the column names, before its type', () => {
    const col = { id: 'd', type: 'day' as const, filter: { kind: 'range' } };
    expect(partNameFor('filter', col, new Set(['filter.range', 'filter.day'])).name).toBe('filter.range');
  });

  it('picks the floating filter of an enum as a set, like the filter', () => {
    expect(partNameFor('floating', { id: 'e', type: 'enum' }, new Set(['floating.set', 'floating.enum'])).name).toBe('floating.set');
  });
});

describe('live changes of settings outside the policy', () => {
  it('does not refuse a setting the policy does not name', () => {
    expect(liveChangeProblems({ a: 'fixed' }, { a: 1 }, { future: 2 })).toEqual([]);
  });
});
