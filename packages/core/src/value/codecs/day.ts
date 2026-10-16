import { dayFieldOrder, formattersFor } from '../../i18n/format.js';
import { isBlank, REJECTED, type ValueCodec } from '../codec.js';
import { compareDays, dayToEpochDay, parseDay, type Day } from '../day.js';
import { normalizeDigits, stripMarks } from '../digits.js';

const pad = (n: string): string => n.padStart(2, '0');

/**
 * Typed day text: ISO in every locale, or three numeric fields in the
 * locale's order separated by `/`, `.`, `-` or a space, with a four-digit
 * year. No swap when the month is 13, no two-digit year, no month name (D5).
 */
export function readDayText(text: string, order: readonly ['d' | 'm' | 'y', 'd' | 'm' | 'y', 'd' | 'm' | 'y']): Day | null {
  const s = normalizeDigits(stripMarks(text)).trim();
  const iso = parseDay(s);
  if (iso) return iso;
  const parts = s.split(/[/.\-\s]+/);
  if (parts.length !== 3 || !parts.every((p) => /^\d+$/.test(p))) return null;
  const at = (k: 'd' | 'm' | 'y'): string => parts[order.indexOf(k)]!;
  const y = at('y');
  if (y.length !== 4) return null;
  const m = at('m');
  const d = at('d');
  if (m.length > 2 || d.length > 2) return null;
  return parseDay(`${y}-${pad(m)}-${pad(d)}`);
}

export const dayCodec: ValueCodec<Day> = {
  kind: 'day',
  keyKind: 'number',
  // Machine values: a bare day only. A date-time is not a day, and is not cut down to one.
  coerce: (raw) => parseDay(raw),
  why: () => 'invalid-day',
  parse: (text, ctx) => readDayText(text, dayFieldOrder(ctx)) ?? REJECTED,
  format: (v, ctx) => formattersFor(ctx).day()(v),
  sortKey: (v) => dayToEpochDay(v),
  compare: compareDays,
  isEmpty: isBlank,
  equals: (a, b) => a === b,
  toExport: (v) => v,
};
