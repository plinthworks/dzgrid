import { dayToEpochDay, type Day } from '../value/day.js';
import type { InstantMs } from '../value/instant.js';
import { ctxKey, intlTag, type LocaleCtx } from '../value/locale.js';

/**
 * Writing values for one user: numbers, days, instants, through Intl objects
 * built once and kept. Every one is built with `intlTag` — Gregorian, digits
 * stated — and a day is formatted at its UTC midnight with `timeZone: 'UTC'`,
 * so no zone can move it to the day before.
 */

export interface NumberFormatSpec {
  readonly style?: 'decimal' | 'percent' | 'currency';
  readonly currency?: string;
  readonly minimumFractionDigits?: number;
  readonly maximumFractionDigits?: number;
  readonly useGrouping?: boolean;
}
export interface InstantFormatSpec {
  readonly seconds?: boolean;
  readonly date?: boolean;
  readonly time?: boolean;
}
export interface Formatters {
  number(spec?: NumberFormatSpec): (n: number) => string;
  day(): (d: Day) => string;
  instant(spec?: InstantFormatSpec): (ms: InstantMs) => string;
}

const MS_PER_DAY = 86_400_000;
/** Before the Gregorian reform, a proleptic Gregorian date in a local format misleads: ISO instead. */
const FIRST_GREGORIAN_YEAR = 1583;

const contexts = new Map<string, Formatters>();

export function formattersFor(ctx: LocaleCtx): Formatters {
  const key = ctxKey(ctx);
  let f = contexts.get(key);
  if (!f) {
    f = build(ctx);
    if (contexts.size >= 16) contexts.clear();
    contexts.set(key, f);
  }
  return f;
}

export function clearFormatCaches(): void {
  contexts.clear();
}

function build(ctx: LocaleCtx): Formatters {
  const tag = intlTag(ctx);
  const numbers = new Map<string, (n: number) => string>();
  const instants = new Map<string, (ms: InstantMs) => string>();
  let day: ((d: Day) => string) | null = null;

  return {
    number(spec = {}) {
      const key = JSON.stringify(spec);
      let fn = numbers.get(key);
      if (!fn) {
        const general = spec.minimumFractionDigits === undefined && spec.maximumFractionDigits === undefined && spec.style !== 'currency';
        const nf = new Intl.NumberFormat(tag, {
          ...spec,
          // "General": up to 15 significant digits, so 0.1 + 0.2 shows as 0.3.
          ...(general && { maximumSignificantDigits: 15 }),
        });
        fn = (n: number) => nf.format(n === 0 ? 0 : n);
        if (numbers.size >= 64) numbers.clear();
        numbers.set(key, fn);
      }
      return fn;
    },
    day() {
      if (!day) {
        const df = new Intl.DateTimeFormat(tag, { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' });
        day = (d: Day) => (Number(d.slice(0, 4)) < FIRST_GREGORIAN_YEAR ? d : df.format(dayToEpochDay(d) * MS_PER_DAY));
      }
      return day;
    },
    instant(spec = {}) {
      const key = JSON.stringify(spec);
      let fn = instants.get(key);
      if (!fn) {
        const withDate = spec.date !== false;
        const withTime = spec.time !== false;
        const df = new Intl.DateTimeFormat(tag, {
          timeZone: ctx.timeZone,
          hourCycle: 'h23',
          ...(withDate && { day: '2-digit', month: '2-digit', year: 'numeric' }),
          ...(withTime && { hour: '2-digit', minute: '2-digit', ...(spec.seconds && { second: '2-digit' }) }),
        });
        fn = (ms: InstantMs) => df.format(ms);
        if (instants.size >= 64) instants.clear();
        instants.set(key, fn);
      }
      return fn;
    },
  };
}

/** The order the locale writes a day's fields in, read from its own formatting of a sample day. */
export function dayFieldOrder(ctx: LocaleCtx): readonly ['d' | 'm' | 'y', 'd' | 'm' | 'y', 'd' | 'm' | 'y'] {
  const df = new Intl.DateTimeFormat(intlTag(ctx), { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' });
  const order = df
    .formatToParts(dayToEpochDay('2026-03-05' as Day) * MS_PER_DAY)
    .flatMap((p) => (p.type === 'day' ? ['d'] : p.type === 'month' ? ['m'] : p.type === 'year' ? ['y'] : [])) as ('d' | 'm' | 'y')[];
  return [order[0] ?? 'd', order[1] ?? 'm', order[2] ?? 'y'];
}

/** The parts a value is written with, `[type, text]`, for tests that must ignore engine-specific literals. */
export function formatParts(kind: 'number' | 'day' | 'instant', ctx: LocaleCtx, value: number | string): readonly (readonly [string, string])[] {
  const tag = intlTag(ctx);
  if (kind === 'number') {
    return new Intl.NumberFormat(tag, { maximumSignificantDigits: 15 }).formatToParts(value as number).map((p) => [p.type, p.value] as const);
  }
  if (kind === 'day') {
    const d = value as Day;
    if (Number(d.slice(0, 4)) < FIRST_GREGORIAN_YEAR) return [['literal', d]];
    return new Intl.DateTimeFormat(tag, { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' })
      .formatToParts(dayToEpochDay(d) * MS_PER_DAY)
      .map((p) => [p.type, p.value] as const);
  }
  return new Intl.DateTimeFormat(tag, { timeZone: ctx.timeZone, hourCycle: 'h23', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    .formatToParts(value as number)
    .map((p) => [p.type, p.value] as const);
}
