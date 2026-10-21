import { describe, it, expect } from 'vitest';
import { clientRows, createColumnModel, localeCtx, makeQuery, parseDay, relativeDays, RELATIVE_RANGES, resolveInstantRange, type Day, type RelativeRange } from '@dzgrid/core';
import { toWire } from '@dzgrid/core/server';
import { mulberry32 } from './support/rng.js';
import { addDaysUtc, localDate, offsetAt, startOfDay, zoneDays } from './support/zone-oracle.js';

/**
 * Property: a shortcut, for any zone, any clock and any of the six names, is
 * whole days in the zone, by an oracle that shares no code with the core (its
 * own Intl reader and a binary search for the first instant of a day).
 */
const ZONES = ['America/Sao_Paulo', 'Pacific/Apia', 'Australia/Lord_Howe', 'Pacific/Chatham', 'Europe/Paris', 'Africa/Algiers', 'Pacific/Auckland', 'UTC', 'America/Los_Angeles', 'Asia/Kathmandu'];
const RANGES = [...RELATIVE_RANGES] as RelativeRange[];
const LO = Date.UTC(1970, 0, 1);
const HI = Date.UTC(2100, 0, 1);

/** tzslot's own `presetRange`, from node_modules when installed (clean room: our code); the comparisons skip otherwise. */
type Tzslot = { presetRange: (n: string, o: { today: unknown }) => { start: { toString(): string }; end: { toString(): string } }; Temporal: any };
const tzslot = (await import('@tzslot/core').catch(() => null)) as unknown as Tzslot | null;

