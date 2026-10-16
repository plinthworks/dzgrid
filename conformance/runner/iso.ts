import { addDays, parseDay } from '@dzgrid/core';

/**
 * ISO for an instant, written without Date. Milliseconds appear whenever they
 * are not zero, so a bound off by half a second cannot pass as `…:00Z`.
 */
export function iso(ms: number): string {
  if (!Number.isInteger(ms)) throw new Error(`not a whole millisecond: ${ms}`);
  const day = Math.floor(ms / 86_400_000);
  const rest = ms - day * 86_400_000;
  const d = addDays(parseDay('1970-01-01')!, day);
  if (d === null) throw new Error(`outside the years 0000–9999: ${ms}`);
  const h = Math.floor(rest / 3_600_000);
  const m = Math.floor((rest % 3_600_000) / 60_000);
  const s = Math.floor((rest % 60_000) / 1000);
  const frac = rest % 1000;
  return `${d}T${[h, m, s].map((n) => String(n).padStart(2, '0')).join(':')}${frac ? `.${String(frac).padStart(3, '0')}` : ''}Z`;
}
