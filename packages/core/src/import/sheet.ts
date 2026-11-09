/** A cell read from a sheet: text, a number, a boolean, blank (`null`), or an Excel error (`#DIV/0!`…). */
export type ImportCell = string | number | boolean | null | { readonly error: true };

const ENT: Readonly<Record<string, string>> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
/** XML text: its five entities and character references read. */
const text = (s: string): string => s.replace(/&(#x?)?(\w+);/g, (m, n: string | undefined, w: string) => (n ? String.fromCodePoint(parseInt(w, n.length > 1 ? 16 : 10)) : (ENT[w] ?? m)));
/** An attribute of a tag's text. */
const attr = (tag: string, name: string): string | undefined => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
/** The text of a string item (`<si>`, `<is>`): its runs' `<t>` joined, the phonetic runs left out. */
const runs = (s: string): string => text([...s.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t\b[^>]*?(?:\/>|>([\s\S]*?)<\/t>)/g)].map((m) => m[1] ?? '').join(''));

/** The workbook's first sheet's part, by the workbook's order and its relationships (file-import.md 6); null: none. */
export function sheetPath(workbook: string, rels: string): string | null {
  const s = /<sheet\b[^>]*>/.exec(workbook)?.[0];
  const id = s && /:id="([^"]*)"/.exec(s)?.[1];
  const r = [...rels.matchAll(/<Relationship\b[^>]*>/g)].find((m) => attr(m[0], 'Id') === id)?.[0];
  const t = r && attr(r, 'Target');
  return t ? (t[0] === '/' ? t.slice(1) : `xl/${t}`) : null;
}

/** The shared strings' texts, in order (`xl/sharedStrings.xml`). */
export const sharedStrings = (xml: string): string[] => [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => runs(m[1]!));

/**
 * A sheet's cells, row by row from the first (a missing row empty, a missing cell blank): shared (`s`), inline
 * (`inlineStr`) and formula (`str`) strings as text, booleans, ISO dates (`d`) as text, errors (`e`), numbers.
 */
export function readSheet(xml: string, shared: readonly string[]): ImportCell[][] {
  const out: ImportCell[][] = [];
  for (const r of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const row: ImportCell[] = [];
    out[(Number(attr(r[1]!, 'r')) || out.length + 1) - 1] = row;
    for (const c of (r[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = attr(c[1]!, 'r');
      let i = row.length;
      if (ref) {
        i = 0;
        for (const ch of /^[A-Z]+/.exec(ref)?.[0] ?? '') i = i * 26 + ch.charCodeAt(0) - 64;
        i--;
      }
      const t = attr(c[1]!, 't');
      const body = c[2] ?? '';
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      while (row.length < i) row.push(null);
      row[i] = t === 'inlineStr' ? runs(body) : v === undefined ? null : t === 's' ? (shared[+v] ?? null) : t === 'b' ? v === '1' : t === 'e' ? { error: true } : t === 'str' || t === 'd' ? text(v) : Number(v);
    }
  }
  for (let i = 0; i < out.length; i++) out[i] ??= [];
  return out;
}
