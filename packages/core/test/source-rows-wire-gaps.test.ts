import { describe, it, expect } from 'vitest';
import { createColumnModel, localeCtx, makeQuery, type ColumnDef, type FilterModel } from '@dzgrid/core';
import { sourceRows, type DataSource, type WireKind } from '@dzgrid/core/server';
import { fakeSource, rowsOf } from './support/fake-source.js';

/** Gaps in source-rows-wire.test.ts: change events for problems the key does not see, key stability, refetch counts. */
type R = { id: string; name: string; t?: string; n?: number };

function setup(defs: ColumnDef<R>[], o: { kinds?: Record<string, WireKind>; zone?: string } = {}) {
  const fake = fakeSource();
  const columns = createColumnModel<R>(defs);
  const model = sourceRows<R>(fake.source as DataSource<R>).create({
    getRowId: (r) => r.id,
    columns,
    ctx: localeCtx({ locale: 'en-US', timeZone: o.zone ?? 'Africa/Algiers' }),
    abort: fake.abort,
    operations: 'server',
    page: { pageSize: 2 },
    ...(o.kinds && { filterKinds: (name: string) => o.kinds![name] }),
  });
  const changes: { kind: string; problems: [string, string][] }[] = [];
  model.subscribe((c) => changes.push({ kind: c.kind, problems: c.problems.map((p) => [p.code, p.path]) }));
  return { ...fake, model, columns, changes };
}
const q = (filter: Record<string, unknown>) => makeQuery({ filter: filter as FilterModel });
const codes = (m: { problems: readonly { code: string; path: string }[] }) => m.problems.map((p) => [p.code, p.path]);

describe('sourceRows: a refused edit that leaves the key says its problem to subscribers', () => {
  it('adding a refused filter next to a live one: no request, but a change carrying the problem', () => {
    const s = setup([{ id: 'name' }, { id: 'n', type: 'number' }]);
    s.model.setQuery(q({ name: { type: 'text', op: 'contains', value: 'a' } }));
    s.last().resolve({ rows: rowsOf(['a']), total: 1 });
    const before = s.changes.length;
    s.model.setQuery(q({ name: { type: 'text', op: 'contains', value: 'a' }, n: { type: 'number', op: 'gt', value: Number.NaN } }));
    expect(s.calls.length).toBe(2);
    expect(codes(s.model)).toEqual([['invalid-filter', 'filter.n.value']]);
    // The getter knows; a subscriber (the UI showing problems) must be told too.
    expect(s.changes.length).toBeGreaterThan(before);
    expect(s.changes.at(-1)!.problems).toEqual([['invalid-filter', 'filter.n.value']]);
  });

  it('fixing a refused edit back to half-typed clears the problem for subscribers', () => {
    const s = setup([{ id: 'name' }, { id: 'n', type: 'number' }]);
    s.model.setQuery(q({ n: { type: 'number', op: 'gt', value: Number.NaN } }));
    s.last().resolve({ rows: rowsOf(['a']), total: 1 });
    expect(codes(s.model)).toEqual([['invalid-filter', 'filter.n.value']]);
    // The problem arrived with no request (the wire form {} equals the empty query's): was it said?
    expect(s.changes.some((c) => c.problems.length > 0)).toBe(true);
    const before = s.changes.length;
    s.model.setQuery(q({ n: { type: 'number', op: 'gt' } }));
    // Refused then half-typed: the wire form stayed {} from the start, so only the first request.
    expect(s.calls.length).toBe(1);
    expect(codes(s.model)).toEqual([]);
    expect(s.changes.length).toBeGreaterThan(before);
    expect(s.changes.at(-1)!.problems).toEqual([]);
  });

  it('a column change that only changes why a filter is refused is said too', () => {
    const s = setup([{ id: 'name' }, { id: 'n', type: 'number' }]);
    s.model.setQuery(q({ n: { type: 'number', op: 'gt', value: Number.NaN } }));
    s.last().resolve({ rows: rowsOf(['a']), total: 1 });
    const before = s.changes.length;
    s.columns.setDefs([{ id: 'name' }]);
    s.model.setColumns(s.columns);
    expect(codes(s.model)).toEqual([['unknown-column', 'filter.n']]);
    expect(s.changes.length).toBeGreaterThan(before);
    expect(s.changes.at(-1)!.problems).toEqual([['unknown-column', 'filter.n']]);
  });
});

