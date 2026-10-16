/**
 * Tab-separated text as spreadsheets put it on the clipboard, RFC 4180 style
 * quoting with a tab for separator. Pure: runs in node and in every page.
 *
 * Encoding:
 *   - cells joined by TAB, every row ended by CRLF — the last one too, which
 *     is what a spreadsheet writes and what lets a trailing empty row survive;
 *   - a cell is quoted when it holds TAB, CR, LF or `"`; inner quotes doubled.
 *
 * Decoding is lenient, because the text may come from anywhere:
 *   - CRLF, LF and lone CR all end a row; exactly one final line break is dropped;
 *   - a field is quoted only if its first character is `"` AND a closing quote
 *     is followed by TAB, a line break or the end; otherwise it is literal text
 *     (`"5" inch` stays as typed, an unterminated `"abc` too);
 *   - rows may come back ragged; `pad` evens them with empty strings.
 */

const NEEDS_QUOTES = /[\t\r\n"]/;

export function encodeTsv(rows) {
  let out = '';
  for (const row of rows) {
    for (let j = 0; j < row.length; j++) {
      if (j) out += '\t';
      const s = row[j] == null ? '' : String(row[j]);
      out += NEEDS_QUOTES.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }
    out += '\r\n';
  }
  return out;
}

export function decodeTsv(text, { pad = false } = {}) {
  let s = String(text);
  if (s.endsWith('\r\n')) s = s.slice(0, -2);
  else if (s.endsWith('\n') || s.endsWith('\r')) s = s.slice(0, -1);
  const rows = [];
  let row = [];
  let i = 0;
  const n = s.length;
  const isEnd = (k) => k >= n || s[k] === '\t' || s[k] === '\n' || s[k] === '\r';
  for (;;) {
    let cell;
    if (s[i] === '"') {
      // Try a quoted field; fall back to literal if it does not close cleanly.
      let k = i + 1;
      let val = '';
      let closed = false;
      while (k < n) {
        const q = s.indexOf('"', k);
        if (q < 0) break;
        if (s[q + 1] === '"') { val += s.slice(k, q) + '"'; k = q + 2; continue; }
        val += s.slice(k, q);
        k = q + 1;
        closed = isEnd(k);
        break;
      }
      if (closed) { cell = val; i = k; }
    }
    if (cell === undefined) {
      let k = i;
      while (!isEnd(k)) k++;
      cell = s.slice(i, k);
      i = k;
    }
    row.push(cell);
    if (i >= n) { rows.push(row); break; }
    const c = s[i];
    if (c === '\t') { i++; continue; }
    // Line break.
    rows.push(row);
    row = [];
    i += c === '\r' && s[i + 1] === '\n' ? 2 : 1;
  }
  if (pad) {
    const w = Math.max(...rows.map((r) => r.length));
    for (const r of rows) while (r.length < w) r.push('');
  }
  return rows;
}

// ---- property test ----------------------------------------------------------

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ALPHABET = ['a', 'Z', '1', ' ', '\t', '\n', '\r', '\r\n', '"', '""', "'", '=', '-', 'é', 'محمد', '٣', '\u200F', ',', ';', ''];

/** Random rectangular matrices: encode then decode must give them back exactly. */
export function roundTrip(iterations = 3000, seed = 1) {
  const r = rng(seed);
  const failures = [];
  for (let it = 0; it < iterations; it++) {
    const h = 1 + Math.floor(r() * 5);
    const w = 1 + Math.floor(r() * 5);
    const m = [];
    for (let y = 0; y < h; y++) {
      const row = [];
      for (let x = 0; x < w; x++) {
        let c = '';
        const len = Math.floor(r() * 5);
        for (let k = 0; k < len; k++) c += ALPHABET[Math.floor(r() * ALPHABET.length)];
        row.push(c);
      }
      m.push(row);
    }
    const back = decodeTsv(encodeTsv(m));
    if (JSON.stringify(back) !== JSON.stringify(m)) {
      failures.push({ m, enc: encodeTsv(m), back });
      if (failures.length > 3) break;
    }
  }
  return { iterations, failures };
}

/** Hand-written decode expectations: text that real applications produce or users type. */
export const DECODE_CASES = [
  { name: 'excel two rows, trailing CRLF', text: 'a\tb\r\nc\td\r\n', want: [['a', 'b'], ['c', 'd']] },
  { name: 'no trailing newline (typed text)', text: 'a\tb', want: [['a', 'b']] },
  { name: 'LF only (mac apps, Google Sheets)', text: 'a\tb\nc\td\n', want: [['a', 'b'], ['c', 'd']] },
  { name: 'lone CR (classic mac)', text: 'a\rb', want: [['a'], ['b']] },
  { name: 'empty trailing cells kept', text: 'a\t\t\r\nb\t\t\r\n', want: [['a', '', ''], ['b', '', '']] },
  { name: 'empty last row kept', text: 'a\r\n\r\n', want: [['a'], ['']] },
  { name: 'quoted newline in cell', text: '"line1\nline2"\tx\r\n', want: [['line1\nline2', 'x']] },
  { name: 'quoted tab and doubled quote', text: '"a\tb ""q"""\r\n', want: [['a\tb "q"']] },
  { name: 'quote not at start is literal', text: '5" inch\tx\r\n', want: [['5" inch', 'x']] },
  { name: 'quote at start but not closing cleanly', text: '"5" inch\tx\r\n', want: [['"5" inch', 'x']] },
  { name: 'unterminated quote stays literal', text: '"abc\tx\r\n', want: [['"abc', 'x']] },
  { name: 'single empty string', text: '', want: [['']] },
  { name: 'ragged rows', text: 'a\tb\tc\r\nd\r\n', want: [['a', 'b', 'c'], ['d']] },
  { name: 'arabic and RLM untouched', text: '\u200Fمحمد\t١٢٣\r\n', want: [['\u200Fمحمد', '١٢٣']] },
];

export function decodeCases() {
  return DECODE_CASES.map((c) => {
    const got = decodeTsv(c.text);
    return { name: c.name, ok: JSON.stringify(got) === JSON.stringify(c.want), got };
  });
}
