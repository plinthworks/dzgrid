// The two engines agree (step 14 part B; docs/behaviors/filter-date-picker.md): DzGrid's core
// (Intl, decides the rows and the wire) and tzslot 2.2.0 (Temporal, decides what the fields show)
// read the same zone data. 13 zones, 2010–2030: every wall minute of every clock-change day
// (classification and instants), offsets, day starts and instant→day (sampled), and the six
// shortcuts against tzslot's presetRange. If they ever differ, this fails first.
import { describe, it, expect } from 'vitest';
import { addDays, dayAt, instantToDayIn, offsetAt, relativeDays, resolveWall, zoneDayBounds, RELATIVE_RANGES, type Day } from '@dzgrid/core';
import { Temporal, presetRange, resolveWallTime, type Instant } from '@tzslot/core';

const ZONES = [
  'Africa/Algiers', 'Europe/Paris', 'Asia/Kolkata', 'Asia/Kathmandu', 'Pacific/Chatham', 'Australia/Lord_Howe', 'Pacific/Apia',
  'America/Sao_Paulo', 'America/Havana', 'America/Los_Angeles', 'Pacific/Auckland', 'Europe/Dublin', 'UTC',
];
const MIN = 60_000;
const DAY = 86_400_000;
const days = (from: Day, to: Day): Day[] => {
  const out: Day[] = [];
  for (let d: Day | null = from; d && d <= to; d = addDays(d, 1)) out.push(d);
  return out;
};
const ALL = days('2010-01-01' as Day, '2030-12-31' as Day);
/** A day whose length is not 24 h or whose offset changes inside it. */
const changes = (zone: string): Day[] => ALL.filter((d) => {
  const b = zoneDayBounds(d, zone);
  return b.to - b.from !== DAY || offsetAt(b.from, zone) !== offsetAt(b.to - 1, zone);
});
const BY_ZONE = new Map(ZONES.map((z) => [z, changes(z)]));
const ms = (i: Instant | undefined) => (i ? i.epochMilliseconds : null);

describe('DzGrid’s core and tzslot read the same clocks', () => {
  it('finds the clock-change days it sweeps (Paris twice a year, Apia’s lost day, none in UTC or Kolkata)', () => {
    expect(BY_ZONE.get('Europe/Paris')!.filter((d) => d.startsWith('2026'))).toEqual(['2026-03-29', '2026-10-25']);
    expect(BY_ZONE.get('Pacific/Apia')).toContain('2011-12-30');
    expect(BY_ZONE.get('America/Sao_Paulo')).toContain('2018-11-04');
    expect(BY_ZONE.get('UTC')).toEqual([]);
    expect(BY_ZONE.get('Asia/Kolkata')).toEqual([]);
    expect([...BY_ZONE.values()].reduce((n, d) => n + d.length, 0)).toBeGreaterThan(300);
  });

  for (const zone of ZONES) {
    it(`${zone}: every wall minute of every clock-change day, the same case and the same instants`, () => {
      let swept = 0;
      for (const day of BY_ZONE.get(zone)!) {
        const date = Temporal.PlainDate.from(day);
        const b = zoneDayBounds(day, zone);
        // A day that never was (Apia, 2011-12-30): every wall time is skipped for the core; tzslot
        // 2.2.0 reads it as repeated, its two readings on the day before and the day after
        // (slots.js:26-28 compares the clock face, not the date: request T7). The moment field
        // greys such a day (isDateDisabled), so it cannot be typed or picked. When tzslot is
        // fixed this branch fails: remove it.
        const lost = b.from === b.to;
        const base = Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10));
        for (let m = 0; m < 1440; m++) {
          const time = new Temporal.PlainTime(Math.floor(m / 60), m % 60);
          const tz = resolveWallTime(date, time, zone);
          const early = resolveWall(base + m * MIN, zone, 'earlier');
          const late = resolveWall(base + m * MIN, zone, 'later');
          if (!early.ok || !late.ok) throw new Error(`${zone} ${day} ${m}: core refused`);
          const at = `${zone} ${day} ${time}`;
          if (lost) {
            expect(early.warning, at).toBe('wall-time-skipped');
            expect(tz.ambiguous && tz.instants.every((i) => i.toZonedDateTimeISO(zone).toPlainDate().toString() !== day), at).toBe(true);
          } else if (!tz.exists) {
            expect(early.warning, at).toBe('wall-time-skipped');
            // tzslot moves a skipped time later: the core's 'later' reading is that moment.
            const moved = date.toPlainDateTime(time).toZonedDateTime(zone, { disambiguation: 'later' }).epochMilliseconds;
            expect(late.value, at).toBe(moved);
          } else if (tz.ambiguous) {
            expect(early.warning, at).toBe('wall-time-ambiguous');
            expect([early.value, late.value], at).toEqual([ms(tz.instants[0]), ms(tz.instants[1])]);
          } else {
            expect(early.warning, at).toBeUndefined();
            expect(early.value, at).toBe(ms(tz.instants[0]));
          }
          swept++;
        }
      }
      expect(swept).toBe(BY_ZONE.get(zone)!.length * 1440);
    }, 120_000);

    it(`${zone}: offsets, day starts and instant→day agree (clock-change days and every 37th day)`, () => {
      const sample = [...new Set([...BY_ZONE.get(zone)!, ...ALL.filter((_, i) => i % 37 === 0)])];
      for (const day of sample) {
        const b = zoneDayBounds(day, zone);
        const start = (d: Day) => Temporal.PlainDate.from(d).toZonedDateTime({ timeZone: zone }).epochMilliseconds;
        expect(b.from, `${zone} ${day} start`).toBe(Math.min(start(day), start(addDays(day, 1)!)));
        expect(b.to, `${zone} ${day} end`).toBe(start(addDays(day, 1)!));
        for (let t = b.from - 2 * 3_600_000; t < b.to + 2 * 3_600_000; t += 15 * MIN) {
          const zdt = Temporal.Instant.fromEpochMilliseconds(t).toZonedDateTimeISO(zone);
          expect(offsetAt(t, zone), `${zone} offset at ${t}`).toBe(zdt.offsetNanoseconds / 1e6);
          expect(instantToDayIn(t as never, zone), `${zone} day of ${t}`).toBe(zdt.toPlainDate().toString());
        }
        // dayAt: the day and the instant it ends.
        const at = dayAt(b.from, zone);
        if (b.to > b.from) expect(at, `${zone} dayAt ${day}`).toEqual({ day, until: b.to });
      }
    }, 120_000);
  }
});

describe('the six shortcuts mean what tzslot’s presetRange means', () => {
  const TODAYS = [
    ...days('2026-01-01' as Day, '2026-12-31' as Day),
    '2024-02-28', '2024-02-29', '2024-03-01', '2024-03-31', '2023-03-01', '2025-01-01', '2025-12-31', '2000-02-29', '2100-03-01', '2010-01-01', '2030-12-31',
  ] as Day[];
  it('for every today of 2026 and the month, leap and year edges', () => {
    expect(RELATIVE_RANGES.size).toBe(6);
    for (const today of TODAYS) {
      for (const range of RELATIVE_RANGES) {
        const theirs = presetRange(range, { today: Temporal.PlainDate.from(today) });
        expect(relativeDays(range, today), `${range} from ${today}`).toEqual({ from: theirs.start.toString(), to: theirs.end.toString() });
      }
    }
  });
});
