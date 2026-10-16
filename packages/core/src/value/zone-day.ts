import { civilToEpochDay, dayToEpochDay, epochDayToDay, type Day } from './day.js';
import type { InstantMs } from './instant.js';

/** How to read a wall time that a clock change skipped or repeated. Same names as Temporal's. */
export type Disambiguation = 'compatible' | 'earlier' | 'later' | 'reject';

export type WallResolution =
  | { readonly ok: true; readonly value: InstantMs; readonly warning?: 'wall-time-skipped' | 'wall-time-ambiguous' }
  | { readonly ok: false; readonly code: 'unknown-zone' | 'wall-time-skipped' | 'wall-time-ambiguous' };

/**
 * Where a calendar day begins and ends in a time zone.
 *
 * A day is not always 24 hours: 23 or 25 across a clock change, 24.5 on Lord
 * Howe Island, and in São Paulo on 2018-11-04 it began at 01:00 because
 * midnight never happened. Samoa skipped 2011-12-30 entirely. Filtering
 * "rows of the 5th" against timestamps needs the real bounds, computed once,
 * not midnight-plus-24-hours.
 *
 * Only `Intl.DateTimeFormat` with `timeZone` is used: no `Date`, no Temporal.
 * Precision is the second, which is what zone offsets are expressed in.
 */

const MS_PER_DAY = 86_400_000;
const HOUR = 3_600_000;

const formatters = new Map<string, Intl.DateTimeFormat>();

/** The zone's wall-clock reader, built once per zone. Throws RangeError for an unknown zone. */
function formatterFor(zone: string): Intl.DateTimeFormat {
  // Intl reads a missing zone as "wherever this runs": never what a caller meant.
  if (typeof zone !== 'string' || zone === '') throw new RangeError(`not a time zone: ${String(zone)}`);
  let f = formatters.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
      timeZone: zone,
      hourCycle: 'h23',
      era: 'short',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatters.set(zone, f);
  }
  return f;
}

/** True when the zone is one this engine knows. */
export function isKnownZone(zone: string): boolean {
  try {
    formatterFor(zone);
    return true;
  } catch {
    return false;
  }
}

/** The wall clock in `zone` at an instant, as milliseconds of a UTC-labelled day count. */
function wallAt(instant: number, zone: string): number {
  let y = 0;
  let mo = 0;
  let d = 0;
  let h = 0;
  let mi = 0;
  let s = 0;
  let bc = false;
  // Intl truncates toward zero; a fraction of a millisecond before the epoch belongs to the day before.
  for (const p of formatterFor(zone).formatToParts(Math.floor(instant))) {
    switch (p.type) {
      case 'year': y = Number(p.value); break;
      case 'month': mo = Number(p.value); break;
      case 'day': d = Number(p.value); break;
      case 'hour': h = Number(p.value); break;
      case 'minute': mi = Number(p.value); break;
      case 'second': s = Number(p.value); break;
      case 'era': bc = p.value.startsWith('B'); break;
    }
  }
  if (bc) y = 1 - y;
  // Some engines still print 24 for midnight despite h23.
  return civilToEpochDay(y, mo, d) * MS_PER_DAY + (h % 24) * HOUR + mi * 60_000 + s * 1000;
}

/** The zone's offset from UTC at an instant, in milliseconds (east positive). */
export function offsetAt(instant: number, zone: string): number {
  const second = Math.floor(instant / 1000) * 1000;
  return wallAt(second, zone) - second;
}

/** The calendar day an instant falls on, in `zone`; null in a year a `Day` cannot write. */
export function instantToDayIn(instant: InstantMs, zone: string): Day | null {
  return epochDayToDay(Math.floor(wallAt(instant, zone) / MS_PER_DAY));
}

const localEpochDay = (instant: number, zone: string): number => Math.floor(wallAt(instant, zone) / MS_PER_DAY);

/**
 * The first instant whose local day is `epochDay` or later.
 *
 * Usually local midnight under one of the offsets in force around it, so those
 * candidates are tried first. When midnight is skipped by a gap that does not
 * start at midnight, none of them is the boundary, and a search over the
 * surrounding hours finds it — local days only move forward over that span.
 */
