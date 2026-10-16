/**
 * A calendar day: `YYYY-MM-DD`, in no time zone at all.
 *
 * A birth date, an expiry date, the day of an appointment as booked: none of
 * these is an instant, and turning one into an instant is how the "off by a
 * day" bug happens — midnight UTC is the previous evening west of Greenwich.
 * So a `Day` is a string, compared as a string, and its arithmetic is done on
 * whole days since 1970-01-01 with the proleptic Gregorian calendar. Nothing
 * here touches a clock or a zone.
 */

declare const dayBrand: unique symbol;
export type Day = string & { readonly [dayBrand]: true };

export const isLeapYear = (y: number): boolean => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

export function daysInMonth(y: number, m: number): number {
  return m === 2 ? (isLeapYear(y) ? 29 : 28) : [4, 6, 9, 11].includes(m) ? 30 : 31;
}

/** The digit at `i`, or −1. */
const digit = (s: string, i: number): number => {
  const c = s.charCodeAt(i) - 48;
  return c >= 0 && c <= 9 ? c : -1;
};

/**
 * A day, or null — `2026-02-31` is not one, and is not rolled into March.
 *
 * Read character by character rather than with a regular expression: a sort
 * of 100 000 days reads every one of them, and this is most of its cost.
 */
export function parseDay(s: unknown): Day | null {
  if (typeof s !== 'string' || s.length !== 10 || s.charCodeAt(4) !== 45 || s.charCodeAt(7) !== 45) return null;
  const y0 = digit(s, 0), y1 = digit(s, 1), y2 = digit(s, 2), y3 = digit(s, 3);
  const m0 = digit(s, 5), m1 = digit(s, 6), d0 = digit(s, 8), d1 = digit(s, 9);
  if ((y0 | y1 | y2 | y3 | m0 | m1 | d0 | d1) < 0) return null;
  const y = y0 * 1000 + y1 * 100 + y2 * 10 + y3;
  const mo = m0 * 10 + m1;
  const d = d0 * 10 + d1;
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
  return s as Day;
}

/**
 * Days since 1970-01-01, for a civil date. Exact for every year, with no
 * `Date` and no floating point: the year is shifted to start in March, so the
 * leap day falls at the end and each 400-year era has the same length.
 */
export function civilToEpochDay(y: number, m: number, d: number): number {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const mp = (m + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** The civil date of a day count — the inverse of {@link civilToEpochDay}. */
export function epochDayToCivil(n: number): { y: number; m: number; d: number } {
  const z = n + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return { y: yoe + era * 400 + (m <= 2 ? 1 : 0), m, d };
}

export function dayToEpochDay(day: Day): number {
  const y = digit(day, 0) * 1000 + digit(day, 1) * 100 + digit(day, 2) * 10 + digit(day, 3);
  return civilToEpochDay(y, digit(day, 5) * 10 + digit(day, 6), digit(day, 8) * 10 + digit(day, 9));
}

/**
 * The day `n` days after 1970-01-01, or null outside the years 0000–9999,
 * which a `Day` cannot write. A day count that is not an integer is a
 * programming error.
 */
export function epochDayToDay(n: number): Day | null {
  if (!Number.isInteger(n)) throw new RangeError(`not a whole number of days: ${n}`);
  const { y, m, d } = epochDayToCivil(n);
  if (y < 0 || y > 9999) return null;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` as Day;
}

/** `n` days later (or earlier), or null past the ends of the range. */
export const addDays = (day: Day, n: number): Day | null => {
  if (!Number.isInteger(n)) throw new RangeError(`not a whole number of days: ${n}`);
  return epochDayToDay(dayToEpochDay(day) + n);
};

/** Negative, zero or positive. Days compare as strings, which is why they are written in full. */
export const compareDays = (a: Day, b: Day): number => (a < b ? -1 : a > b ? 1 : 0);
