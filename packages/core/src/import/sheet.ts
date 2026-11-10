/** A cell read from a sheet: text, a number, a boolean, blank (`null`), or an Excel error (`#DIV/0!`…). */
export type ImportCell = string | number | boolean | null | { readonly error: true };

/** Excel's own limits (rows, columns up to XFD): a reference past them is left out (a hostile file stays bounded). */
const ROWS = 1_048_576;
const COLS = 16_384;
const ENT: Readonly<Record<string, string>> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
/** XML text: its five entities and character references read; a reference out of Unicode left as written. */
const text = (s: string): string =>
  s.replace(/&(#x?)?(\w+);/g, (m, n: string | undefined, w: string) => {
    if (!n) return ENT[w] ?? m;
    const c = parseInt(w, n.length > 1 ? 16 : 10);
    return c >= 0 && c <= 0x10ffff ? String.fromCodePoint(c) : m;
  });
/** An attribute of a tag's text. */
const attr = (tag: string, name: string): string | undefined => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];

/**
 * Each `<name …>…</name>` or `<name …/>` of `s` in order: its attributes' text and its body (undefined when self-closed).
 * One pass, forward only (linear even on malformed XML: an element never closed ends the walk).
 */
function* tags(s: string, name: string): Generator<readonly [string, string | undefined]> {
  const open = `<${name}`;
  const close = `</${name}>`;
  for (let i = s.indexOf(open); i >= 0; ) {
    // `<c` is not `<col`: the name ends at a space, `/` or `>`.
    const after = s.charCodeAt(i + open.length);
    if (!(after === 62 || after === 47 || after <= 32)) {
      i = s.indexOf(open, i + 1);
      continue;
    }
    const gt = s.indexOf('>', i);
    if (gt < 0) return;
    if (s.charCodeAt(gt - 1) === 47) {
      yield [s.slice(i + open.length, gt - 1), undefined];
      i = s.indexOf(open, gt);
      continue;
    }
    const end = s.indexOf(close, gt);
    if (end < 0) return;
    yield [s.slice(i + open.length, gt), s.slice(gt + 1, end)];
    i = s.indexOf(open, end + close.length);
  }
}

/** The text of a string item (`<si>`, `<is>`): its runs' `<t>` joined, the phonetic runs (`<rPh>`) left out. */
const runs = (s: string): string => {
  let kept = '';
  let from = 0;
  for (let i = s.indexOf('<rPh'); i >= 0; i = s.indexOf('<rPh', from)) {
    kept += s.slice(from, i);
    const e = s.indexOf('</rPh>', i);
    from = e < 0 ? s.length : e + 6;
  }
  kept += s.slice(from);
  let out = '';
  for (const [, body] of tags(kept, 't')) out += body ?? '';
  return text(out);
};

/** The workbook's first sheet's part, by the workbook's order and its relationships (file-import.md 6); null: none. */
export function sheetPath(workbook: string, rels: string): string | null {
  const s = tags(workbook, 'sheet').next().value?.[0];
  const id = s && /:id="([^"]*)"/.exec(s)?.[1];
  let t: string | undefined;
  for (const [a] of tags(rels, 'Relationship')) if (attr(a, 'Id') === id) {
    t = attr(a, 'Target');
    break;
  }
  return t ? (t[0] === '/' ? t.slice(1) : `xl/${t}`) : null;
}

/** The shared strings' texts, in order (`xl/sharedStrings.xml`). */
export const sharedStrings = (xml: string): string[] => Array.from(tags(xml, 'si'), ([, body]) => runs(body ?? ''));

/**
 * A sheet's cells, row by row from the first (a missing row empty, a missing cell a hole — absent, read as blank): shared
 * (`s`), inline (`inlineStr`) and formula (`str`) strings as text, booleans, ISO dates (`d`) as text, errors (`e`),
 * numbers. A row or a column past Excel's limits is left out.
 */
export function readSheet(xml: string, shared: readonly string[]): ImportCell[][] {
  const out: ImportCell[][] = [];
  for (const [ra, rb] of tags(xml, 'row')) {
    const n = Number(attr(ra, 'r'));
    const at = Number.isInteger(n) && n >= 1 ? n - 1 : out.length;
    if (at >= ROWS) continue;
    const row: ImportCell[] = [];
    out[at] = row;
    for (const [ca, body = ''] of tags(rb ?? '', 'c')) {
      const letters = /^[A-Z]*/.exec(attr(ca, 'r') ?? '')![0];
      let i = row.length;
      if (letters) {
        if (letters.length > 3) continue;
        i = 0;
        for (const ch of letters) i = i * 26 + ch.charCodeAt(0) - 64;
        i--;
      }
      if (i >= COLS) continue;
      const t = attr(ca, 't');
      const v = tags(body, 'v').next().value?.[1];
      row[i] = t === 'inlineStr' ? runs(body) : v === undefined ? null : t === 's' ? (shared[+v] ?? null) : t === 'b' ? v === '1' : t === 'e' ? { error: true } : t === 'str' || t === 'd' ? text(v) : Number(v);
    }
  }
  for (let i = 0; i < out.length; i++) out[i] ??= [];
  return out;
}
