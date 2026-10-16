import { civilToEpochDay, daysInMonth } from './day.js';

/**
 * A moment: milliseconds since 1970-01-01T00:00:00Z, the same everywhere.
 *
 * A wall time written without an offset — `2026-03-05T10:00` — is not one: it
 * names a different moment in every zone, and guessing which is how a grid
 * shows a log entry an hour off. Such a string is refused as ambiguous unless
 * the caller says, explicitly, which zone it was written in.
 */

declare const instantBrand: unique symbol;
export type InstantMs = number & { readonly [instantBrand]: true };

const MS_PER_DAY = 86_400_000;
/** ±100 000 000 days around the epoch: what any clock — `Intl` included — can represent. */
export const MAX_INSTANT = 8.64e15;
const inRange = (ms: number): boolean => Math.abs(ms) <= MAX_INSTANT;

// YYYY-MM-DDTHH:mm, optional :ss and fraction, then Z or ±HH:mm (or nothing).
const ISO = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,9}))?)?(Z|[+-]\d{2}:?\d{2})?$/i;

export type InstantReading =
  | { readonly ok: true; readonly value: InstantMs }
  | { readonly ok: false; readonly code: 'invalid-instant' | 'ambiguous-instant' };

/**
 * Reads a moment from a finite epoch-millisecond number or an ISO string with
 * its offset. With `wallToInstant` — a zone's resolver, see `zone-day.ts` — an
 * offset-less string is read in that zone instead of being refused; how a wall
 * time inside a clock change resolves is that resolver's choice.
 *
 * Refused: hour 24, minute or second 60 (a leap second has no epoch
 * millisecond), offsets of 24 hours or more, and anything outside ±8.64e15 ms.
 */
export function readInstant(
  v: unknown,
  wallToInstant?: (wallMs: number) => InstantMs,
): InstantReading {
  if (typeof v === 'number') {
    // Beyond the range, every formatter throws later; refused here instead.
    return Number.isFinite(v) && inRange(v) ? { ok: true, value: v as InstantMs } : { ok: false, code: 'invalid-instant' };
  }
  if (typeof v !== 'string') return { ok: false, code: 'invalid-instant' };
  const m = ISO.exec(v.trim());
  if (!m) return { ok: false, code: 'invalid-instant' };

  const [y, mo, d, h, mi] = [m[1], m[2], m[3], m[4], m[5]].map(Number) as [number, number, number, number, number];
  const s = m[6] === undefined ? 0 : Number(m[6]);
  // Digits, not a float: the first three are the milliseconds, the rest is dropped.
  const frac = m[7] === undefined ? 0 : Number(m[7].padEnd(3, '0').slice(0, 3));
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo) || h > 23 || mi > 59 || s > 59) {
    return { ok: false, code: 'invalid-instant' };
  }
  const wall = civilToEpochDay(y, mo, d) * MS_PER_DAY + h * 3_600_000 + mi * 60_000 + s * 1000 + frac;

  const zone = m[8];
  if (zone === undefined) {
    if (!wallToInstant) return { ok: false, code: 'ambiguous-instant' };
    return checked(wallToInstant(wall));
  }
  if (zone.toUpperCase() === 'Z') return checked(wall);
  const sign = zone[0] === '-' ? -1 : 1;
  const digits = zone.slice(1).replace(':', '');
  const oh = Number(digits.slice(0, 2));
  const om = Number(digits.slice(2, 4));
  if (oh > 23 || om > 59) return { ok: false, code: 'invalid-instant' };
  return checked(wall - sign * (oh * 3_600_000 + om * 60_000));
}

const checked = (ms: number): InstantReading =>
  Number.isFinite(ms) && inRange(ms) ? { ok: true, value: ms as InstantMs } : { ok: false, code: 'invalid-instant' };

/** The moment, or null — see {@link readInstant} for why. */
export function parseInstant(v: unknown): InstantMs | null {
  const r = readInstant(v);
  return r.ok ? r.value : null;
}
