import { normalizeDigits, stripMarks } from '../value/digits.js';

/**
 * Text as a search compares it: no case, no accents, no Arabic short vowels,
 * no tatweel, one alef, `ى` read as `ي` (written for each other daily), the
 * Arabic presentation forms decomposed (`ﻻ` is `لا`), one set of digits (D2).
 *
 * `ة` is not folded into `ه`: they are different letters, and the collator
 * agrees (S5).
 *
 * Folding is per character, through a table built once on first use: what a
 * character folds to does not depend on its neighbours for the scripts a grid
 * filters (S5's dataset showed whole-string normalisation at ~45 ms per
 * 100 000 cells, most of the cold text-filter budget). `foldSlow` is the
 * definition; the table is its cache, and a test holds them equal.
 */
const ARABIC_MARKS = /[ً-ٰٟـ]/g;
const ALEF_FORMS = /[آأإٱ]/g;
const ALEF_MAQSURA = /ى/g;
const COMBINING = /[̀-ͯ]/g;

export const isAscii = (s: string): boolean => /^[\x00-\x7f]*$/.test(s);

/** The definition: whole-string normalisation. Slow; the reference for `fold`. */
export function foldSlow(s: string): string {
  return normalizeDigits(stripMarks(s))
    .normalize('NFKD')
    .replace(COMBINING, '')
    .replace(ARABIC_MARKS, '')
    .replace(ALEF_FORMS, 'ا')
    .replace(ALEF_MAQSURA, 'ي')
    .toLowerCase()
    .normalize('NFC');
}

/** Code units below this have their fold in a table; the rest are folded once and remembered. */
const TABLE_END = 0x0700;
let table: string[] | null = null;
const rare = new Map<number, string>();

function foldTable(): string[] {
  table ??= Array.from({ length: TABLE_END }, (_, c) => foldSlow(String.fromCharCode(c)));
  return table;
}

export function fold(s: string): string {
  if (isAscii(s)) return s.toLowerCase();
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