describe('sourceRows: the key is the wire form, not the model', () => {
  it('the same filter written another way (key order, caseSensitive: false, extra fields) asks nothing', () => {
    const s = setup([{ id: 'name' }, { id: 't', type: 'instant' }]);
    s.model.setQuery(q({ name: { type: 'text', op: 'contains', value: 'a' } }));
    expect(s.calls.length).toBe(2);
    s.model.setQuery(q({ name: { value: 'a', caseSensitive: false, op: 'contains', type: 'text', note: 'x' } }));
    s.model.setQuery(q({ name: { type: 'combined', join: 'and', conditions: [] }, n: undefined } as never));
    expect(s.calls.length).toBe(3);
    // An onDay with a stray moment: the moment is not read, not sent, no request.
    s.model.setQuery(q({ t: { type: 'instant', op: 'onDay', day: '2026-03-29' } }));
    const n = s.calls.length;
    s.model.setQuery(q({ t: { type: 'instant', op: 'onDay', day: '2026-03-29', at: 5 } }));
    expect(s.calls.length).toBe(n);
  });

  it('repainting (setColumns, setContext with equal values, setQuery with an equal query) asks nothing and does not rerun a kind', () => {
    let wires = 0;
    const kinds: Record<string, WireKind> = { k: { read: (x) => x, active: () => true, wire: (x) => (wires++, x) } };
    const s = setup([{ id: 'name' }], { kinds });
    s.model.setQuery(q({ name: { type: 'custom', kind: 'k', state: 1 } }));
    expect([s.calls.length, wires]).toEqual([2, 1]);
    for (let i = 0; i < 3; i++) {
      s.model.setColumns(s.columns);
      s.model.setQuery(q({ name: { type: 'custom', kind: 'k', state: 1 } }));
      s.model.setContext(localeCtx({ locale: 'en-US', timeZone: 'Africa/Algiers' }));
    }
    expect(s.calls.length).toBe(2);
    // Recomputed per query edit and context (documented: once per query, zone or columns); never a request.
    expect(wires).toBeLessThanOrEqual(1 + 3 * 2);
  });

  it('a kind whose wire form reads the language asks again on a language change, and only then', () => {
    const kinds: Record<string, WireKind> = { l: { read: (x) => x, active: () => true, wire: (x, ctx) => `${String(x)}:${ctx.locale}` } };
    const s = setup([{ id: 'name' }], { kinds });
    s.model.setQuery(q({ name: { type: 'custom', kind: 'l', state: 'v' } }));
    expect(s.calls.length).toBe(2);
    s.model.setContext(localeCtx({ locale: 'fr-FR', timeZone: 'Africa/Algiers' }));
    expect(s.calls.length).toBe(3);
    expect(s.last().req.filter).toEqual({ name: { type: 'custom', kind: 'l', value: 'v:fr-FR' } });
    s.model.setContext(localeCtx({ locale: 'fr-FR', timeZone: 'Africa/Algiers' }));
    expect(s.calls.length).toBe(3);
  });

  it('a zone change that leaves every resolved bound in place still asks (the zone is in the key)', () => {
    const s = setup([{ id: 'name' }, { id: 't', type: 'instant' }], { zone: 'UTC' });
    s.model.setQuery(q({ t: { type: 'instant', op: 'before', at: '2026-03-05T10:00:00Z' } }));
    expect(s.calls.length).toBe(2);
    s.model.setContext(localeCtx({ locale: 'en-US', timeZone: 'Etc/UTC' }));
    expect(s.calls.length).toBe(3);
    expect(s.last().req.filter).toEqual({ t: { type: 'instant', op: 'before', at: '2026-03-05T10:00:00Z', resolved: { from: null, to: '2026-03-05T10:00:00.000Z' }, zone: 'Etc/UTC' } });
  });

  it('pages of one epoch keep the request filter identical; a new epoch starts at page 0', () => {
    const s = setup([{ id: 'name' }, { id: 't', type: 'instant' }]);
    s.model.setQuery(q({ t: { type: 'instant', op: 'onDay', day: '2026-03-29' } }));
    s.last().resolve({ rows: rowsOf(['a', 'b']), total: 6 });
    s.model.setPage({ index: 2 });
    expect(s.last().req.page?.index).toBe(2);
    expect(s.last().req.filter).toEqual(s.calls[1]!.req.filter);
    s.last().resolve({ rows: rowsOf(['e', 'f']), total: 6 });
    // A half-typed edit elsewhere: the page stays, nothing asked.
    s.model.setQuery(q({ t: { type: 'instant', op: 'onDay', day: '2026-03-29' }, name: { type: 'text', op: 'contains', value: '' } }));
    expect(s.calls.length).toBe(3);
    expect(s.model.page!.index).toBe(2);
    s.model.setContext(localeCtx({ locale: 'en-US', timeZone: 'Europe/Paris' }));
    expect(s.calls.length).toBe(4);
    expect(s.last().req.page?.index).toBe(0);
  });
});
