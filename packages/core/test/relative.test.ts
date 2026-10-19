import { describe, it, expect } from 'vitest';
import { dayAt, instantToDayIn, parseDay, parseInstant, relativeDays, RELATIVE_RANGES, resolveInstantRange, zoneDayBounds, type Day, type InstantMs } from '@dzgrid/core';

/**
 * docs/behaviors/filter-relative.md. The oracle counts with the test's own
 * `Date.UTC` (the core may not), the six meanings written out from tzslot's
 * `presetRange`: both ends in, last 7 days = six back and today, months whole.
 */
const D = (s: string): Day => parseDay(s)!;
const MS = 86_400_000;
const write = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const utc = (y: number, m: number, d: number): number => Date.UTC(y, m - 1, d);
function oracle(range: string, today: string): { from: string; to: string } {
  const [y, m, d] = today.split('-').map(Number) as [number, number, number];
  const t = utc(y, m, d);
  switch (range) {
    case 'today': return { from: today, to: today };
    case 'yesterday': return { from: write(t - MS), to: write(t - MS) };
    case 'last7Days': return { from: write(t - 6 * MS), to: today };
    case 'last30Days': return { from: write(t - 29 * MS), to: today };
    case 'thisMonth': return { from: write(utc(y, m, 1)), to: write(utc(y, m + 1, 1) - MS) };
    case 'lastMonth': return { from: write(utc(y, m - 1, 1)), to: write(utc(y, m, 1) - MS) };
  }
  throw new Error(range);
}

describe('relative ranges', () => {
  it('are the six names tzslot uses, no more', () => {
    expect([...RELATIVE_RANGES].sort()).toEqual(['last30Days', 'last7Days', 'lastMonth', 'thisMonth', 'today', 'yesterday']);
  });

  it('resolve as the oracle says on every day of 2023-2029, for each name', () => {
    let n = 0;
    for (let t = utc(2023, 1, 1); t <= utc(2029, 12, 31); t += MS) {
      const today = write(t);
      for (const r of RELATIVE_RANGES) {
        expect(relativeDays(r, D(today)), `${r} ${today}`).toEqual(oracle(r, today));
        n++;
      }
    }
    expect(n).toBe(2557 * 6);
  });

  it('hand-written edges: leap February, year turns, month ends', () => {
    expect(relativeDays('thisMonth', D('2028-02-10'))).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(relativeDays('thisMonth', D('2100-02-28'))).toEqual({ from: '2100-02-01', to: '2100-02-28' });
    expect(relativeDays('lastMonth', D('2026-03-31'))).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(relativeDays('lastMonth', D('2026-01-15'))).toEqual({ from: '2025-12-01', to: '2025-12-31' });
    expect(relativeDays('yesterday', D('2026-01-01'))).toEqual({ from: '2025-12-31', to: '2025-12-31' });
    expect(relativeDays('last7Days', D('2026-03-03'))).toEqual({ from: '2026-02-25', to: '2026-03-03' });
    expect(relativeDays('last30Days', D('2024-03-01'))).toEqual({ from: '2024-02-01', to: '2024-03-01' });
    expect(relativeDays('today', D('2026-10-19'))).toEqual({ from: '2026-10-19', to: '2026-10-19' });
  });

  it('is null for a name not in the six, and past the years a Day can write', () => {
    for (const bad of ['thisWeek', 'lastHour', 'tomorrow', '', 'TODAY', 'constructor', 'toString']) expect(relativeDays(bad as never, D('2026-10-19')), bad).toBeNull();
    expect(relativeDays('yesterday', D('0000-01-01'))).toBeNull();
    expect(relativeDays('lastMonth', D('0000-01-20'))).toBeNull();
    expect(relativeDays('last30Days', D('0000-01-10'))).toBeNull();
    expect(relativeDays('thisMonth', D('9999-12-31'))).toEqual({ from: '9999-12-01', to: '9999-12-31' });
    expect(relativeDays('lastMonth', D('0000-02-29'))).toEqual({ from: '0000-01-01', to: '0000-01-31' });
  });
});

