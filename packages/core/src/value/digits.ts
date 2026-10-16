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

/** Arabic-Indic (U+0660–0669) and extended, Persian (U+06F0–06F9) digits to 0–9. */
export function normalizeDigits(s: string): string {
  return s.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (c) => {
    const code = c.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}
