/**
 * Reads the first <table> of a clipboard `text/html` payload into a matrix.
 * Browser only (DOMParser): in DzGrid this belongs to the DOM layer.
 *
 * Shape handled — the one spreadsheets put on the clipboard, as documented for
 * the HTML clipboard format and Office's HTML export:
 *   - optional CF_HTML header lines and <!--StartFragment--> markers (ignored);
 *   - <td>/<th> with colspan/rowspan: the value sits in the top-left cell, the
 *     cells it covers read as '' and are reported in `merges`;
 *   - <br> inside a cell is a line break in the value; other whitespace from the
 *     HTML source is collapsed, as a browser would render it;
 *   - number formats from `mso-number-format` (inline style or a class rule in
 *     a <style> block), raw values from `x:num` (Office), `sdval` (LibreOffice)
 *     or `data-sheets-value` (Google Sheets), kept as hints, never trusted
 *     blindly — the visible text is the value;
 *   - rows of different widths are padded with '' to the widest.
 */

function classFormats(doc) {
  const map = new Map();
  for (const st of doc.querySelectorAll('style')) {
    const css = st.textContent.replace(/<!--|-->/g, '');
    const re = /([^{}]+)\{([^}]*)\}/g;
    let m;
    while ((m = re.exec(css))) {
      const f = /mso-number-format\s*:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^;]+)/i.exec(m[2]);
      if (!f) continue;
      for (const sel of m[1].split(',')) {
        const c = /\.([\w-]+)\s*$/.exec(sel.trim());
        if (c) map.set(c[1], unescapeFormat(f[1]));
      }
    }
  }
  return map;
}

/** `"\#\,\#\#0\.00"` → `#,##0.00`; Office escapes every literal with a backslash. */
function unescapeFormat(v) {
  let s = v.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) s = s.slice(1, -1);
  return s.replace(/\\(.)/g, '$1');
}

function cellText(td) {
  // Work on a clone: <br> → '\n', then collapse source whitespace except those breaks.
  const c = td.cloneNode(true);
  for (const br of c.querySelectorAll('br')) br.replaceWith('\u0000');
  let t = c.textContent.replace(/[ \t\r\n\f]+/g, ' ');
  t = t.split('\u0000').join('\n');
  t = t.replace(/ *\n */g, '\n').replace(/^ +| +$/g, '');
  // A cell holding only breaks or non-breaking spaces is how some writers say
  // "empty": LibreOffice writes <td><br></td>, others &nbsp;.
  if (/^[\u00A0\n ]*$/.test(t)) t = '';
  return t;
}

export function parseClipboardHtml(html) {
  const doc = new DOMParser().parseFromString(String(html), 'text/html');
  const table = doc.querySelector('table');
  if (!table) return null;
  const formats = classFormats(doc);
  const values = [];
  const meta = [];
  const merges = [];
  const taken = []; // taken[r][c] = true when covered by a span from above
  const rows = Array.from(table.rows); // includes thead/tbody/tfoot rows, in order
  rows.forEach((tr, r) => {
    values[r] ??= [];
    taken[r] ??= [];
    let c = 0;
    for (const td of tr.cells) {
      while (taken[r][c]) c++;
      const cs = Math.max(1, Math.min(1000, td.colSpan || 1));
      const rs = Math.max(1, Math.min(65534, td.rowSpan || 1));
      const style = td.getAttribute('style') || '';
      const inline = /mso-number-format\s*:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^;]+)/i.exec(style);
      const cls = Array.from(td.classList).map((k) => formats.get(k)).find(Boolean);
      const hint = {};
      if (inline) hint.numFmt = unescapeFormat(inline[1]);
      else if (cls) hint.numFmt = cls;
      for (const a of ['x:num', 'sdval', 'data-sheets-value', 'x:str']) if (td.hasAttribute(a)) hint[a] = td.getAttribute(a);
      for (let dr = 0; dr < rs; dr++) {
        values[r + dr] ??= [];
        taken[r + dr] ??= [];
        for (let dc = 0; dc < cs; dc++) {
          values[r + dr][c + dc] = '';
          taken[r + dr][c + dc] = true;
        }
      }
      values[r][c] = cellText(td);
      if (Object.keys(hint).length) (meta[r] ??= [])[c] = hint;
      if (cs > 1 || rs > 1) merges.push({ r, c, rows: rs, cols: cs });
      c += cs;
    }
  });
  const w = Math.max(0, ...values.map((row) => row.length));
  for (const row of values) for (let c = 0; c < w; c++) if (row[c] === undefined) row[c] = '';
  return { values, meta, merges };
}