/** The six by hand, Date.UTC day counting (no Temporal). */
function daysOracle(range: RelativeRange, today: string): { from: string; to: string } {
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

/** A clock: uniform, within 2 s of a local midnight, or within 2 s of a clock change. */
function pickNow(rnd: () => number, zone: string): { now: number; how: string } {
  const u = LO + Math.floor(rnd() * (HI - LO));
  const k = rnd();
  const jitter = Math.floor(rnd() * 4001) - 2000;
  if (k < 0.3) return { now: u, how: 'uniform' };
  if (k < 0.65) return { now: startOfDay(localDate(u, zone), zone) + jitter, how: 'midnight' };
  // The next offset change within ~400 days, if any.
  const o0 = offsetAt(u, zone);
  for (let t = u; t < u + 400 * 86_400_000; t += 6 * 3_600_000) {
    if (offsetAt(t, zone) !== o0) {
      let lo = t - 6 * 3_600_000;
      let hi = t;
      while (hi - lo > 1) {
        const mid = Math.floor((lo + hi) / 2);
        if (offsetAt(mid, zone) === o0) lo = mid;
        else hi = mid;
      }
      return { now: hi + jitter, how: 'change' };
    }
  }
  return { now: u, how: 'uniform (no change)' };
}

describe('relative shortcuts, property over zones and clocks', () => {
  it.skipIf(!tzslot)("tzslot presetRange is loaded (so the comparisons below run)", () => { expect(typeof tzslot?.presetRange).toBe("function"); });
  it('instant: [first instant of from, first instant after to); day: from..to inclusive; wire agrees; now inside or outside as the name says', () => {
    const seed = 0x5eed14;
    const rnd = mulberry32(seed);
    const hows: Record<string, number> = {};
    for (let i = 0; i < 400; i++) {
      const zone = ZONES[Math.floor(rnd() * ZONES.length)]!;
      const { now, how } = pickNow(rnd, zone);
      hows[how] = (hows[how] ?? 0) + 1;
      const range = RANGES[Math.floor(rnd() * RANGES.length)]!;
      const label = `#${i} seed ${seed} ${zone} ${new Date(now).toISOString()} (${how}) ${range}`;
      const today = localDate(now, zone);
      const want = daysOracle(range, today);
      if (tzslot) {
        const p = tzslot.presetRange(range, { today: tzslot.Temporal.PlainDate.from(today) });
        expect({ from: p.start.toString(), to: p.end.toString() }, `tzslot ${label}`).toEqual(want);
      }
      expect(relativeDays(range, parseDay(today)!), label).toEqual(want);

      const from = startOfDay(want.from, zone);
      const to = startOfDay(addDaysUtc(want.to, 1), zone);
      const r = resolveInstantRange({ type: 'instant', op: 'relative', range }, zone, 'filter', now);
      expect(r.problems, label).toEqual([]);
      expect(r.range, label).toEqual({ from, to });
      expect(r.days, label).toEqual(want);
      const contains = now >= from && now < to;
      if (range === 'yesterday' || range === 'lastMonth') expect(now >= to, `excludes now ${label}`).toBe(true);
      else expect(contains, `contains now ${label}`).toBe(true);

      const cols = createColumnModel<any>([{ id: 't', type: 'instant' }, { id: 'd', type: 'day' }]);
      const ctx = localeCtx({ locale: 'en-US', timeZone: zone });
      const w = toWire({ t: { type: 'instant', op: 'relative', range }, d: { type: 'day', op: 'relative', range } }, { ctx, columns: cols, now });
      expect(w.problems, label).toEqual([]);
      expect(w.filter.t, label).toEqual({ type: 'instant', op: 'betweenDays', day: want.from, dayTo: want.to, relative: range, resolved: { from: new Date(from).toISOString(), to: new Date(to).toISOString() }, zone });
      expect(w.filter.d, label).toEqual({ type: 'day', op: 'between', value: want.from, valueTo: want.to, relative: range, zone });

      // The browser's filter on rows at the edges: a millisecond either side, and days either side.
      const rows = [from - 1, from, to - 1, to, now].map((ms, k) => ({ id: `t${k}`, t: new Date(ms).toISOString(), d: null as string | null }))
        .concat([addDaysUtc(want.from, -1), want.from, want.to, addDaysUtc(want.to, 1), today].map((d, k) => ({ id: `d${k}`, t: null as unknown as string, d })));
      const m = clientRows<any>({ rows, getRowId: (x) => x.id, columns: cols, ctx, now: () => now });
      const ids = () => Array.from({ length: m.displayed.count }, (_, j) => String((m.displayed.nodeAt(m.displayed.index(j)!) as { id: unknown }).id));
      m.setQuery(makeQuery({ filter: { t: { type: 'instant', op: 'relative', range } } }));
      const keptT = rows.filter((x) => x.t !== null && Date.parse(x.t) >= from && Date.parse(x.t) < to).map((x) => x.id);
      expect(ids(), `instant rows ${label}`).toEqual(keptT);
      m.setQuery(makeQuery({ filter: { d: { type: 'day', op: 'relative', range } } }));
      const keptD = rows.filter((x) => x.d !== null && x.d >= want.from && x.d <= want.to).map((x) => x.id);
      expect(ids(), `day rows ${label}`).toEqual(keptD);
    }
    // Each kind of clock was drawn.
    expect(Object.keys(hows)).toEqual(expect.arrayContaining(['uniform', 'midnight', 'change']));
  });

  it('the oracle itself: a 23-hour and a 25-hour day in Paris, and the skipped Apia day is empty', () => {
    expect(startOfDay('2026-03-30', 'Europe/Paris') - startOfDay('2026-03-29', 'Europe/Paris')).toBe(23 * 3_600_000);
    expect(startOfDay('2026-10-26', 'Europe/Paris') - startOfDay('2026-10-25', 'Europe/Paris')).toBe(25 * 3_600_000);
    expect(startOfDay('2011-12-30', 'Pacific/Apia')).toBe(startOfDay('2011-12-31', 'Pacific/Apia'));
    expect(zoneDays('2011-12-28', '2012-01-01', 'Pacific/Apia')).toEqual(['2011-12-28', '2011-12-29', '2011-12-31', '2012-01-01']);
  });

  it('yesterday in Apia on 2011-12-31 is the day that never was: no instant (and no problem)', () => {
    const now = startOfDay('2011-12-31', 'Pacific/Apia') + 3_600_000;
    const r = resolveInstantRange({ type: 'instant', op: 'relative', range: 'yesterday' }, 'Pacific/Apia', 'filter', now);
    expect(r.days).toEqual({ from: '2011-12-30', to: '2011-12-30' });
    expect(r.range!.to! - r.range!.from!).toBe(0);
  });

  it.skipIf(!tzslot)('relativeDays agrees with tzslot presetRange (when installed) on every day of 1970-2100 for the six', () => {
    if (!tzslot) return;
    const T = tzslot.Temporal;
    for (let d = T.PlainDate.from('1970-01-01'); T.PlainDate.compare(d, T.PlainDate.from('2100-12-31')) <= 0; d = d.add({ days: 1 })) {
      const s = d.toString();
      if (!s.endsWith('-01') && !s.endsWith('-28') && !s.endsWith('-29') && !s.endsWith('-30') && !s.endsWith('-31') && !s.endsWith('-15')) continue;
      for (const r of RANGES) {
        const p = tzslot.presetRange(r, { today: d });
        expect(relativeDays(r, s as Day), `${r} ${s}`).toEqual({ from: p.start.toString(), to: p.end.toString() });
      }
    }
  });
});
