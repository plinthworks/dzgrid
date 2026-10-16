import { normalizeDigits, stripMarks } from '../value/digits.js';

/**
 * Text as a search compares it: no case, no accents, no Arabic short vowels,
 * no tatweel, one alef, one set of digits (D2).
 *
 * `ة` is not folded into `ه`, nor `ى` into `ي`: they are different letters,
 * and the collator agrees (S5). ASCII text that needs no folding is returned
 * after a lowercase only, which is the common, cheap case.
 */
const ARABIC_MARKS = /[ً-ٰٟـ]/g;
const ALEF_FORMS = /[آأإٱ]/g;
const COMBINING = /[̀-ͯ]/g;

export function fold(s: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7f]*$/.test(s)) return s.toLowerCase();
  return normalizeDigits(stripMarks(s))
    .normalize('NFD')
    .replace(COMBINING, '')
    .replace(ARABIC_MARKS, '')
    .replace(ALEF_FORMS, 'ا')
    .toLowerCase()
    .normalize('NFC');
}
