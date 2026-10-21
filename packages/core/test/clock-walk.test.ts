import { describe, it, expect } from 'vitest';
import { clientRows, createColumnModel, localeCtx, makeQuery, type FilterModel, type ModelChange, type RelativeRange, type SortItem } from '@dzgrid/core';
import { sourceRows, type DataSource } from '@dzgrid/core/server';
import { fakeSource } from './support/fake-source.js';
import { mulberry32 } from './support/rng.js';
import { addDaysUtc, localDate, startOfDay } from './support/zone-oracle.js';

/**
 * A stepping clock walked back and forth (seconds to days), with zone, filter,
 * sort and row changes in between. At every step the rows shown (client) and
 * the request sent (server) are what an independent oracle says for the clock
 * as it reads now; a tick is idempotent; a server asks only when the wire form
 * changes.
 */
type R = { id: string; t: string | null; d: string | null; n: string };
const ZONES = ['America/Sao_Paulo', 'Pacific/Apia', 'Australia/Lord_Howe', 'Pacific/Chatham', 'Europe/Paris', 'Africa/Algiers', 'Pacific/Auckland'];
const RANGES: RelativeRange[] = ['today', 'yesterday', 'last7Days', 'last30Days', 'thisMonth', 'lastMonth'];
const H = 3_600_000;
const D = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();

function oracleDays(range: RelativeRange, today: string): { from: string; to: string } {
  const [y, m] = today.split('-').map(Number) as [number, number];
  const ymd = (yy: number, mm: number, dd: number) => new Date(Date.UTC(yy, mm - 1, dd)).toISOString().slice(0, 10);
  switch (range) {
    case 'today': return { from: today, to: today };
    case 'yesterday': return { from: addDaysUtc(today, -1), to: addDaysUtc(today, -1) };
    case 'last7Days': return { from: addDaysUtc(today, -6), to: today };
    case 'last30Days': return { from: addDaysUtc(today, -29), to: today };
    case 'thisMonth': return { from: ymd(y, m, 1), to: ymd(y, m + 1, 0) };
    case 'lastMonth': return { from: ymd(y, m - 1, 1), to: ymd(y, m, 0) };
  }
}

type Cond = { type: 'instant'; op: 'relative'; range: RelativeRange } | { type: 'instant'; op: 'onDay'; day: string } | { type: 'day'; op: 'relative'; range: RelativeRange };
/** One condition's test on a row, and its wire form, by the oracle. */
function oracleCond(c: Cond, now: number, zone: string): { keep: (r: R) => boolean; wire: unknown } {
  if (c.type === 'day') {
    const w = oracleDays(c.range, localDate(now, zone));
    return { keep: (r) => r.d !== null && r.d >= w.from && r.d <= w.to, wire: { type: 'day', op: 'between', value: w.from, valueTo: w.to, relative: c.range, zone } };
  }
  const w = c.op === 'relative' ? oracleDays(c.range, localDate(now, zone)) : { from: c.day, to: c.day };
  const a = startOfDay(w.from, zone);
  const b = startOfDay(addDaysUtc(w.to, 1), zone);
  const fields = c.op === 'relative' ? { op: 'betweenDays', day: w.from, dayTo: w.to, relative: c.range } : { op: 'onDay', day: c.day };
  return { keep: (r) => r.t !== null && Date.parse(r.t) >= a && Date.parse(r.t) < b, wire: { type: 'instant', ...fields, resolved: { from: iso(a), to: iso(b) }, zone } };
}
type Spec = { t?: Cond | { or: [Cond, Cond] }; d?: Cond };
function toModel(s: Spec): FilterModel {
  const out: Record<string, unknown> = {};
  if (s.t) out.t = 'or' in s.t ? { type: 'combined', join: 'or', conditions: s.t.or } : s.t;
  if (s.d) out.d = s.d;
  return out as FilterModel;
}
function oracle(s: Spec, now: number, zone: string): { keep: (r: R) => boolean; wire: Record<string, unknown> } {
  const tests: ((r: R) => boolean)[] = [];
  const wire: Record<string, unknown> = {};
  if (s.t) {
    if ('or' in s.t) {
      const [x, y] = s.t.or.map((c) => oracleCond(c, now, zone)) as [ReturnType<typeof oracleCond>, ReturnType<typeof oracleCond>];
      tests.push((r) => x.keep(r) || y.keep(r));
      wire.t = { type: 'combined', join: 'or', conditions: [x.wire, y.wire] };
    } else {
      const x = oracleCond(s.t, now, zone);
      tests.push(x.keep);
      wire.t = x.wire;
    }
  }
  if (s.d) {
    const x = oracleCond(s.d, now, zone);
    tests.push(x.keep);
    wire.d = x.wire;
  }
  return { keep: (r) => tests.every((f) => f(r)), wire };
}
const hasRelative = (s: Spec) => JSON.stringify(s).includes('"relative"');

