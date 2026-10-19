/**
 * A small RFC 4180 reader, for the tests only: fields split by `sep`, a
 * field in double quotes may hold the separator, quotes doubled, CR and LF;
 * every record ends in CRLF (a final one is required). Anything else throws,
 * so a malformed file fails the test instead of reading as something else.
 */
export function parseCsv(text: string, sep: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    let field = '';
    if (text[i] === '"') {
      i++;
      for (;;) {
        if (i >= n) throw new Error('unterminated quoted field');
        const c = text[i]!;
        if (c === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i += 2;
            continue;
          }
          i++;
          break;
        }
        field += c;
        i++;
      }
    } else {
      while (i < n && text[i] !== sep && !(text[i] === '\r' && text[i + 1] === '\n')) {
        if (text[i] === '"') throw new Error(`bare quote at ${i}`);
        if (text[i] === '\r' || text[i] === '\n') throw new Error(`bare line break at ${i}`);
        field += text[i];
        i++;
      }
    }
    row.push(field);
    if (text[i] === sep) {
      i++;
      continue;
    }
    if (text[i] === '\r' && text[i + 1] === '\n') {
      i += 2;
      out.push(row);
      row = [];
      continue;
    }
    throw new Error(`expected a separator or CRLF at ${i}`);
  }
  if (row.length) throw new Error('no CRLF after the last record');
  return out;
}
