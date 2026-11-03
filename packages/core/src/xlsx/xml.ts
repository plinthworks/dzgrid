import type { NumberFormatSpec } from '../i18n/format.js';
import { intlTag, type LocaleCtx } from '../value/locale.js';

/**
 * Text for SpreadsheetML (ECMA-376 Part 1 §22.9.2.19): a lone surrogate becomes U+FFFD; a literal `_xHHHH_` is
 * protected as `_x005F_xHHHH_`; what XML 1.0 cannot carry (control characters, U+FFFE, U+FFFF) and a carriage return
 * (a parser would turn it into a line feed) become `_xHHHH_`; then `&`, `<`, `>` and `"` as entities.
 */
export const esc = (s: string): string =>
  s
    .replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, '�')
    .replace(/_(x[0-9a-f]{4}_)/gi, '_x005F_$1')
    .replace(/[\0-\x08\x0b-\x1f￾￿]/g, (c) => `_x${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}_`)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** A `<t>` element, white space kept where a reader would drop it. */
export const tEl = (s: string): string => `<t${/^\s|\s$|[\n\t]/.test(s) ? ' xml:space="preserve"' : ''}>${esc(s)}</t>`;

/** 0 → A, 25 → Z, 26 → AA. */
export function colName(i: number): string {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** A name Excel takes for a sheet: `[]:*?/\` and control characters removed, no `'` at either end, at most 31 characters (a pair never split), `Sheet1` when empty. */
export function sheetNameOf(name: unknown): string {
  let s = String(name ?? '').replace(/[[\]:*?/\\\0-\x1f]/g, '').trim().replace(/^'+|'+$/g, '');
  if (s.length > 31) s = s.slice(0, /[\ud800-\udbff]/.test(s[30]!) ? 30 : 31);
  return s.replace(/'+$/, '').trim() || 'Sheet1';
}

/**
 * An Excel number format code for a column's `numberFormat` (docs/behaviors/xlsx-export.md): 0 (General) without one,
 * or with no fraction digits given for a plain decimal; else grouping `#,##0` (`0` without), the minimum fraction digits
 * as `0` and the rest up to the maximum as `#`; percent `0%`; a currency's symbol on its side as a quoted literal, a
 * space escaped when the locale puts one, the currency's digits unless given. What Intl refuses: General.
 */
export function numFmtFor(spec: NumberFormatSpec | undefined, ctx: LocaleCtx): string | 0 {
  if (!spec) return 0;
  const { style, minimumFractionDigits: lo, maximumFractionDigits: hi } = spec;
  const money = style === 'currency';
  if (!money && style !== 'percent' && lo === undefined && hi === undefined) return 0;
  try {
    let min = lo ?? 0;
    let max = hi ?? (style === 'percent' ? 0 : 3);
    let pre = '';
    let post = '';
    if (money) {
      const f = new Intl.NumberFormat(intlTag(ctx), { style, currency: spec.currency! });
      const r = f.resolvedOptions();
      min = lo ?? r.minimumFractionDigits!;
      max = hi ?? r.maximumFractionDigits!;
      const p = f.formatToParts(1);
      const c = p.findIndex((x) => x.type === 'currency');
      const n = p.findIndex((x) => x.type === 'integer');
      const sym = `"${p[c]!.value.replace(/[\u200e\u200f\u061c"]/g, '')}"`;
      const gap = p.slice(Math.min(c, n) + 1, Math.max(c, n)).some((x) => x.type === 'literal' && /\s/.test(x.value)) ? '\\ ' : '';
      if (c < n) pre = sym + gap;
      else post = gap + sym;
    }
    max = Math.max(min, max);
    const frac = max ? '.' + '0'.repeat(min) + '#'.repeat(max - min) : '';
    return pre + (style === 'percent' || spec.useGrouping === false ? '0' : '#,##0') + frac + (style === 'percent' ? '%' : '') + post;
  } catch {
    return 0;
  }
}