function firstInstantOf(epochDay: number, zone: string): number {
  const utcMidnight = epochDay * MS_PER_DAY;
  const offsets = new Set<number>();
  for (const probe of [-36, -12, 0, 12, 36]) offsets.add(offsetAt(utcMidnight + probe * HOUR, zone));

  let best: number | null = null;
  for (const offset of offsets) {
    const t = utcMidnight - offset;
    if (localEpochDay(t, zone) >= epochDay && localEpochDay(t - 1000, zone) < epochDay) {
      if (best === null || t < best) best = t;
    }
  }
  if (best !== null) return best;

  // Bisection, to the second, between a moment surely before and one surely after.
  let lo = utcMidnight - 30 * HOUR;
  let hi = utcMidnight + 30 * HOUR;
  while (hi - lo > 1000) {
    const mid = Math.floor((lo + hi) / 2000) * 1000;
    if (localEpochDay(mid, zone) >= epochDay) hi = mid;
    else lo = mid;
  }
  return hi;
}

/**
 * Start (inclusive) and end (exclusive) of `day` in `zone`.
 *
 * A day that never happened in that zone gives `from === to`.
 *
 * Where clocks go back *across* midnight (00:30 back to 23:30), the previous
 * day's wall clock comes back after the next day began: an instant in that
 * repeated half hour lies inside the next day's bounds while
 * `instantToDayIn` names the previous day. Bounds follow the first time the
 * wall clock reaches each day. No zone in use does this today.
 */
export function zoneDayBounds(day: Day, zone: string): { readonly from: InstantMs; readonly to: InstantMs } {
  const n = dayToEpochDay(day);
  return {
    from: firstInstantOf(n, zone) as InstantMs,
    to: firstInstantOf(n + 1, zone) as InstantMs,
  };
}

/**
 * The instant at which `zone`'s clocks read `wall` (a wall time written as
 * milliseconds of a UTC-labelled day count).
 *
 * Most wall times name exactly one instant. Around a clock change one may
 * name none (skipped: 02:30 in Paris on the spring change) or two (repeated:
 * 02:30 on the autumn change). `compatible` reads a skipped time as if the
 * clock had not changed yet — it lands that much later — and a repeated time
 * as the first occurrence; `earlier` and `later` pick the other ways round;
 * `reject` refuses both. Whatever is picked, the reading carries a warning:
 * the instant was a choice, not a fact.
 *
 * An unknown zone is refused (`unknown-zone`): this is reached from data, and
 * guessing the machine's zone instead is the bug the zone runs exist to catch.
 */
export function resolveWall(wall: number, zone: string, disambiguation: Disambiguation = 'compatible'): WallResolution {
  if (!isKnownZone(zone)) return { ok: false, code: 'unknown-zone' };
  // The offsets in force around the wall time, read as if it were an instant:
  // within ±36 h of it, clocks change at most once in every zone in use.
  const before = offsetAt(wall - 36 * HOUR, zone);
  const after = offsetAt(wall + 36 * HOUR, zone);
  const offsets = new Set([before, after, offsetAt(wall - 12 * HOUR, zone), offsetAt(wall, zone), offsetAt(wall + 12 * HOUR, zone)]);
  const valid = [...offsets].map((o) => wall - o).filter((t) => wallAt(t, zone) === wall).sort((a, b) => a - b);

  if (valid.length === 1) return { ok: true, value: valid[0] as InstantMs };
  if (valid.length >= 2) {
    if (disambiguation === 'reject') return { ok: false, code: 'wall-time-ambiguous' };
    const t = disambiguation === 'later' ? valid[valid.length - 1]! : valid[0]!;
    return { ok: true, value: t as InstantMs, warning: 'wall-time-ambiguous' };
  }
  // Skipped: the clock jumped from `before` to `after` over this wall time.
  if (disambiguation === 'reject') return { ok: false, code: 'wall-time-skipped' };
  const t = disambiguation === 'earlier' ? wall - after : wall - before;
  return { ok: true, value: t as InstantMs, warning: 'wall-time-skipped' };
}
