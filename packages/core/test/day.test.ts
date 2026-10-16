import { describe, it, expect } from 'vitest';
import { parseDay, dayToEpochDay, epochDayToDay, addDays, compareDays, type Day } from '@dzgrid/core';

const day = (s: string) => parseDay(s)!;

describe('parseDay', () => {
  it('accepts a real day and keeps it as written', () => {
    expect(parseDay('2026-03-05')).toBe('2026-03-05');
    expect(parseDay('2024-02-29')).toBe('2024-02-29');
    expect(parseDay('2000-02-29')).toBe('2000-02-29');
  });

  it('refuses what is not a day, rather than rolling it over', () => {
    for (const s of ['2026-02-29', '1900-02-29', '2026-02-31', '2026-13-01', '2026-00-10', '2026-04-31', '26-03-05', '2026-3-5', '2026-03-05T00:00Z', ' 2026-03-05', '']) {
      expect(parseDay(s), s).toBeNull();
    }
    for (const v of [null, undefined, 20260305, {}]) expect(parseDay(v)).toBeNull();
  });
});

describe('day arithmetic', () => {
  it('round-trips every day across four centuries, leap rules included', () => {
    // 1900 is not a leap year, 2000 is: a 400-year span crosses both rules.
    for (let n = dayToEpochDay(day('1899-12-25')); n < dayToEpochDay(day('2300-01-05')); n += 1) {
      const d = epochDayToDay(n)!;
      expect(parseDay(d), d).toBe(d);
      expect(dayToEpochDay(d)).toBe(n);
    }
  });

  it('crosses month and year ends', () => {
    expect(addDays(day('2026-02-28'), 1)).toBe('2026-03-01');
    expect(addDays(day('2024-02-28'), 1)).toBe('2024-02-29');
    expect(addDays(day('2026-12-31'), 1)).toBe('2027-01-01');
    expect(addDays(day('2026-01-01'), -1)).toBe('2025-12-31');
  });

  it('orders days as their strings do', () => {
    const days: Day[] = ['2026-03-05', '1999-12-31', '2026-03-04'].map(day);
    expect(days.sort(compareDays)).toEqual(['1999-12-31', '2026-03-04', '2026-03-05']);
  });

  it('gives no day for a year it cannot write', () => {
    expect(epochDayToDay(dayToEpochDay(day('9999-12-31')) + 1)).toBeNull();
  });
});
