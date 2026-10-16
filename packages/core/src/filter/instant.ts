import { problem, type Problem } from '../problems.js';
import { parseDay, type Day } from '../value/day.js';
import { readInstant, type InstantMs } from '../value/instant.js';
import { zoneDayBounds } from '../value/zone-day.js';
import type { InstantFilter } from './model.js';

/**
 * The span an instant filter keeps: `[from, to)`, start in, end out — or
 * `(from, to)` when the start is exclusive (*after* a moment). Computed once,
 * from `zoneDayBounds` for days, so a 23- or 25-hour day is the right length
 * and the server can receive the bounds already resolved.
 */
export interface InstantRange {
  readonly from: number;
  readonly to: number;
  readonly fromExclusive?: boolean;
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
 * The range for an instant filter in `zone`, or null when the filter is
 * inactive (half-typed) or wrong (with a problem). `blank` and `notBlank`
 * have no range; the compiled filter handles them.
 */
export function resolveInstantRange(f: InstantFilter, zone: string, path = 'filter'): { range: InstantRange | null; problems: readonly Problem[] } {
  const problems: Problem[] = [];
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
      if (a1 != null) return { range: { from: -Infinity, to: a1 }, problems };
      if (d1) return { range: { from: -Infinity, to: zoneDayBounds(d1, zone).from }, problems };
      return { range: null, problems };
    }
    case 'after': {
      if (a1 != null) return { range: { from: a1, to: Infinity, fromExclusive: true }, problems };
      if (d1) return { range: { from: zoneDayBounds(d1, zone).to, to: Infinity }, problems };
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
