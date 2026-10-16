import { isKnownZone } from './zone-day.js';

/**
 * How values are read and written for one user: language, digits, zone.
 *
 * The calendar is always Gregorian: Safari opens `ar-SA` in Umm al-Qura
 * otherwise (S5), and a grid of medical dates cannot change calendar with
 * the browser. Digits are Latin unless the host asks for the language's own.
 */
export interface LocaleCtx {
  readonly locale: string;
  readonly numerals: 'latn' | 'locale';
  /** IANA zone used for instants only. Days have no zone. */
  readonly timeZone: string;
  readonly calendar: 'gregory';
}

/** A context, checked. A bad locale or zone is a programming error and throws RangeError. */
export function localeCtx(o: { locale: string; numerals?: 'latn' | 'locale'; timeZone?: string }): LocaleCtx {
  // Throws RangeError on a malformed tag.
  const [canonical] = Intl.getCanonicalLocales(o.locale);
  if (!canonical) throw new RangeError(`not a locale: ${o.locale}`);
  const timeZone = o.timeZone ?? 'UTC';
  if (!isKnownZone(timeZone)) throw new RangeError(`not a time zone: ${timeZone}`);
  const numerals = o.numerals ?? 'latn';
  if (numerals !== 'latn' && numerals !== 'locale') throw new RangeError(`not a numerals setting: ${String(numerals)}`);
  return { locale: canonical, numerals, timeZone, calendar: 'gregory' };
}

export const ctxKey = (ctx: LocaleCtx): string => `${ctx.locale}|${ctx.numerals}|${ctx.timeZone}`;

const tags = new Map<string, string>();

/**
 * The tag every Intl object is built with: the language without any calendar
 * or numbering keyword it came with, then `-u-ca-gregory-nu-<digits>`. With
 * `numerals: 'locale'` the language's own default system is resolved once and
 * written out, so no engine is left to choose.
 */
export function intlTag(ctx: Pick<LocaleCtx, 'locale' | 'numerals'>): string {
  const key = `${ctx.locale}|${ctx.numerals}`;
  let tag = tags.get(key);
  if (tag === undefined) {
    const base = new Intl.Locale(ctx.locale).baseName;
    const nu = ctx.numerals === 'latn' ? 'latn' : new Intl.NumberFormat(base).resolvedOptions().numberingSystem;
    tag = `${base}-u-ca-gregory-nu-${nu}`;
    if (tags.size >= 64) tags.clear();
    tags.set(key, tag);
  }
  return tag;
}
