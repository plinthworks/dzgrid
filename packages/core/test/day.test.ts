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

describe('parseDay, read by characters', () => {
  // The regular-expression version it replaced, kept as the reference.
  const reference = (s: unknown): string | null => {
    if (typeof s !== 'string') return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return null;
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    const dim = mo === 2 ? (leap ? 29 : 28) : [4, 6, 9, 11].includes(mo) ? 30 : 31;
    return mo < 1 || mo > 12 || d < 1 || d > dim ? null : s;
  };

  it('agrees with the reference on 200 000 seeded strings, valid or not', () => {
    let seed = 99;
    const next = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const chars = '0123456789-/ a٥';
    for (let i = 0; i < 200_000; i++) {
      let s: string;
      if (next() < 0.7) {
        const y = String(Math.floor(next() * 10000)).padStart(4, '0');
        s = `${y}-${String(Math.floor(next() * 14)).padStart(2, '0')}-${String(Math.floor(next() * 33)).padStart(2, '0')}`;
      } else {
        s = Array.from({ length: 8 + Math.floor(next() * 4) }, () => chars[Math.floor(next() * chars.length)]).join('');
      }
      if (parseDay(s) !== reference(s)) throw new Error(`disagree on ${JSON.stringify(s)}`);
    }
    expect(parseDay('2026-03-05')).toBe('2026-03-05');
  });
});
