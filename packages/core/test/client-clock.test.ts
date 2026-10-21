import { describe, it, expect } from 'vitest';
import { clientRows, createColumnModel, createKernel, localeCtx, makeQuery, parseInstant, type FilterModel, type ModelChange } from '@dzgrid/core';

/** docs/behaviors/filter-relative.md: the client model's clock, its day and `tick()`. */
type R = { id: string; t: string; d: string; n: string };
const at = (s: string) => parseInstant(s)!;
const ROWS: R[] = [
  { id: 'a', t: '2026-10-18T23:00:00Z', d: '2026-10-19', n: 'x' }, // Algiers: 19th 00:00
  { id: 'b', t: '2026-10-19T22:59:59.999Z', d: '2026-10-19', n: 'y' }, // 19th 23:59:59.999
  { id: 'c', t: '2026-10-19T23:00:00Z', d: '2026-10-20', n: 'x' }, // 20th 00:00
  { id: 'd', t: '2026-10-20T12:00:00Z', d: '2026-10-13', n: 'x' },
];
const TODAY_T: FilterModel = { t: { type: 'instant', op: 'relative', range: 'today' } };
const TODAY_D: FilterModel = { d: { type: 'day', op: 'relative', range: 'today' } };

function setup(o: { now?: number | null; zone?: string } = {}) {
  const clock = { t: o.now === undefined ? at('2026-10-19T12:00:00Z') : o.now, reads: 0 };
  const columns = createColumnModel<R>([{ id: 't', type: 'instant' }, { id: 'd', type: 'day' }, { id: 'n' }]);
  const m = clientRows<R>({
    rows: ROWS,
    getRowId: (r) => r.id,
    columns,
    ctx: localeCtx({ locale: 'fr-FR', timeZone: o.zone ?? 'Africa/Algiers' }),
    ...(clock.t !== null && { now: () => (clock.reads++, clock.t!) }),
  });
  const changes: ModelChange<R>[] = [];
  m.subscribe((c) => changes.push(c));
  const ids = () => Array.from({ length: m.displayed.count }, (_, i) => String((m.displayed.nodeAt(m.displayed.index(i)!) as { id: unknown }).id));
  return { m, clock, changes, ids, columns };
}

