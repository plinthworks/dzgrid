import { RELATIVE_RANGES, type RelativeRange } from '../filter/model.js';
import { addDays, daysInMonth, type Day } from './day.js';
import type { InstantMs } from './instant.js';
import { instantToDayIn, zoneDayBounds } from './zone-day.js';

/**
 * The two days a shortcut names, both in, counted from `today`
 * (docs/behaviors/filter-relative.md; tzslot's `presetRange`): last 7 days is
 * six days back and today, a month is whole. Day arithmetic only. Null for a
 * name not in the six, or past the years a Day can write.
 */
export function relativeDays(range: RelativeRange, today: Day): { readonly from: Day; readonly to: Day } | null {
  if (!RELATIVE_RANGES.has(range)) return null;
  const y = +today.slice(0, 4);
  const m = +today.slice(5, 7);
  // The first and the last day of a month counted back from today's (0 is this one).
  const month = (back: number): { from: Day; to: Day } | null => {
    const mm = m - back || 12;
    const yy = mm > m ? y - 1 : y;
    if (yy < 0) return null;
    const p = `${String(yy).padStart(4, '0')}-${String(mm).padStart(2, '0')}-`;
    return { from: `${p}01` as Day, to: `${p}${daysInMonth(yy, mm)}` as Day };
  };
  if (range === 'thisMonth') return month(0);
  if (range === 'lastMonth') return month(1);
  const back = range === 'last7Days' ? 6 : range === 'last30Days' ? 29 : 0;
  const to = range === 'yesterday' ? addDays(today, -1) : today;
  const from = to && addDays(to, -back);
  return from && to ? { from, to } : null;
}

/** The day `now` falls on in `zone`, and the instant it ends (when a shortcut's days move); null in a year a Day cannot write. */
export function dayAt(now: number, zone: string): { readonly day: Day; readonly until: number } | null {
  const day = instantToDayIn(now as InstantMs, zone);
  return day && { day, until: zoneDayBounds(day, zone).to };
}