/** A walk's random moves, shared by the client and the server walks. */
function mover(seed: number) {
  const rnd = mulberry32(seed);
  const pick = <X>(xs: readonly X[]): X => xs[Math.floor(rnd() * xs.length)]!;
  const state = { now: Date.UTC(2026, 9, 19, 12), zone: pick(ZONES) };
  const near = () => state.now + Math.floor((rnd() - 0.6) * 45 * D);
  const cond = (): Cond => {
    const k = rnd();
    if (k < 0.45) return { type: 'instant', op: 'relative', range: pick(RANGES) };
    if (k < 0.65) return { type: 'instant', op: 'onDay', day: localDate(near(), state.zone) };
    return { type: 'day', op: 'relative', range: pick(RANGES) };
  };
  const spec = (): Spec => {
    const k = rnd();
    if (k < 0.12) return {};
    const c = cond();
    if (k < 0.25) return { t: { or: [{ type: 'instant', op: 'relative', range: pick(RANGES) }, { type: 'instant', op: 'onDay', day: localDate(near(), state.zone) }] } };
    if (k < 0.4) return { t: { type: 'instant', op: 'relative', range: pick(RANGES) }, d: { type: 'day', op: 'relative', range: pick(RANGES) } };
    return c.type === 'day' ? { d: c } : { t: c };
  };
  /** A clock step: seconds to days, either way; sometimes onto the edge of a local midnight. */
  const step = () => {
    const k = rnd();
    if (k < 0.3) {
      const day = localDate(state.now + (rnd() < 0.5 ? D : -D) * Math.floor(rnd() * 2), state.zone);
      state.now = startOfDay(day, state.zone) + Math.floor(rnd() * 4001) - 2000;
    } else {
      const unit = pick([1000, 60_000, H, D]);
      state.now += Math.round((rnd() - 0.45) * 30 * unit);
    }
  };
  const row = (i: number): R => {
    const ms = near();
    return { id: `r${i}`, t: rnd() < 0.1 ? null : iso(ms), d: rnd() < 0.1 ? null : localDate(near(), state.zone), n: pick(['x', 'y', 'z']) };
  };
  return { rnd, pick, state, spec, step, row };
}

