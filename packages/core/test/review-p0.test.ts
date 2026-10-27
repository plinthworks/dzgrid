import { describe, it, expect } from 'vitest';
import { readInstant, parseInstant, assignKeys, addDays, epochDayToDay, parseDay, instantToDayIn, isKnownZone, offsetAt, zoneDayBounds, pinnedKey, dayToEpochDay, type InstantMs } from '@dzgrid/core';

/** Findings of the Phase 0 code review, each pinned by a test that failed first. */

const pad3 = (n: number) => String(n).padStart(3, '0');

describe('fractions of a second', () => {
  it('reads every millisecond exactly, without floating-point loss', () => {
    // 0.005 * 1000 is 4.999…, which a floor turned into 4.
    for (let i = 0; i < 1000; i++) {
      expect(parseInstant(`1970-01-01T00:00:00.${pad3(i)}Z`)).toBe(i);
      expect(parseInstant(`1969-12-31T23:59:59.${pad3(i)}Z`)).toBe(i - 1000);
    }
  });
});

describe('instants a clock can show', () => {
  it('refuses a number beyond the ECMAScript time range instead of crashing later', () => {
    expect(readInstant(8.64e15 + 1)).toEqual({ ok: false, code: 'invalid-instant' });
    expect(readInstant(-8.64e15 - 1)).toEqual({ ok: false, code: 'invalid-instant' });
    expect(readInstant(1e300)).toEqual({ ok: false, code: 'invalid-instant' });
  });

  it('never throws on an instant it accepted', () => {
    for (const v of [8.64e15, -8.64e15]) {
      const r = readInstant(v);
      expect(r.ok).toBe(true);
      // Years 275760 and -271821 cannot be written as a Day: no day, but no crash.
      expect(() => instantToDayIn(v as InstantMs, 'UTC')).not.toThrow();
      expect(instantToDayIn(v as InstantMs, 'UTC')).toBeNull();
      expect(() => offsetAt(v, 'Europe/Paris')).not.toThrow();
    }
  });

  it('puts a fractional negative instant on the day it belongs to', () => {
    expect(instantToDayIn(-0.5 as InstantMs, 'UTC')).toBe('1969-12-31');
  });

  it('documents the offsets it reads and refuses', () => {
    expect(parseInstant('1970-01-01T00:00-00:00')).toBe(0);
    expect(parseInstant('1970-01-01T05:30+0530')).toBe(0);
    expect(readInstant('1970-01-01T00:00+24:00')).toEqual({ ok: false, code: 'invalid-instant' });
    expect(readInstant('1970-01-01T23:60Z')).toEqual({ ok: false, code: 'invalid-instant' });
    // A leap second is not representable in epoch milliseconds.
    expect(readInstant('2016-12-31T23:59:60Z')).toEqual({ ok: false, code: 'invalid-instant' });
  });
});

describe('sparse id lists', () => {
  it('keeps one key slot per row, holes included', () => {
    // eslint-disable-next-line no-sparse-arrays
    const { keys, problems } = assignKeys([1, , 3]);
    expect(keys).toHaveLength(3);
    expect(keys[1]).toBeNull();
    expect(problems.map((p) => [p.code, p.path])).toEqual([['invalid-row-id', 'rows[1]']]);
  });
});

describe('days at the ends of the range', () => {
  it('gives no day rather than throwing past 9999-12-31 or before 0000-01-01', () => {
    expect(addDays(parseDay('9999-12-31')!, 1)).toBeNull();
    expect(addDays(parseDay('0000-01-01')!, -1)).toBeNull();
    expect(epochDayToDay(dayToEpochDay(parseDay('9999-12-31')!) + 1)).toBeNull();
  });

  it('refuses a step that is not a whole number of days, as a programming error', () => {
    expect(() => addDays(parseDay('2026-03-05')!, 0.5)).toThrow(RangeError);
    expect(() => addDays(parseDay('2026-03-05')!, Number.NaN)).toThrow(RangeError);
  });
});

describe('zones', () => {
  it('does not take a missing zone for the machine zone', () => {
    // Intl reads `timeZone: undefined` as "wherever this runs" — the very
    // nondeterminism the timezone runs exist to catch.
    expect(isKnownZone(undefined as unknown as string)).toBe(false);
    expect(isKnownZone('')).toBe(false);
    expect(() => zoneDayBounds(parseDay('2026-03-05')!, undefined as unknown as string)).toThrow(RangeError);
  });

  it('starts every day on its first instant, in every zone, 2010–2030', () => {
    const zones = ['Europe/Paris', 'Europe/Dublin', 'America/Los_Angeles', 'America/Sao_Paulo', 'America/Havana', 'Pacific/Apia', 'Australia/Lord_Howe', 'Asia/Kolkata', 'Africa/Algiers', 'Pacific/Auckland', 'Asia/Tehran', 'Pacific/Chatham'];
    const first = dayToEpochDay(parseDay('2010-01-01')!);
    const last = dayToEpochDay(parseDay('2030-12-31')!);
    const wrong: string[] = [];
    for (const zone of zones) {
      for (let n = first; n <= last; n++) {
        const day = epochDayToDay(n)!;
        const { from, to } = zoneDayBounds(day, zone);
        if (from === to) continue; // a day the zone skipped
        if (instantToDayIn(from, zone) !== day || instantToDayIn((from - 1000) as InstantMs, zone) === day) {
          wrong.push(`${zone} ${day}`);
        }
      }
    }
    expect(wrong).toEqual([]);
  }, 120_000);
});

describe('pinned keys', () => {
  // Phase 6 step 8b-1: keyed by the row's id (pinned-ids.test.ts), no longer by its position: a number is an id.
  it('refuses an id that identifies nothing (null), never throws', () => {
    for (const i of [Number.NaN, Infinity, '']) expect(pinnedKey('top', i)).toBeNull();
    expect(pinnedKey('top', -1)).toBe('p:t:2:-1');
  });
});
