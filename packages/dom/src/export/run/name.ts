import { offsetAt } from '@dzgrid/core';

/** What a file system refuses, and what makes a name read otherwise than it is: control characters, `\ / : * ? " < > |`, direction controls, zero-width characters. */
const BAD = /[\x00-\x08\x0e-\x1f\x7f-\x9f\\/:*?"<>|\u061c\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g;
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i;
const EDGES = /^[.\s]+|[.\s]+$/g;

/**
 * A name a file system takes and a reader cannot be misled by (docs/behaviors/csv-export.md, step 19):
 * the characters above removed, white space collapsed, dots and spaces trimmed at the ends, a Windows
 * reserved name prefixed with `_`, at most 120 code points with `.csv` once at the end; `export.csv`
 * when nothing is left. Arabic and accents are kept.
 */
export function safeFileName(name: unknown): string {
  const clean = (s: string): string => s.replace(EDGES, '');
  const end = (s: string): string => s.replace(/[.\s]+$/, '');
  // A tab or a line break parts two words: white space (BAD leaves it) becomes one space.
  let s = end(String(name ?? '').replace(BAD, '').replace(/\s+/g, ' '));
  while (/\.csv$/i.test(s)) s = end(s.slice(0, -4));
  s = clean(s);
  s = clean([...s].slice(0, 116).join(''));
  if (RESERVED.test(s)) s = clean([...('_' + s)].slice(0, 116).join(''));
  return (s || 'export') + '.csv';
}

const two = (n: number): string => (n < 10 ? '0' : '') + n;

/** `prefix-YYYY-MM-DD-HHmm.csv`, the wall clock of `zone` at `now`, Latin digits, cleaned. */
export function defaultFileName(prefix: string, now: number, zone: string): string {
  const d = new Date(now + offsetAt(now, zone));
  return safeFileName(`${prefix}-${d.getUTCFullYear()}-${two(d.getUTCMonth() + 1)}-${two(d.getUTCDate())}-${two(d.getUTCHours())}${two(d.getUTCMinutes())}`);
}