describe('a stepping-clock walk', () => {
  for (const seed of [11, 22, 33]) {
    it(`client: shown rows = oracle after every move, a tick tells a change iff the day moved, and is idempotent (seed ${seed})`, () => {
      const w = mover(seed);
      const rows: R[] = Array.from({ length: 40 }, (_, i) => w.row(i));
      const columns = createColumnModel<R>([{ id: 't', type: 'instant' }, { id: 'd', type: 'day' }, { id: 'n' }]);
      const m = clientRows<R>({ rows, getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'en-US', timeZone: w.state.zone }), now: () => w.state.now });
      const changes: ModelChange<R>[] = [];
      m.subscribe((c) => changes.push(c));
      const ids = () => Array.from({ length: m.displayed.count }, (_, i) => String((m.displayed.nodeAt(m.displayed.index(i)!) as { id: unknown }).id)).sort();
      let spec: Spec = {};
      let filter = toModel(spec);
      let sort: SortItem[] = [];
      /** The day (in the zone) the shown rows were last filtered against. */
      let evalDay = localDate(w.state.now, w.state.zone);
      let evalZone = w.state.zone;
      const check = (what: string) => {
        evalDay = localDate(w.state.now, w.state.zone);
        evalZone = w.state.zone;
        const o = oracle(spec, w.state.now, w.state.zone);
        expect(ids(), `${what} seed ${seed} ${w.state.zone} ${iso(w.state.now)} ${JSON.stringify(spec)}`).toEqual(rows.filter(o.keep).map((r) => r.id).sort());
        expect(m.problems, what).toEqual([]);
      };
      for (let i = 0; i < 300; i++) {
        const k = w.rnd();
        if (k < 0.4) {
          w.step();
          if (w.rnd() < 0.6) {
            const moved = hasRelative(spec) && (localDate(w.state.now, w.state.zone) !== evalDay || evalZone !== w.state.zone);
            const runs = m.diagnostics.filterRuns;
            changes.length = 0;
            m.tick();
            expect(changes.length, `#${i} tick tells iff the day moved`).toBe(moved ? 1 : 0);
            expect(m.diagnostics.filterRuns - runs, `#${i} tick filters iff the day moved`).toBe(moved ? 1 : 0);
            check(`#${i} tick`);
            changes.length = 0;
            m.tick();
            expect(changes, `#${i} second tick`).toEqual([]);
            expect(m.diagnostics.filterRuns, `#${i} second tick`).toBe(runs + (moved ? 1 : 0));
          }
        } else if (k < 0.55) {
          w.state.zone = w.pick(ZONES);
          m.setContext(localeCtx({ locale: 'en-US', timeZone: w.state.zone }));
          check(`#${i} zone`);
        } else if (k < 0.75) {
          const next = w.spec();
          // The same query again is a no-op by design: nothing to check.
          if (JSON.stringify(next) === JSON.stringify(spec)) continue;
          spec = next;
          filter = toModel(spec);
          m.setQuery(makeQuery({ filter, sort }));
          check(`#${i} filter`);
        } else if (k < 0.85) {
          // Always another sort: the same query again is a no-op by design.
          sort = sort.length ? (w.rnd() < 0.5 ? [] : [{ column: 'n', dir: sort[0]!.dir === 'asc' ? 'desc' : 'asc' }]) : [{ column: 'n', dir: w.rnd() < 0.5 ? 'asc' : 'desc' }];
          m.setQuery(makeQuery({ filter, sort }));
          check(`#${i} sort`);
        } else {
          const j = Math.floor(w.rnd() * rows.length);
          const next = w.row(j);
          rows[j] = next;
          m.applyTransaction({ patch: [{ id: next.id, set: { t: next.t, d: next.d } }] });
          check(`#${i} row`);
        }
      }
    });

    it(`server: each request = oracle wire for the clock as it reads; a request iff the wire form changed (seed ${seed})`, () => {
      const w = mover(seed);
      const fake = fakeSource();
      const columns = createColumnModel<R>([{ id: 't', type: 'instant' }, { id: 'd', type: 'day' }, { id: 'n' }]);
      const model = sourceRows<R>(fake.source as DataSource<R>).create({ getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'en-US', timeZone: w.state.zone }), abort: fake.abort, now: () => w.state.now });
      let spec: Spec = {};
      let filter = toModel(spec);
      let sort: SortItem[] = [];
      const sent = () => {
        const req = fake.calls.at(-1)!.req as any;
        return JSON.stringify({ filter: req.filter ?? {}, sort: req.sort ?? [], zone: req.zone });
      };
      const want = () => JSON.stringify({ filter: oracle(spec, w.state.now, w.state.zone).wire, sort, zone: w.state.zone });
      let lastWant = want();
      expect(sent()).toBe(lastWant);
      const act = (what: string, fn: () => void) => {
        const n = fake.calls.length;
        fn();
        const now = want();
        const asked = fake.calls.length - n;
        const label = `${what} seed ${seed} ${w.state.zone} ${iso(w.state.now)} ${JSON.stringify(spec)}`;
        // Asked once iff the wire form changed, and what was asked is the oracle's.
        expect(asked, `asks iff changed: ${label}`).toBe(now !== lastWant ? 1 : 0);
        if (asked) expect(sent(), label).toBe(now);
        lastWant = now;
        expect(model.problems, label).toEqual([]);
      };
      for (let i = 0; i < 300; i++) {
        const k = w.rnd();
        if (k < 0.45) {
          w.step();
          act(`#${i} tick`, () => model.tick());
          act(`#${i} tick again`, () => model.tick());
        } else if (k < 0.6) {
          w.state.zone = w.pick(ZONES);
          act(`#${i} zone`, () => model.setContext(localeCtx({ locale: 'en-US', timeZone: w.state.zone })));
        } else if (k < 0.85) {
          spec = w.spec();
          filter = toModel(spec);
          act(`#${i} filter`, () => model.setQuery(makeQuery({ filter, sort })));
        } else {
          // Always another sort: the same query again is a no-op by design.
          sort = sort.length ? (w.rnd() < 0.5 ? [] : [{ column: 'n', dir: sort[0]!.dir === 'asc' ? 'desc' : 'asc' }]) : [{ column: 'n', dir: w.rnd() < 0.5 ? 'asc' : 'desc' }];
          act(`#${i} sort`, () => model.setQuery(makeQuery({ filter, sort })));
        }
      }
    });
  }
});

