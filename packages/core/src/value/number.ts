import { normalizeDigits, stripMarks } from './digits.js';
import { intlTag, type LocaleCtx } from './locale.js';

/**
 * Reading a number a person typed or pasted, without guessing.
 *
 * `1,5` in an English grid could be 15 or 1.5; a grid of doses must not pick
 * one. The rules, in order: direction marks go; Arabic-Indic and Persian digits
 * become 0–9; a sign (`-`, `−`, `+`); a final `%` or `٪` divides by 100; an
 * exponent. Then the separators:
 * - the Arabic decimal sign U+066B is the decimal, U+066C a group;
 * - spaces of every kind, `'` and `’` are groups;
 * - when both `.` and `,` appear, the last one is the decimal;
 * - a single one that is the locale's decimal is the decimal;
 * - a single one that is the locale's group is a group only when exactly three
 *   digits follow it — otherwise the text is refused;
 * - a single one that is neither is the decimal.
 * Groups after the first hold exactly three digits; the first, one to three.
 */

export interface NumberSeparators {
  readonly group: string;
  readonly decimal: string;
}

const separators = new Map<string, NumberSeparators>();

/** The locale's group and decimal signs, from its own formatting of 1 234 567.5. */
export function separatorsFor(ctx: LocaleCtx): NumberSeparators {
  const tag = intlTag({ locale: ctx.locale, numerals: 'latn' });
  let s = separators.get(tag);
  if (!s) {
    let group = ',';
    let decimal = '.';
    for (const p of new Intl.NumberFormat(tag).formatToParts(1234567.5)) {
      if (p.type === 'group') group = p.value;
      if (p.type === 'decimal') decimal = p.value;
    }
    s = { group, decimal };
    if (separators.size >= 64) separators.clear();
    separators.set(tag, s);
  }
  return s;
}

const SPACE_GROUPS = /[ \u00A0\u2007\u2009\u202F'\u2019]/;

/** A number from human text, or null when it cannot be read without guessing. */
export function readNumber(text: string, ctx: LocaleCtx): number | null {
  let s = normalizeDigits(stripMarks(text)).trim();
  if (!s) return null;

  let sign = '';
  if (s[0] === '-' || s[0] === '\u2212') { sign = '-'; s = s.slice(1); }
  else if (s[0] === '+') s = s.slice(1);

  let percent = false;
  const pct = /\s*[%\u066A]$/.exec(s);
  if (pct) { percent = true; s = s.slice(0, pct.index); }

  let exponent = 0;
  const exp = /[eE]([+-]?\d+)$/.exec(s);
  if (exp) { exponent = Number(exp[1]); s = s.slice(0, exp.index); }

  const mantissa = splitMantissa(s, separatorsFor(ctx));
  if (!mantissa) return null;
  const { int, frac } = mantissa;
  const e = exponent - (percent ? 2 : 0);
  // Decimal text with an exponent: no float multiplication, so 12.3% is 0.123 exactly.
  const value = Number(`${sign}${int || '0'}${frac ? `.${frac}` : ''}${e ? `e${e}` : ''}`);
  if (!Number.isFinite(value)) return null;
  // A non-zero number too small to represent is not zero.
  if (value === 0 && /[1-9]/.test(int + frac)) return null;
  return value === 0 ? 0 : value;
}

/** The integer and fraction digits, or null if the separators do not read unambiguously. */
function splitMantissa(s: string, sep: NumberSeparators): { int: string; frac: string } | null {
  if (!/^[0-9.,\u066B\u066C \u00A0\u2007\u2009\u202F'\u2019]+$/.test(s) || !/[0-9]/.test(s)) return null;

  let decimalAt = -1;
  const arabicDecimal = s.indexOf('\u066B');
  if (arabicDecimal >= 0) {
    if (s.indexOf('\u066B', arabicDecimal + 1) >= 0) return null;
    decimalAt = arabicDecimal;
  } else {
    const dots = count(s, '.');
    const commas = count(s, ',');
    if (dots && commas) {
      decimalAt = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
      const other = s[decimalAt] === '.' ? ',' : '.';
      if (count(s, s[decimalAt]!) !== 1 || s.indexOf(other, decimalAt) >= 0) return null;
    } else if (dots + commas === 1) {
      const c = dots ? '.' : ',';
      const at = s.indexOf(c);
      if (c === sep.decimal) decimalAt = at;
      else if (c === sep.group) {
        // A lone group sign is a group only with exactly three digits after it.
        if (!/^[0-9]{3}$/.test(s.slice(at + 1))) return null;
      } else decimalAt = at;
    } else if (dots + commas > 1) {
      // Several of one sign: a group, which cannot also be the locale's decimal.
      const c = dots ? '.' : ',';
      if (c === sep.decimal && c !== sep.group) return null;
    }
  }

  const intPart = decimalAt >= 0 ? s.slice(0, decimalAt) : s;
  const frac = decimalAt >= 0 ? s.slice(decimalAt + 1) : '';
  if (!/^[0-9]*$/.test(frac)) return null;
  if (decimalAt >= 0 && !frac && !intPart) return null;

  const groups = intPart.split(/[.,\u066C \u00A0\u2007\u2009\u202F'\u2019]/);
  if (groups.length > 1) {
    // A leading zero before a group (0,500) is no grouping anyone writes.
    if (!/^[1-9][0-9]{0,2}$/.test(groups[0]!)) return null;
    for (let i = 1; i < groups.length; i++) if (!/^[0-9]{3}$/.test(groups[i]!)) return null;
  } else if (!/^[0-9]*$/.test(groups[0]!)) return null;
  return { int: groups.join(''), frac };
}

const count = (s: string, c: string): number => s.split(c).length - 1;

/** A number from machine data: a finite number, or strict decimal text. Nothing locale-dependent. */
export function readMachineNumber(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? (raw === 0 ? 0 : raw) : null;
  if (typeof raw !== 'string' || !/^[+-]?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(raw)) return null;
  const v = Number(raw);
  return Number.isFinite(v) ? (v === 0 ? 0 : v) : null;
}

/** Exported for the test of the space-group rule. */
export const isSpaceGroup = (c: string): boolean => SPACE_GROUPS.test(c);