describe('dayAt', () => {
  const at = (s: string) => parseInstant(s)!;
  it('is the day the clock reads in the zone, and the instant it ends', () => {
    expect(dayAt(at('2026-10-19T22:59:59.999Z'), 'Africa/Algiers')).toEqual({ day: '2026-10-19', until: at('2026-10-19T23:00:00Z') });
    expect(dayAt(at('2026-10-19T23:00:00Z'), 'Africa/Algiers')).toEqual({ day: '2026-10-20', until: at('2026-10-20T23:00:00Z') });
    // The 25-hour day in Paris ends at 23:00Z.
    expect(dayAt(at('2026-10-25T00:00:00Z'), 'Europe/Paris')).toEqual({ day: '2026-10-25', until: at('2026-10-25T23:00:00Z') });
    expect(dayAt(at('2026-10-18T23:30:00Z'), 'UTC')).toEqual({ day: '2026-10-18', until: at('2026-10-19T00:00:00Z') });
    // Apia skipped the 30th: the 29th ends when the 31st begins.
    expect(dayAt(at('2011-12-29T23:00:00Z'), 'Pacific/Apia')).toEqual({ day: '2011-12-29', until: at('2011-12-30T10:00:00Z') });
    // São Paulo's 4 November 2018 had no midnight: the 3rd ends at 01:00 (-02), 03:00Z.
    expect(dayAt(at('2018-11-04T02:30:00Z'), 'America/Sao_Paulo')).toEqual({ day: '2018-11-03', until: at('2018-11-04T03:00:00Z') });
  });

  it('agrees with instantToDayIn and zoneDayBounds every hour of a year in four zones, the end always later than now', () => {
    for (const zone of ['Europe/Paris', 'America/Sao_Paulo', 'Pacific/Auckland', 'Asia/Kathmandu']) {
      for (let t: number = at('2026-01-01T00:00:00Z'); t < at('2027-01-01T00:00:00Z'); t += 3_600_000 + 61_000) {
        const r = dayAt(t, zone)!;
        expect(r.day).toBe(instantToDayIn(t as InstantMs, zone));
        expect(r.until).toBe(zoneDayBounds(r.day, zone).to);
        expect(r.until).toBeGreaterThan(t);
      }
    }
  });

  it('is null in a year a Day cannot write', () => {
    expect(dayAt(at('9999-12-31T23:59:59.999Z') + 1, 'UTC')).toBeNull();
  });

  it('is null, never a throw, for a clock that is not a number of the Date range (NaN, infinities, past 8.64e15 ms)', () => {
    for (const t of [NaN, Infinity, -Infinity, 8.64e15 + 1, -8.64e15 - 1, 1e300, Number.MAX_VALUE]) {
      for (const zone of ['UTC', 'Africa/Algiers', 'Pacific/Kiritimati']) expect(dayAt(t, zone), `${t} ${zone}`).toBeNull();
    }
    // The ends of the Date range are years 275760 and -271821: no Day either.
    expect(dayAt(8.64e15, 'Pacific/Kiritimati')).toBeNull();
    expect(dayAt(-8.64e15, 'Pacific/Pago_Pago')).toBeNull();
    // Just before the year 0000 in UTC: none; its first instant: a day.
    expect(dayAt(at('0000-01-01T00:00:00Z') - 1, 'UTC')).toBeNull();
    expect(dayAt(at('0000-01-01T00:00:00Z'), 'UTC')?.day).toBe('0000-01-01');
  });

  it('a shortcut against such a clock is refused as no clock, on an instant range too', () => {
    for (const t of [NaN, Infinity, -Infinity, 8.64e15 + 1, at('9999-12-31T23:59:59.999Z') + 1]) {
      const r = resolveInstantRange({ type: 'instant', op: 'relative', range: 'today' }, 'UTC', 'filter', t);
      expect([r.range, r.problems.map((p) => [p.code, p.path, p.detail])], String(t)).toEqual([null, [['invalid-filter', 'filter', 'no clock']]]);
    }
    // Last month from January 0000 would be December of the year -1: none.
    const r = resolveInstantRange({ type: 'instant', op: 'relative', range: 'lastMonth' }, 'UTC', 'filter', at('0000-01-15T00:00:00Z'));
    expect(r.problems.map((p) => p.detail)).toEqual(['no clock']);
  });
});
