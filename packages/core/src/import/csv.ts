import { decodeTsv } from '../range/tsv.js';

/**
 * A CSV file's cells (file-import.md 5): the separator is the one of `,` `;` TAB found most in the first line outside
 * quotes (`,` on a tie); quoted cells, doubled quotes, line breaks and a byte order mark as the clipboard's reader reads
 * them, with that separator.
 */
export function readCsv(text: string): string[][] {
  const line = /^[^\r\n]*/.exec(text.replace(/"[^"]*"/g, ''))![0];
  const sep = [',', ';', '\t'].reduce((a, b) => (line.split(b).length > line.split(a).length ? b : a));
  return decodeTsv(text, { sep });
}