describe('the client model and the clock', () => {
  it('keeps today in the grid zone, and moves to the next day at midnight there, once', () => {
    const s = setup();
    s.m.setQuery(makeQuery({ filter: TODAY_T }));
    expect(s.ids()).toEqual(['a', 'b']);
    const runs = s.m.diagnostics.filterRuns;
    s.changes.length = 0;

    s.clock.t = at('2026-10-19T22:59:59.999Z');
    s.m.tick();
    expect(s.m.diagnostics.filterRuns).toBe(runs);
    expect(s.changes).toEqual([]);

    s.clock.t = at('2026-10-19T23:00:00Z');
    s.m.tick();
    expect(s.m.diagnostics.filterRuns).toBe(runs + 1);
    expect(s.ids()).toEqual(['c', 'd']);
    expect(s.changes.map((c) => c.kind)).toEqual(['query']);

    // The same day again: nothing.
    s.clock.t = at('2026-10-20T10:00:00Z');
    s.m.tick();
    expect(s.m.diagnostics.filterRuns).toBe(runs + 1);
    expect(s.changes.length).toBe(1);
  });

  it('filters a Day column against today in the grid zone', () => {
    const s = setup({ now: at('2026-10-19T23:30:00Z') });
    s.m.setQuery(makeQuery({ filter: TODAY_D }));
    // 00:30 on the 20th in Algiers, 23:30 on the 19th in UTC.
    expect(s.ids()).toEqual(['c']);
    s.m.setContext(localeCtx({ locale: 'fr-FR', timeZone: 'UTC' }));
    expect(s.ids()).toEqual(['a', 'b']);
    s.m.setQuery(makeQuery({ filter: { d: { type: 'day', op: 'relative', range: 'last7Days' } } }));
    expect(s.ids()).toEqual(['a', 'b', 'd']);
  });

  it('does nothing at midnight when no shortcut is in force, and reads no clock for it', () => {
    const s = setup();
    s.m.setQuery(makeQuery({ filter: { n: { type: 'text', op: 'equals', value: 'x' }, t: { type: 'instant', op: 'onDay', day: '2026-10-19' } } }));
    const runs = s.m.diagnostics.filterRuns;
    s.changes.length = 0;
    s.clock.t = at('2026-10-21T00:00:00Z');
    s.m.tick();
    expect(s.m.diagnostics.filterRuns).toBe(runs);
    expect(s.changes).toEqual([]);
    expect(s.clock.reads).toBe(0);
  });

  it('a sort change under a shortcut does not filter again', () => {
    const s = setup();
    s.m.setQuery(makeQuery({ filter: TODAY_T }));
    const runs = s.m.diagnostics.filterRuns;
    s.m.setQuery(makeQuery({ filter: TODAY_T, sort: [{ column: 'n', dir: 'desc' }] }));
    expect(s.m.diagnostics.filterRuns).toBe(runs);
    expect(s.ids()).toEqual(['b', 'a']);
  });

  it('follows a zone change: the day is read again in the new zone', () => {
    const s = setup({ now: at('2026-10-19T23:30:00Z') });
    s.m.setQuery(makeQuery({ filter: TODAY_T }));
    // The 20th in Algiers: 23:00Z on the 19th to 23:00Z on the 20th.
    expect(s.ids()).toEqual(['c', 'd']);
    s.m.setContext(localeCtx({ locale: 'fr-FR', timeZone: 'UTC' }));
    // The 19th in UTC: 00:00Z to 24:00Z.
    expect(s.ids()).toEqual(['b', 'c']);
  });

  it('after a zone change, midnight is the new zone\'s (mutant: the day kept across zones)', () => {
    const s = setup({ now: at('2026-10-19T23:30:00Z') });
    s.m.setQuery(makeQuery({ filter: TODAY_T }));
    s.m.setContext(localeCtx({ locale: 'fr-FR', timeZone: 'UTC' }));
    expect(s.ids()).toEqual(['b', 'c']);
    // Midnight in UTC, still the 20th in Algiers.
    s.clock.t = at('2026-10-20T00:30:00Z');
    s.m.tick();
    expect(s.ids()).toEqual(['d']);
  });

  it('a row update after midnight, before the tick, filters every row by the new day (mutant: only the row re-tested)', () => {
    const s = setup();
    s.m.setQuery(makeQuery({ filter: TODAY_T }));
    expect(s.ids()).toEqual(['a', 'b']);
    s.clock.t = at('2026-10-20T01:00:00Z');
    // Out before and out after: the row alone would not move.
    s.m.applyTransaction({ patch: [{ id: 'c', set: { t: '2026-10-17T10:00:00Z' } }] });
    expect(s.ids()).toEqual(['d']);
  });

  it('follows the clock going back to the day before', () => {
    const s = setup({ now: at('2026-10-20T08:00:00Z') });
    s.m.setQuery(makeQuery({ filter: TODAY_T }));
    expect(s.ids()).toEqual(['c', 'd']);
    s.clock.t = at('2026-10-19T08:00:00Z');
    s.m.tick();
    expect(s.ids()).toEqual(['a', 'b']);
    expect(s.changes.at(-1)!.kind).toBe('query');
  });

  it('a new day changes which rows the query matches (membershipOf)', () => {
    const s = setup();
    const q = makeQuery({ filter: TODAY_T });
    const plain = makeQuery({ filter: { n: { type: 'text', op: 'equals', value: 'x' } } });
    const k1 = s.m.membershipOf(q);
    const p1 = s.m.membershipOf(plain);
    expect(s.m.membershipOf(q)).toBe(k1);
    s.clock.t = at('2026-10-20T00:00:00Z');
    expect(s.m.membershipOf(q)).not.toBe(k1);
    expect(s.m.membershipOf(plain)).toBe(p1);
  });

  it('without a clock a shortcut is refused (no clock) and ignored', () => {
    const s = setup({ now: null });
    s.m.setQuery(makeQuery({ filter: TODAY_T }));
    expect(s.ids()).toEqual(['a', 'b', 'c', 'd']);
    expect(s.m.problems.map((p) => [p.code, p.path, p.detail])).toEqual([['invalid-filter', 'filter.t', 'no clock']]);
    s.m.tick();
    expect(s.ids()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('a clock that reads no day (NaN, then past the Date range) is no clock, and the next reading that has one counts (R2: nothing kept)', () => {
    const s = setup({ now: NaN });
    s.m.setQuery(makeQuery({ filter: TODAY_T }));
    expect(s.ids()).toEqual(['a', 'b', 'c', 'd']);
    expect(s.m.problems.map((p) => [p.code, p.path, p.detail])).toEqual([['invalid-filter', 'filter.t', 'no clock']]);
    s.clock.t = at('2026-10-19T12:00:00Z');
    s.m.tick();
    expect(s.ids()).toEqual(['a', 'b']);
    expect(s.m.problems).toEqual([]);
    s.clock.t = 8.64e15 + 1;
    s.m.tick();
    expect(s.ids()).toEqual(['a', 'b', 'c', 'd']);
    // Forward again from before the year 0000 (an hour before it in UTC; Algiers was then 12 min 12 s ahead): the day
    // is read anew, not kept until a day that never ends.
    s.clock.t = at('0000-01-01T00:00:00Z') - 3_600_000;
    s.m.tick();
    expect(s.m.problems.map((p) => p.detail)).toEqual(['no clock']);
    s.clock.t = at('2026-10-20T01:00:00Z');
    s.m.tick();
    expect(s.ids()).toEqual(['c', 'd']);
  });

  it('a column named "relative" or a text value "relative" is no shortcut: no clock read at midnight, no change', () => {
    const columns = createColumnModel<{ id: string; relative: string }>([{ id: 'relative' }]);
    const clock = { t: at('2026-10-19T12:00:00Z') as number, reads: 0 };
    const m = clientRows({ rows: [{ id: 'a', relative: 'relative' }], getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'fr-FR', timeZone: 'UTC' }), now: () => (clock.reads++, clock.t) });
    const changes: unknown[] = [];
    const q = makeQuery({ filter: { relative: { type: 'text', op: 'equals', value: 'relative' } } });
    m.setQuery(q);
    m.subscribe((c) => changes.push(c));
    const k = m.membershipOf(q);
    clock.t += 86_400_000;
    m.tick();
    expect([changes.length, clock.reads, m.membershipOf(q) === k]).toEqual([0, 0, true]);
  });

  it('a Day shortcut ignores a value or valueTo left behind (even one that is no day)', () => {
    const s = setup();
    s.m.setQuery(makeQuery({ filter: { d: { type: 'day', op: 'relative', range: 'today', value: 'not a day', valueTo: '2026-02-30' } } }));
    expect(s.ids()).toEqual(['a', 'b']);
    expect(s.m.problems).toEqual([]);
  });

  it('an unknown shortcut is refused at .range', () => {
    const s = setup();
    s.m.setQuery(makeQuery({ filter: { t: { type: 'instant', op: 'relative', range: 'thisWeek' as never } } }));
    expect(s.ids()).toEqual(['a', 'b', 'c', 'd']);
    expect(s.m.problems.map((p) => [p.code, p.path])).toEqual([['invalid-filter', 'filter.t.range']]);
  });

  it('a shortcut inside a combined filter follows midnight too', () => {
    const s = setup();
    s.m.setQuery(makeQuery({ filter: { t: { type: 'combined', join: 'or', conditions: [{ type: 'instant', op: 'relative', range: 'today' }, { type: 'instant', op: 'onDay', day: '2026-10-13' }] } } }));
    expect(s.ids()).toEqual(['a', 'b']);
    s.clock.t = at('2026-10-20T01:00:00Z');
    s.m.tick();
    expect(s.ids()).toEqual(['c', 'd']);
  });

  it('an open value list counts under the new day after midnight', () => {
    const s = setup();
    s.m.setQuery(makeQuery({ filter: TODAY_T }));
    const h = s.m.setValues('n');
    const count = (v: string) => h.result!.values.find((e) => e.value === v)?.count ?? 0;
    expect([count('x'), count('y')]).toEqual([1, 1]);
    s.clock.t = at('2026-10-20T00:00:00Z');
    s.m.tick();
    expect(s.ids()).toEqual(['c', 'd']);
    expect([count('x'), count('y')]).toEqual([2, 0]);
  });

  it('kernel.tick() forwards to the model', () => {
    const s = setup();
    const kernel = createKernel<R>({ rows: s.m, columns: s.columns });
    kernel.dispatch({ type: 'filter.set', filter: TODAY_T }, 'user');
    expect(s.ids()).toEqual(['a', 'b']);
    s.clock.t = at('2026-10-20T00:00:00Z');
    kernel.tick();
    expect(s.ids()).toEqual(['c', 'd']);
  });
});
