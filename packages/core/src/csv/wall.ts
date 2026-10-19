import { epochDayToDay } from '../value/day.js';
import { offsetAt } from '../value/zone-day.js';

const DAY = 86_400_000;
/** Offsets are read once per six hours when they hold across them: a clock never changes twice in six hours. */
const SPAN = 21_600_000;
const two = (n: number): string => (n < 10 ? '0' : '') + n;

/**
 * An instant as the wall clock in `zone` showed it, `YYYY-MM-DD HH:mm:ss`
 * (milliseconds dropped), or null outside the years a day can write. In a
 * repeated hour two instants read the same: `instants: 'iso'` is exact.
 */
export function wallWriter(zone: string): (ms: number) => string | null {
  const known = new Map<number, number>();
  return (ms) => {
    const s = Math.floor(ms / 1000) * 1000;
    const b = Math.floor(s / SPAN);
    let off = known.get(b);
    if (off === undefined) {
      off = offsetAt(b * SPAN, zone);
      if (off !== offsetAt(b * SPAN + SPAN - 1000, zone)) off = Number.NaN;
      known.set(b, off);
    }
    const w = s + (Number.isNaN(off) ? offsetAt(s, zone) : off);
    const day = Math.floor(w / DAY);
    const d = epochDayToDay(day);
    const t = (w - day * DAY) / 1000;
    return d && `${d} ${two(Math.floor(t / 3600))}:${two(Math.floor(t / 60) % 60)}:${two(t % 60)}`;
  };
}
