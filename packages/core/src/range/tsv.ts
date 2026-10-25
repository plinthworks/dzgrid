/**
 * Tab-separated text as spreadsheets put it on the clipboard (clipboard.md 10–11; spike S7's codec,
 * ours, ported). Written: cells joined by TAB, every row ended by CRLF (the last too, so a last row of
 * empty cells survives); a cell quoted when it holds TAB, CR, LF or `"`, inner quotes doubled.
 */
export function encodeTsv(m: readonly (readonly string[])[]): string {
  let out = '';
  for (const row of m) out += row.map((s) => (/[\t\r\n"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)).join('\t') + '\r\n';
  return out;
}

/**
 * Read leniently, never failing: a leading byte order mark dropped; CRLF, LF and a lone CR end a row; exactly one final break dropped; a
 * cell is quoted only when it starts with `"` and a closing `"` is followed by TAB, a break or the end
 * (otherwise literal: `5" inch`, `"5" inch`, `"abc`); ragged rows as they are, `pad` evens them.
 */
export function decodeTsv(text: string, o?: { readonly pad?: boolean }): string[][] {
  // A leading byte order mark (some applications write one) is no text.
  const s = (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).replace(/(\r\n|\n|\r)$/, '');
  const n = s.length;
  const end = (k: number) => k >= n || s[k] === '\t' || s[k] === '\n' || s[k] === '\r';
  const rows: string[][] = [];
  let row: string[] = [];
  let i = 0;
  for (;;) {
    let cell: string | undefined;
    if (s[i] === '"') {
      let k = i + 1;
      let v = '';
      for (;;) {
        const q = s.indexOf('"', k);
        if (q < 0) break;
        v += s.slice(k, q);
        if (s[q + 1] === '"') {
          v += '"';
          k = q + 2;
          continue;
        }
        if (end(q + 1)) (cell = v), (i = q + 1);
        break;
      }
    }
    if (cell === undefined) {
      let k = i;
      while (!end(k)) k++;
      cell = s.slice(i, k);
      i = k;
    }
    row.push(cell);
    if (i >= n) break;
    if (s[i] !== '\t') {
      rows.push(row);
      row = [];
      if (s[i] === '\r' && s[i + 1] === '\n') i++;
    }
    i++;
  }
  rows.push(row);
  if (o?.pad) {
    let w = 0;
    for (const r of rows) w = Math.max(w, r.length);
    for (const r of rows) while (r.length < w) r.push('');
  }
  return rows;
}
