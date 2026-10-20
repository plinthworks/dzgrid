import { offsetAt } from '@dzgrid/core';

/**
 * What a file system refuses, and what makes a name read otherwise than it is: control characters,
 * `\ / : * ? " < > |`, and every invisible format character (`\p{Cf}`: direction controls, zero-width
 * characters, the soft hyphen, tags…) but the Arabic number signs (U+0600–0605, U+06DD, U+0890–0891,
 * U+08E2), which show; U+2065 (unassigned, in the old list) too.
 */
const BAD = /[\x00-\x08\x0e-\x1f\x7f-\x9f\\/:*?"<>|\u2065]|(?![\u0600-\u0605\u06dd\u0890\u0891\u08e2])\p{Cf}/gu;
/** Windows' reserved device names, the superscript digits and the console's included. */
const RESERVED = /^(con|prn|aux|nul|(com|lpt)[1-9\u00b9\u00b2\u00b3]|conin\$|conout\$)(\.|$)/i;

/** Dots and spaces trimmed at the end, `.csv` removed, cut to 116 code points — again until nothing changes. */
const fit = (s: string): string => {
  for (let was = ''; was !== s; ) {
    was = s;
    s = [...s.replace(/[.\s]+$/, '').replace(/\.csv$/i, '')].slice(0, 116).join('');
  }
  return s;
};

/**
 * A name a file system takes and a reader cannot be misled by (docs/behaviors/csv-export.md, step 19):
 * the characters above removed, white space collapsed, dots and spaces trimmed at the ends, a Windows
 * reserved name prefixed with `_`, at most 120 code points with `.csv` once at the end; `export.csv`
 * when nothing is left. Arabic and accents are kept. Idempotent.
 */
export function safeFileName(name: unknown): string {
  // A tab or a line break parts two words: white space (BAD leaves it) becomes one space.
  let s = fit(String(name ?? '').replace(BAD, '').replace(/\s+/g, ' ')).replace(/^[.\s]+/, '');
  if (RESERVED.test(s)) s = fit('_' + s);
  return (s || 'export') + '.csv';
}

const two = (n: number): string => (n < 10 ? '0' : '') + n;

/** `prefix-YYYY-MM-DD-HHmm.csv`, the wall clock of `zone` at `now`, Latin digits, cleaned. */
export function defaultFileName(prefix: string, now: number, zone: string): string {
  const d = new Date(now + offsetAt(now, zone));
  return safeFileName(`${prefix}-${d.getUTCFullYear()}-${two(d.getUTCMonth() + 1)}-${two(d.getUTCDate())}-${two(d.getUTCHours())}${two(d.getUTCMinutes())}`);
}
