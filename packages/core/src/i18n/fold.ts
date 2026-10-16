import { normalizeDigits, stripMarks } from '../value/digits.js';

/**
 * Text as a search compares it: no case, no accents, no Arabic short vowels,
 * no tatweel, one alef, `ى` read as `ي` (written for each other daily), the
 * Arabic presentation forms decomposed (`ﻻ` is `لا`), one set of digits (D2).
 *
 * `ة` is not folded into `ه`: they are different letters, and the collator
 * agrees (S5).
 *
 * Folding is per character, through a table built once on first use, for the
 * scripts where a character folds the same whatever its neighbours — Latin,
 * Cyrillic, Arabic — which is what a grid here filters (whole-string
 * normalisation cost ~45 ms per 100 000 cells, most of the cold text-filter
 * budget). Other scripts take `foldSlow`, the definition; tests hold the two
 * equal.
 */
const ARABIC_MARKS = /[\u064B-\u065F\u0670\u0640]/g;
const ALEF_FORMS = /[\u0622\u0623\u0625\u0671]/g;
const ALEF_MAQSURA = /\u0649/g;
const COMBINING = /[\u0300-\u036F]/g;

export const isAscii = (s: string): boolean => /^[\x00-\x7f]*$/.test(s);

/** The definition: whole-string normalisation. Slow; the reference for `fold`. */
export function foldSlow(s: string): string {
  return normalizeDigits(stripMarks(s))
    .normalize('NFKD')
    .replace(COMBINING, '')
    .replace(ARABIC_MARKS, '')
    .replace(ALEF_FORMS, '\u0627')
    .replace(ALEF_MAQSURA, '\u064A')
    .toLowerCase()
    .normalize('NFC');
}

/** Code units below this have their fold in a table; the rest are folded once and remembered. */
const TABLE_END = 0x0780;
let table: string[] | null = null;
const rare = new Map<number, string>();

function foldTable(): string[] {
  table ??= Array.from({ length: TABLE_END }, (_, c) => foldSlow(String.fromCharCode(c)));
  return table;
}

/**
 * True when every character folds on its own: Latin, Cyrillic, Arabic and its
 * presentation forms, punctuation and spaces. Greek (final sigma depends on
 * the next letter), Hangul and Indic scripts (recomposition across characters)
 * and anything else take the whole-string definition.
 */
const PER_CHARACTER = /^[\u0000-\u036F\u0400-\u052F\u0600-\u06FF\u0750-\u077F\u2000-\u206F\u20A0-\u20CF\uFB50-\uFDFF\uFE70-\uFEFF]*$/;

export function fold(s: string): string {
  if (isAscii(s)) return s.toLowerCase();
  if (!PER_CHARACTER.test(s)) return foldSlow(s);
  const t = foldTable();
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < TABLE_END) {
      out += t[c]!;
      continue;
    }
    // A whole code point, surrogate pairs included.
    const cp = s.codePointAt(i)!;
    if (cp > 0xffff) i++;
    let f = rare.get(cp);
    if (f === undefined) {
      f = foldSlow(String.fromCodePoint(cp));
      if (rare.size >= 4096) rare.clear();
      rare.set(cp, f);
    }
    out += f;
  }
  return out;
}
