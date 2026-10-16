import { normalizeDigits, stripMarks } from '../value/digits.js';

/**
 * Text as a search compares it: no case, no accents, no Arabic short vowels,
 * no tatweel, one alef, `ى` read as `ي` (written for each other daily), the
 * Arabic presentation forms decomposed (`ﻻ` is `لا`), one set of digits (D2).
 *
 * `ة` is not folded into `ه`: they are different letters, and the collator
 * agrees (S5). ASCII text is returned after a lowercase only — the common,
 * cheap case.
 */
const ARABIC_MARKS = /[ً-ٰٟـ]/g;
const ALEF_FORMS = /[آأإٱ]/g;
const ALEF_MAQSURA = /ى/g;
const COMBINING = /[̀-ͯ]/g;

export const isAscii = (s: string): boolean => /^[\x00-\x7f]*$/.test(s);

export function fold(s: string): string {
  if (isAscii(s)) return s.toLowerCase();
  return normalizeDigits(stripMarks(s))
    .normalize('NFKD')
    .replace(COMBINING, '')
    .replace(ARABIC_MARKS, '')
    .replace(ALEF_FORMS, 'ا')
    .replace(ALEF_MAQSURA, 'ي')
    .toLowerCase()
    .normalize('NFC');
}
