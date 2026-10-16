import { civilToEpochDay, dayToEpochDay, epochDayToDay, type Day } from './day.js';
import type { InstantMs } from './instant.js';

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
  for (const p of formatterFor(zone).formatToParts(instant)) {
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

/** The calendar day an instant falls on, in `zone`. */
export function instantToDayIn(instant: InstantMs, zone: string): Day {
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
 */
export function zoneDayBounds(day: Day, zone: string): { readonly from: InstantMs; readonly to: InstantMs } {
  const n = dayToEpochDay(day);
  return {
    from: firstInstantOf(n, zone) as InstantMs,
    to: firstInstantOf(n + 1, zone) as InstantMs,
  };
}
