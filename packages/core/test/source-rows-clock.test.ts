import { describe, it, expect } from 'vitest';
import { createColumnModel, createKernel, localeCtx, makeQuery, parseInstant, type FilterModel, type ModelChange, type ModelEnv } from '@dzgrid/core';
import { sourceRows, type DataSource } from '@dzgrid/core/server';
import { fakeSource, rowsOf } from './support/fake-source.js';

/** docs/behaviors/filter-relative.md: a server model at midnight. */
type R = { id: string; name: string; t?: string };
const at = (s: string) => parseInstant(s)!;
const TODAY: FilterModel = { t: { type: 'instant', op: 'relative', range: 'today' } };
const ALGIERS = localeCtx({ locale: 'fr-FR', timeZone: 'Africa/Algiers' });

function setup(o: { now?: number | null; env?: Partial<ModelEnv<R>> } = {}) {
  const fake = fakeSource();
  const clock = { t: o.now === undefined ? at('2026-10-19T12:00:00Z') : o.now };
  const columns = createColumnModel<R>([{ id: 'name' }, { id: 't', type: 'instant' }]);
  const model = sourceRows<R>(fake.source as DataSource<R>).create({
    getRowId: (r) => r.id,
    columns,
    ctx: ALGIERS,
    abort: fake.abort,
    ...(clock.t !== null && { now: () => clock.t! }),
    ...o.env,
  });
  const changes: ModelChange<R>[] = [];
  model.subscribe((c) => changes.push(c));
  const last = () => fake.calls.at(-1)!;
  const resolved = () => (last().req.filter as any)?.t?.resolved;
  return { ...fake, model, clock, changes, last, resolved, columns };
}

describe('a server model at midnight', () => {
  it('asks once when the day changes, never at 23:59:59, never twice', () => {
    const s = setup();
    s.model.setQuery(makeQuery({ filter: TODAY }));
    expect(s.resolved()).toEqual({ from: '2026-10-18T23:00:00.000Z', to: '2026-10-19T23:00:00.000Z' });
    expect((s.last().req.filter as any).t.relative).toBe('today');
    s.last().resolve({ rows: rowsOf(['a']) });
    const n = s.calls.length;
    s.changes.length = 0;

    s.clock.t = at('2026-10-19T22:59:59.999Z');
    s.model.tick();
    expect(s.calls.length).toBe(n);
    expect(s.changes).toEqual([]);

    s.clock.t = at('2026-10-19T23:00:00Z');
    s.model.tick();
    expect(s.calls.length).toBe(n + 1);
    expect(s.resolved()).toEqual({ from: '2026-10-19T23:00:00.000Z', to: '2026-10-20T23:00:00.000Z' });
    // A new epoch: back to the first page, said as a query change.
    expect(s.changes.map((c) => c.kind)).toEqual(['query']);
    expect(s.last().req.page?.index).toBe(0);

    s.model.tick();
    expect(s.calls.length).toBe(n + 1);
  });

  it('asks nothing at midnight without a shortcut', () => {
    const s = setup();
    s.model.setQuery(makeQuery({ filter: { t: { type: 'instant', op: 'onDay', day: '2026-10-19' }, name: { type: 'text', op: 'contains', value: 'a' } } }));
    const n = s.calls.length;
    s.clock.t = at('2026-10-21T00:00:00Z');
    s.model.tick();
    expect(s.calls.length).toBe(n);
  });

  it('a zone change asks in the new zone; the clock going back asks for the day before', () => {
    const s = setup({ now: at('2026-10-20T08:00:00Z') });
    s.model.setQuery(makeQuery({ filter: TODAY }));
    expect(s.resolved()).toEqual({ from: '2026-10-19T23:00:00.000Z', to: '2026-10-20T23:00:00.000Z' });
    s.model.setContext(localeCtx({ locale: 'fr-FR', timeZone: 'Asia/Tokyo' }));
    expect(s.resolved()).toEqual({ from: '2026-10-19T15:00:00.000Z', to: '2026-10-20T15:00:00.000Z' });
    expect((s.last().req.filter as any).t.zone).toBe('Asia/Tokyo');
    const n = s.calls.length;
    s.clock.t = at('2026-10-19T08:00:00Z');
    s.model.tick();
    expect(s.calls.length).toBe(n + 1);
    expect(s.resolved()).toEqual({ from: '2026-10-18T15:00:00.000Z', to: '2026-10-19T15:00:00.000Z' });
  });

  it('without a clock the shortcut is dropped from the request, with its problem', () => {
    const s = setup({ now: null });
    s.model.setQuery(makeQuery({ filter: TODAY }));
    expect(s.last().req.filter).toEqual({});
    expect(s.model.problems.map((p) => [p.code, p.path, p.detail])).toEqual([['invalid-filter', 'filter.t', 'no clock']]);
  });

  it('a fetched set filters its rows in the browser, by the same clock: midnight re-filters, asks nothing', () => {
    const s = setup({ env: { operations: { page: 'off', quick: 'server' } } });
    s.last().resolve({ rows: [
      { id: 'a', name: 'a', t: '2026-10-19T10:00:00Z' },
      { id: 'b', name: 'b', t: '2026-10-20T10:00:00Z' },
    ] });
    s.model.setQuery(makeQuery({ filter: TODAY }));
    const ids = () => Array.from({ length: s.model.displayed.count }, (_, i) => String(s.model.displayed.nodeAt(s.model.displayed.index(i)!).id));
    expect(ids()).toEqual(['a']);
    const n = s.calls.length;
    s.clock.t = at('2026-10-20T00:00:00Z');
    s.model.tick();
    expect(ids()).toEqual(['b']);
    expect(s.calls.length).toBe(n);
  });

  it('kernel.tick() forwards to a server model', () => {
    const s = setup();
    const kernel = createKernel<R>({ rows: s.model, columns: s.columns });
    kernel.dispatch({ type: 'filter.set', filter: TODAY }, 'user');
    const n = s.calls.length;
    s.clock.t = at('2026-10-20T00:00:00Z');
    kernel.tick();
    expect(s.calls.length).toBe(n + 1);
  });
});
