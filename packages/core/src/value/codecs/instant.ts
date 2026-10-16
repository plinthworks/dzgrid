import { dayFieldOrder, formattersFor, type InstantFormatSpec } from '../../i18n/format.js';
import { isBlank, REJECTED, type ValueCodec } from '../codec.js';
import { dayToEpochDay, epochDayToDay } from '../day.js';
import { normalizeDigits, stripMarks } from '../digits.js';
import { readInstant, type InstantMs } from '../instant.js';
import { resolveWall } from '../zone-day.js';
import { readDayText } from './day.js';

const MS_PER_DAY = 86_400_000;

/** ISO in UTC, with milliseconds only when they are not zero. No Date. */
export function instantToIso(ms: InstantMs): string {
  const n = Math.floor(ms);
  const day = Math.floor(n / MS_PER_DAY);
  const rest = n - day * MS_PER_DAY;
  const d = epochDayToDay(day) ?? '????-??-??';
  const two = (v: number): string => String(v).padStart(2, '0');
  const frac = rest % 1000;
  return `${d}T${two(Math.floor(rest / 3_600_000))}:${two(Math.floor(rest / 60_000) % 60)}:${two(Math.floor(rest / 1000) % 60)}${frac ? `.${String(frac).padStart(3, '0')}` : ''}Z`;
}

const TIME = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

/**
 * Instants. Machine values need an offset (or `assumeZone`); typed text is
 * ISO, or a day in the locale's order then a 24-hour time, read in the
 * display zone — and refused if that time fell in a clock change (D8): the
 * person typing can say which one they meant, the data loader cannot.
 */
export function instantCodec(o: { assumeZone?: string; format?: InstantFormatSpec } = {}): ValueCodec<InstantMs> {
  const coerceOpts = o.assumeZone === undefined ? {} : { assumeZone: o.assumeZone };
  // Only a column that reads wall times in a zone can meet a clock change; offsets never warn.
  const warning =
    o.assumeZone === undefined
      ? undefined
      : (raw: unknown) => {
          const r = readInstant(raw, coerceOpts);
          return r.ok && r.warning ? r.warning : null;
        };
  return {
    ...(warning && { warning }),
    kind: 'instant',
    keyKind: 'number',
    coerce: (raw) => {
      const r = readInstant(raw, coerceOpts);
      return r.ok ? r.value : null;
    },
    why: (raw) => {
      const r = readInstant(raw, coerceOpts);
      return r.ok ? '' : r.code;
    },
    parse: (text, ctx) => {
      const t = normalizeDigits(stripMarks(text)).trim();
      const iso = readInstant(t, { assumeZone: ctx.timeZone, disambiguation: 'reject' });
      if (iso.ok) return iso.value;
      if (iso.code === 'wall-time-skipped' || iso.code === 'wall-time-ambiguous') return REJECTED;
      const split = t.lastIndexOf(' ');
      if (split < 0) return REJECTED;
      const day = readDayText(t.slice(0, split), dayFieldOrder(ctx));
      const time = TIME.exec(t.slice(split + 1));
      if (!day || !time) return REJECTED;
      const [h, m, s] = [Number(time[1]), Number(time[2]), Number(time[3] ?? 0)];
      if (h > 23 || m > 59 || s > 59) return REJECTED;
      const wall = dayToEpochDay(day) * MS_PER_DAY + h * 3_600_000 + m * 60_000 + s * 1000;
      const r = resolveWall(wall, ctx.timeZone, 'reject');
      return r.ok ? r.value : REJECTED;
    },
    format: (v, ctx) => formattersFor(ctx).instant(o.format)(v),
    sortKey: (v) => v,
    compare: (a, b) => a - b,
    isEmpty: isBlank,
    equals: (a, b) => a === b,
    toExport: instantToIso,
  };
}
