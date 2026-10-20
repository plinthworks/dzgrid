// Defects the audit screen's permutations found (step 18, docs/behaviors/audit-screen.md, I3:
// one settled sentence per action, never a count of rows about to go, none when unknown).
// Each test failed before its fix.
import { describe, it, expect, afterEach } from 'vitest';
import { sourceRows } from '@dzgrid/core/server';
import { cleanup, pmake, type R } from './support-pagination.js';

afterEach(cleanup);

const sortBy = (t: ReturnType<typeof pmake>, col: string) => t.click(t.host.querySelector<HTMLElement>(`.dzg-hcell[role=columnheader][data-col="${col}"] .dzg-hlabel`));

describe('the sort sentence on a server waits for the answer (sort.ts, request-order.md)', () => {
  it('nothing said at the click; after the answer, the order alone when the count is unknown', () => {
    const t = pmake({ mode: 'offset' });
    t.answer(10, { hasNext: true });
    const n = t.said().length;
    sortBy(t, 'name');
    expect(t.said().slice(n)).toEqual([]);
    t.answer(10, { hasNext: true });
    expect(t.said().slice(n)).toEqual(['Sorted by Name, ascending.']);
  });

  it('with a total: the count of the answer (all the rows), not the page shown', () => {
    const t = pmake({ mode: 'offset' });
    t.answer(10, { total: 42 });
    const n = t.said().length;
    sortBy(t, 'name');
    t.answer(10, { total: 42 });
    expect(t.said().slice(n)).toEqual(['Sorted by Name, ascending. 42 rows']);
  });

  it('a newer change before the answer: only the last sort is said, once; a failure says no sort', () => {
    const t = pmake({ mode: 'offset' });
    t.answer(10, { total: 42 });
    const n = t.said().length;
    sortBy(t, 'name');
    sortBy(t, 'name');
    t.answer(10, { total: 42 });
    expect(t.said().slice(n)).toEqual(['Sorted by Name, descending. 42 rows']);
    const m = t.said().length;
    sortBy(t, 'n');
    t.f.calls.at(-1)!.err(new Error('down'));
    expect(t.said().slice(m)).toEqual(['Loading failed']);
  });

  it('paged in the browser: the rows the sort orders (all of them), at once', () => {
    const t = pmake({ mode: 'client', pageSize: 10 });
    const n = t.said().length;
    sortBy(t, 'n');
    expect(t.said().slice(n)).toEqual(['Sorted by N, ascending. 30 rows']);
  });

  it('a source that answers at once (no loading): said at once, with its count', () => {
    const rows: R[] = Array.from({ length: 12 }, (_, i) => ({ id: `r${i}`, name: `x${i}`, n: i }));
    const t = pmake({ mode: 'offset', settings: { source: sourceRows<R>({ fetch: (req) => ({ rows: rows.slice(req.page!.offset, req.page!.offset + req.page!.size), total: 12 }) }) } });
    const n = t.said().length;
    sortBy(t, 'n');
    expect(t.said().slice(n)).toEqual(['Sorted by N, ascending. 12 rows']);
  });
});
