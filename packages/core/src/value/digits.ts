/**
 * Characters that change how a number or a date is written, not what it is.
 *
 * Arabic text carries invisible direction marks (S5 measured them in every
 * engine's own output), and Arabic-Indic or Persian digits are digits like
 * any other. Reading starts by removing the first and folding the second.
 */

/** Direction marks and isolates: LRM, RLM, ALM, BOM, the embeddings and the isolates. */
const MARKS = /[\u200E\u200F\u061C\uFEFF\u202A-\u202E\u2066-\u2069]/g;

export function stripMarks(s: string): string {
  return s.replace(MARKS, '');
}

const NON_ASCII_DIGIT = /[^\x00-\x7f]/u;
const DIGIT = /\p{Nd}/u;
const zeros = new Map<number, number>();

/** The code point of the zero of the digit block a decimal digit belongs to. */
function zeroOf(cp: number): number {
  let z = zeros.get(cp);
  if (z === undefined) {
    // Unicode keeps each script's digits 0–9 consecutive; walk back to the block's start.
    let start = cp;
    while (start > 0 && DIGIT.test(String.fromCodePoint(start - 1))) start--;
    z = cp - ((cp - start) % 10);
    zeros.set(cp, z);
  }
  return z;
}

/**
 * Decimal digits of every script (Arabic-Indic, Persian, Devanagari, Bengali,
 * Thai, …) to 0–9. A Bengali grid with its own numerals must read and search
 * its numbers like any other.
 */
export function normalizeDigits(s: string): string {
  if (!NON_ASCII_DIGIT.test(s)) return s;
  return s.replace(/\p{Nd}/gu, (c) => {
    const cp = c.codePointAt(0)!;
    return cp < 0x80 ? c : String(cp - zeroOf(cp));
  });
}
