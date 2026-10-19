import { problem, type Problem } from '../problems.js';
import { parseDay, type Day } from '../value/day.js';
import { readInstant, type InstantMs } from '../value/instant.js';
import { dayAt, relativeDays } from '../value/relative.js';
import { zoneDayBounds } from '../value/zone-day.js';
import { RELATIVE_RANGES, type InstantFilter, type RelativeRange } from './model.js';

/**
 * The span an instant filter keeps: `[from, to)`, start in, end out, with
 * null for an open end. *After* a moment starts one millisecond later — the
 * grid's instants are whole milliseconds — so every range is half-open. Computed once,
 * from `zoneDayBounds` for days, so a 23- or 25-hour day is the right length
 * and the server can receive the bounds already resolved.
 */
export interface InstantRange {
  /** Inclusive start, or null for no start. */
  readonly from: number | null;
  /** Exclusive end, or null for no end. Finite numbers and null only: the range travels as JSON. */
  readonly to: number | null;
}

const day = (v: unknown, path: string, problems: Problem[]): Day | null | undefined => {
  if (v === undefined) return undefined;
  const d = parseDay(v);
  if (!d) problems.push(problem('invalid-day', 'error', path));
  return d;
};
const at = (v: unknown, path: string, problems: Problem[]): InstantMs | null | undefined => {
  if (v === undefined) return undefined;
  const r = readInstant(v);
  if (!r.ok) {
    problems.push(problem(r.code === 'ambiguous-instant' ? 'ambiguous-instant' : 'invalid-instant', 'error', path));
    return null;
  }
  return r.value;
};

/**
 * A shortcut's two days (both in), counted from the day `now` falls on in
 * `zone` (docs/behaviors/filter-relative.md); null with its problem: an
 * unknown name at `.range`, no clock (or one past the years a Day can write).
 */
export function relativeOf(range: unknown, zone: string, now: number | undefined, path: string, problems: Problem[]): { readonly from: Day; readonly to: Day } | null {
  if (!RELATIVE_RANGES.has(range as RelativeRange)) {
    problems.push(problem('invalid-filter', 'error', `${path}.range`));
    return null;
  }
  const today = now === undefined ? null : dayAt(now, zone);
  const days = today && relativeDays(range as RelativeRange, today.day);
  if (!days) problems.push(problem('invalid-filter', 'error', path, 'no clock'));
  return days;
}

/**
 * The range for an instant filter in `zone`, or null when the filter is
 * inactive (half-typed) or wrong (with a problem). `blank` and `notBlank`
 * have no range; the compiled filter handles them. A shortcut (`relative`)
 * reads `now`, and gives its `days` too.
 */
export function resolveInstantRange(f: InstantFilter, zone: string, path = 'filter', now?: number): { range: InstantRange | null; problems: readonly Problem[]; days?: { readonly from: Day; readonly to: Day } } {
  const problems: Problem[] = [];
  if (f.op === 'relative') {
    // A shortcut is betweenDays on the days it names now: the whole days, 23 or 25 hours on a change.
    const days = relativeOf(f.range, zone, now, path, problems);
    return days ? { range: { from: zoneDayBounds(days.from, zone).from, to: zoneDayBounds(days.to, zone).to }, problems, days } : { range: null, problems };
  }
  const d1 = day(f.day, `${path}.day`, problems);
  const d2 = day(f.dayTo, `${path}.dayTo`, problems);
  const a1 = at(f.at, `${path}.at`, problems);
  const a2 = at(f.atTo, `${path}.atTo`, problems);
  if (problems.length) return { range: null, problems };

  switch (f.op) {
    case 'onDay': {
      if (!d1) return { range: null, problems };
      const b = zoneDayBounds(d1, zone);
      return { range: { from: b.from, to: b.to }, problems };
    }
    case 'betweenDays': {
      if (!d1 || !d2) return { range: null, problems };
      const [lo, hi] = d1 <= d2 ? [d1, d2] : [d2, d1];
      return { range: { from: zoneDayBounds(lo, zone).from, to: zoneDayBounds(hi, zone).to }, problems };
    }
    case 'before': {
      if (a1 != null) return { range: { from: null, to: a1 }, problems };
      if (d1) return { range: { from: null, to: zoneDayBounds(d1, zone).from }, problems };
      return { range: null, problems };
    }
    case 'after': {
      if (a1 != null) return { range: { from: Math.floor(a1) + 1, to: null }, problems };
      if (d1) return { range: { from: zoneDayBounds(d1, zone).to, to: null }, problems };
      return { range: null, problems };
    }
    case 'between': {
      if (a1 == null || a2 == null) return { range: null, problems };
      const [lo, hi] = a1 <= a2 ? [a1, a2] : [a2, a1];
      return { range: { from: lo, to: hi }, problems };
    }
    default:
      return { range: null, problems };
  }
}
