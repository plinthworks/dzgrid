import { describe, it, expect } from 'vitest';
import { readInstant, parseInstant } from '@dzgrid/core';

describe('readInstant', () => {
  it('reads an ISO string with its offset', () => {
    expect(parseInstant('1970-01-01T00:00:00Z')).toBe(0);
    expect(parseInstant('2026-03-05T10:00:00.000Z')).toBe(1772704800000);
    expect(parseInstant('2026-03-05T11:00:00+01:00')).toBe(1772704800000);
    expect(parseInstant('2026-03-05T05:30-04:30')).toBe(1772704800000);
    expect(parseInstant('2026-03-05T15:30:00+0530')).toBe(1772704800000);
  });

  it('keeps the milliseconds and drops what lies beyond them', () => {
    expect(parseInstant('1970-01-01T00:00:00.123Z')).toBe(123);
    expect(parseInstant('1970-01-01T00:00:00.123456789Z')).toBe(123);
  });

  it('reads a finite epoch number as it is', () => {
    expect(parseInstant(1772704800000)).toBe(1772704800000);
    expect(parseInstant(-1)).toBe(-1);
  });

  it('refuses a wall time without an offset as ambiguous, not as UTC or local', () => {
    expect(readInstant('2026-03-05T10:00')).toEqual({ ok: false, code: 'ambiguous-instant' });
    expect(readInstant('2026-03-05 10:00:00')).toEqual({ ok: false, code: 'ambiguous-instant' });
  });

  it('reads it in a zone only when told which', () => {
    // A fixed +01:00 resolver stands in for a real zone here.
    const plusOne = (wall: number) => (wall - 3_600_000) as never;
    expect(readInstant('2026-03-05T11:00', plusOne)).toEqual({ ok: true, value: 1772704800000 });
  });

  it('refuses what is not a moment', () => {
    for (const v of ['2026-03-05', '2026-02-30T10:00Z', '2026-03-05T24:00Z', '2026-03-05T10:60Z', '2026-03-05T10:00+25:00', 'soon', '', NaN, Infinity, null, undefined, {}]) {
      expect(readInstant(v), String(v)).toEqual({ ok: false, code: 'invalid-instant' });
    }
  });
});
