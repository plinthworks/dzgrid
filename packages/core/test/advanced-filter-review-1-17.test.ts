// 1.17.0 independent review of the advanced filter (docs/behaviors/advanced-filter.md): a shortcut (« today ») inside
// the expression reads the clock as a column's does (filter-relative.md) — a server asks again at midnight, the grid's
// midnight timer is armed. Expectations written by hand.
import { describe, it, expect } from 'vitest';
import { createColumnModel, localeCtx, makeQuery, parseInstant, type FilterModel } from '@dzgrid/core';
import { hasRelative } from '@dzgrid/core/internal';
import { sourceRows, type DataSource } from '@dzgrid/core/server';
import { fakeSource, rowsOf } from './support/fake-source.js';

type R = { id: string; name: string; t?: string };
const at = (s: string) => parseInstant(s)!;
const ALGIERS = localeCtx({ locale: 'fr-FR', timeZone: 'Africa/Algiers' });
/** `name contains a OR t is today`, the shortcut nested in a group. */
const ADV: FilterModel = {
  '': { type: 'advanced', expression: { join: 'or', items: [{ column: 'name', filter: { type: 'text', op: 'contains', value: 'a' } }, { join: 'and', items: [{ column: 't', filter: { type: 'instant', op: 'relative', range: 'today' } }] }] } },
};

describe('a shortcut inside the advanced filter (advanced-filter.md 4, filter-relative.md)', () => {
  it('is a shortcut: the grid arms its midnight timer', () => {
    expect(hasRelative(ADV)).toBe(true);
    expect(hasRelative({ '': { type: 'advanced', expression: { column: 'name', filter: { type: 'text', op: 'equals', value: 'relative' } } } })).toBe(false);
  });

  it("a server is sent today's range, and asked again when the day changes", () => {
    const fake = fakeSource();
    const clock = { t: at('2026-10-19T12:00:00Z') };
    const columns = createColumnModel<R>([{ id: 'name' }, { id: 't', type: 'instant' }]);
    const model = sourceRows<R>(fake.source as DataSource<R>).create({ getRowId: (r) => r.id, columns, ctx: ALGIERS, abort: fake.abort, now: () => clock.t });
    model.setQuery(makeQuery({ filter: ADV }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const today = () => (fake.calls.at(-1)!.req.filter as any)?.['']?.expression?.items?.[1]?.items?.[0]?.filter?.resolved; // the wire's nested shape, read loosely
    expect(today()).toEqual({ from: '2026-10-18T23:00:00.000Z', to: '2026-10-19T23:00:00.000Z' });
    fake.calls.at(-1)!.resolve({ rows: rowsOf(['a']) });
    const n = fake.calls.length;
    clock.t = at('2026-10-19T23:00:00Z');
    model.tick();
    expect(fake.calls.length).toBe(n + 1);
    expect(today()).toEqual({ from: '2026-10-19T23:00:00.000Z', to: '2026-10-20T23:00:00.000Z' });
  });
});
