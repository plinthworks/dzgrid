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

// YYYY-MM-DDTHH:mm, optional :ss and fraction, then Z or ±HH:mm (or nothing).
const ISO = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,9}))?)?(Z|[+-]\d{2}:?\d{2})?$/i;

export type InstantReading =
  | { readonly ok: true; readonly value: InstantMs }
  | { readonly ok: false; readonly code: 'invalid-instant' | 'ambiguous-instant' };

/**
 * Reads a moment from a finite epoch-millisecond number or an ISO string with
 * its offset. With `wallToInstant` — a zone's resolver, see `zone-day.ts` — an
 * offset-less string is read in that zone instead of being refused.
 */
export function readInstant(
  v: unknown,
  wallToInstant?: (wallMs: number) => InstantMs,
): InstantReading {
  if (typeof v === 'number') {
    return Number.isFinite(v) ? { ok: true, value: v as InstantMs } : { ok: false, code: 'invalid-instant' };
  }
  if (typeof v !== 'string') return { ok: false, code: 'invalid-instant' };
  const m = ISO.exec(v.trim());
  if (!m) return { ok: false, code: 'invalid-instant' };

  const [y, mo, d, h, mi] = [m[1], m[2], m[3], m[4], m[5]].map(Number) as [number, number, number, number, number];
  const s = m[6] === undefined ? 0 : Number(m[6]);
  const frac = m[7] === undefined ? 0 : Math.floor(Number(`0.${m[7]}`) * 1000);
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo) || h > 23 || mi > 59 || s > 59) {
    return { ok: false, code: 'invalid-instant' };
  }
  const wall = civilToEpochDay(y, mo, d) * MS_PER_DAY + h * 3_600_000 + mi * 60_000 + s * 1000 + frac;

  const zone = m[8];
  if (zone === undefined) {
    return wallToInstant ? { ok: true, value: wallToInstant(wall) } : { ok: false, code: 'ambiguous-instant' };
  }
  if (zone.toUpperCase() === 'Z') return { ok: true, value: wall as InstantMs };
  const sign = zone[0] === '-' ? -1 : 1;
  const digits = zone.slice(1).replace(':', '');
  const oh = Number(digits.slice(0, 2));
  const om = Number(digits.slice(2, 4));
  if (oh > 23 || om > 59) return { ok: false, code: 'invalid-instant' };
  return { ok: true, value: (wall - sign * (oh * 3_600_000 + om * 60_000)) as InstantMs };
}

/** The moment, or null — see {@link readInstant} for why. */
export function parseInstant(v: unknown): InstantMs | null {
  const r = readInstant(v);
  return r.ok ? r.value : null;
}
