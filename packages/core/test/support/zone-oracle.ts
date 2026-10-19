/**
 * A test-only zone oracle, independent of the core's zone-day.ts: its own
 * Intl reader, Date.UTC for day arithmetic, and a binary search for the first
 * instant of a day (smallest t whose local date is on or after the day).
 */
const fmts = new Map<string, Intl.DateTimeFormat>();
const fmt = (zone: string): Intl.DateTimeFormat => {
  let f = fmts.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
    fmts.set(zone, f);
  }
  return f;
};
const parts = (t: number, zone: string) => {
  const o: Record<string, number> = {};
  for (const p of fmt(zone).formatToParts(t)) if (p.type !== 'literal') o[p.type] = Number(p.value);
  return o as { year: number; month: number; day: number; hour: number; minute: number; second: number };
};
const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** YYYY-MM-DD on the zone's clocks at `t`. */
export function localDate(t: number, zone: string): string {
  const p = parts(t, zone);
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`;
}

/** The zone's offset at `t`, in seconds (wall minus UTC). */
export function offsetAt(t: number, zone: string): number {
  const p = parts(Math.floor(t / 1000) * 1000, zone);
  return (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(t / 1000) * 1000) / 1000;
}

export function addDaysUtc(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** The first instant (ms) at which the zone's date is `day` or later. */
export function startOfDay(day: string, zone: string): number {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const base = Date.UTC(y, m - 1, d);
  let lo = base - 2 * 86_400_000; // local date surely before
  let hi = base + 2 * 86_400_000; // surely on or after
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (localDate(mid, zone) >= day) hi = mid;
    else lo = mid;
  }
  return hi;
}

/** The days from..to (inclusive) that exist in the zone. */
export function zoneDays(from: string, to: string, zone: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDaysUtc(d, 1)) if (startOfDay(d, zone) < startOfDay(addDaysUtc(d, 1), zone)) out.push(d);
  return out;
}