describe('a midnight sweep', () => {
  it('client and server: every local midnight of a year in each zone, at -1 ms, exactly and +1 s, ticked, is the oracle\'s day (23, 24.5, 25-hour days, skipped days)', () => {
    for (const zone of ZONES) {
      // Apia's skipped day is in 2011; the others' changes in any year.
      const first = zone === 'Pacific/Apia' ? '2011-10-01' : '2026-01-01';
      const t0 = startOfDay(first, zone);
      // One row a little after each local midnight: today always holds exactly one.
      const rows: R[] = Array.from({ length: 370 }, (_, i) => ({ id: `r${i}`, t: iso(startOfDay(addDaysUtc(first, i), zone) + 20 * 60_000), d: null, n: 'x' }));
      const columns = createColumnModel<R>([{ id: 't', type: 'instant' }, { id: 'd', type: 'day' }, { id: 'n' }]);
      const clock = { t: t0 + H };
      const ctx = localeCtx({ locale: 'en-US', timeZone: zone });
      const m = clientRows<R>({ rows, getRowId: (r) => r.id, columns, ctx, now: () => clock.t });
      const fake = fakeSource();
      const server = sourceRows<R>(fake.source as DataSource<R>).create({ getRowId: (r) => r.id, columns, ctx, abort: fake.abort, now: () => clock.t });
      const spec: Spec = { t: { type: 'instant', op: 'relative', range: 'today' } };
      m.setQuery(makeQuery({ filter: toModel(spec) }));
      server.setQuery(makeQuery({ filter: toModel(spec) }));
      const ids = () => Array.from({ length: m.displayed.count }, (_, i) => String((m.displayed.nodeAt(m.displayed.index(i)!) as { id: unknown }).id)).sort();
      let day = first;
      for (let n = 0; n < (zone === 'Pacific/Apia' ? 120 : 366); n++) {
        day = addDaysUtc(day, 1);
        const mid = startOfDay(day, zone);
        for (const t of [mid - 1, mid, mid + 1000]) {
          clock.t = t;
          m.tick();
          server.tick();
          const o = oracle(spec, t, zone);
          const label = `${zone} ${iso(t)} (${localDate(t, zone)})`;
          expect(ids(), label).toEqual(rows.filter(o.keep).map((r) => r.id).sort());
          expect((fake.calls.at(-1)!.req.filter as any).t, label).toEqual(o.wire.t);
        }
      }
    }
  });
});

describe('found by the walk', () => {
  it('server: a sort change after midnight, before the tick, asks with yesterday\'s days (the wire form is cached by filter identity, not by day)', () => {
    const fake = fakeSource();
    const clock = { t: Date.UTC(2026, 9, 19, 12) };
    const columns = createColumnModel<R>([{ id: 't', type: 'instant' }, { id: 'n' }]);
    const model = sourceRows<R>(fake.source as DataSource<R>).create({ getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'fr-FR', timeZone: 'Africa/Algiers' }), abort: fake.abort, now: () => clock.t });
    const filter: FilterModel = { t: { type: 'instant', op: 'relative', range: 'today' } };
    model.setQuery(makeQuery({ filter }));
    expect((fake.calls.at(-1)!.req.filter as any).t.day).toBe('2026-10-19');
    clock.t = Date.UTC(2026, 9, 20, 8); // the 20th in Algiers
    model.setQuery(makeQuery({ filter, sort: [{ column: 'n', dir: 'asc' }] }));
    // The client model, in the same situation, filters by the 20th.
    expect((fake.calls.at(-1)!.req.filter as any).t.day).toBe('2026-10-20');
  });

  it('server: membershipOf after midnight, before the tick, is still yesterday\'s (same cache; the client model\'s changes)', () => {
    const fake = fakeSource();
    const clock = { t: Date.UTC(2026, 9, 19, 12) };
    const columns = createColumnModel<R>([{ id: 't', type: 'instant' }, { id: 'n' }]);
    const model = sourceRows<R>(fake.source as DataSource<R>).create({ getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'fr-FR', timeZone: 'Africa/Algiers' }), abort: fake.abort, now: () => clock.t });
    const q = makeQuery({ filter: { t: { type: 'instant', op: 'relative', range: 'today' } } });
    model.setQuery(q);
    const k1 = model.membershipOf(q);
    clock.t = Date.UTC(2026, 9, 20, 8);
    expect(model.membershipOf(q)).not.toBe(k1);
  });

  it('client: a text filter whose value is the word "relative" filters again and tells a query change at midnight (the shortcut test is a substring of the key)', () => {
    const clock = { t: Date.UTC(2026, 9, 19, 12), reads: 0 };
    const columns = createColumnModel<R>([{ id: 't', type: 'instant' }, { id: 'n' }]);
    const m = clientRows<R>({ rows: [{ id: 'a', t: null, d: null, n: 'relative' }], getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'en-US', timeZone: 'UTC' }), now: () => (clock.reads++, clock.t) });
    const changes: ModelChange<R>[] = [];
    m.setQuery(makeQuery({ filter: { n: { type: 'text', op: 'equals', value: 'relative' } } }));
    m.subscribe((c) => changes.push(c));
    const runs = m.diagnostics.filterRuns;
    clock.t += 86_400_000;
    m.tick();
    expect([m.diagnostics.filterRuns - runs, changes.length, clock.reads]).toEqual([0, 0, 0]);
  });
});
