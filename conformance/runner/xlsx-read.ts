/**
 * Reads an .xlsx back for the tests (our own code, no spreadsheet or zip library): the ZIP's central directory
 * (PKWARE APPNOTE §4.3), each entry inflated with node's `zlib` and its CRC checked with `zlib.crc32`, the XML parts
 * parsed with jsdom's DOMParser. What comes out is plain data a case can state by hand.
 */
import { crc32, inflateRawSync } from 'node:zlib';
import { JSDOM } from 'jsdom';

const { DOMParser } = new JSDOM('').window;

/** The entries of a ZIP, by name, as text; throws on a bad signature, size or CRC. */
export function unzip(bytes: Uint8Array): Map<string, string> {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = b.length - 22;
  while (end >= 0 && b.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0) throw new Error('no end record');
  const n = b.readUInt16LE(end + 10);
  let p = b.readUInt32LE(end + 16);
  const out = new Map<string, string>();
  for (let i = 0; i < n; i++) {
    if (b.readUInt32LE(p) !== 0x02014b50) throw new Error('bad central header');
    const method = b.readUInt16LE(p + 10);
    const crc = b.readUInt32LE(p + 16);
    const csize = b.readUInt32LE(p + 20);
    const usize = b.readUInt32LE(p + 24);
    const nl = b.readUInt16LE(p + 28);
    const xl = b.readUInt16LE(p + 30);
    const cl = b.readUInt16LE(p + 32);
    const off = b.readUInt32LE(p + 42);
    const name = b.subarray(p + 46, p + 46 + nl).toString('utf8');
    if (b.readUInt32LE(off) !== 0x04034b50) throw new Error(`bad local header: ${name}`);
    if (b.readUInt32LE(off + 14) !== crc || b.readUInt32LE(off + 18) !== csize || b.readUInt32LE(off + 22) !== usize) throw new Error(`local and central headers differ: ${name}`);
    const start = off + 30 + b.readUInt16LE(off + 26) + b.readUInt16LE(off + 28);
    const raw = b.subarray(start, start + csize);
    const data = method === 8 ? inflateRawSync(raw) : method === 0 ? raw : null;
    if (!data) throw new Error(`method ${method}: ${name}`);
    if (data.length !== usize) throw new Error(`size: ${name}`);
    if (crc32(data) !== crc) throw new Error(`crc: ${name}`);
    out.set(name, data.toString('utf8'));
    p += 46 + nl + xl + cl;
  }
  return out;
}

/** ECMA-376 §22.9.2.19: `_xHHHH_` back to its character (so `_x005F_x0041_` gives `_x0041_`). */
export const unescapeX = (s: string): string => s.replace(/_x([0-9A-Fa-f]{4})_/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));

const xml = (s: string | undefined): Document => {
  const d = new DOMParser().parseFromString(s ?? '<none/>', 'text/xml');
  if (d.getElementsByTagName('parsererror').length) throw new Error('not well-formed XML');
  return d;
};
const all = (d: Document | Element, tag: string): Element[] => [...d.getElementsByTagName(tag)];
const num = (e: Element | undefined, a: string): number => Number(e?.getAttribute(a) ?? 0);

/** What a sheet holds, read back: values by reference (`B3`), and what the cases look at. */
export interface ReadSheet {
  readonly sheet: string;
  readonly rtl: boolean;
  /** Text as a string, numbers as numbers, booleans as booleans. */
  readonly cells: Record<string, string | number | boolean>;
  /** A number format other than General: its code, or the built-in id as a string (`"14"`). */
  readonly formats: Record<string, string>;
  readonly bold: string[];
  readonly italic: string[];
  /** Cells with a fill: its ARGB. */
  readonly fills: Record<string, string>;
  /** Cells with a font colour: its ARGB. */
  readonly colors: Record<string, string>;
  readonly indent: Record<string, number>;
  readonly merges: string[];
  readonly pane: { readonly x: number; readonly y: number } | null;
  readonly filter: string | null;
  /** Column widths by letter, in character units. */
  readonly widths: Record<string, number>;
  /** Rows (1-based) with an outline level. */
  readonly outline: Record<string, number>;
  readonly summaryBelow: boolean | null;
  /** Every part's name, sorted. */
  readonly parts: string[];
}

/** An .xlsx file read back (the first sheet). */
export function readXlsx(bytes: Uint8Array): ReadSheet {
  const files = unzip(bytes);
  for (const [name, text] of files) if (name.endsWith('.xml') || name.endsWith('.rels')) xml(text);
  const wb = xml(files.get('xl/workbook.xml'));
  const sheet = all(wb, 'sheet')[0]?.getAttribute('name') ?? '';
  const sst = all(xml(files.get('xl/sharedStrings.xml')), 'si').map((si) => unescapeX(all(si, 't').map((t) => t.textContent ?? '').join('')));
  const st = xml(files.get('xl/styles.xml'));
  const codes = new Map(all(st, 'numFmt').map((f) => [num(f, 'numFmtId'), f.getAttribute('formatCode')!]));
  const fonts = all(all(st, 'fonts')[0] ?? st.documentElement, 'font');
  const fills = all(all(st, 'fills')[0] ?? st.documentElement, 'fill');
  const xfs = all(all(st, 'cellXfs')[0] ?? st.documentElement, 'xf');
  const ws = xml(files.get('xl/worksheets/sheet1.xml'));
  const out: ReadSheet = {
    sheet, rtl: all(ws, 'sheetView')[0]?.getAttribute('rightToLeft') === '1', cells: {}, formats: {}, bold: [], italic: [], fills: {}, colors: {}, indent: {},
    merges: all(ws, 'mergeCell').map((m) => m.getAttribute('ref')!), pane: null, filter: all(ws, 'autoFilter')[0]?.getAttribute('ref') ?? null,
    widths: {}, outline: {}, summaryBelow: all(ws, 'outlinePr')[0] ? all(ws, 'outlinePr')[0]!.getAttribute('summaryBelow') !== '0' : null, parts: [...files.keys()].sort(),
  };
  const pane = all(ws, 'pane')[0];
  if (pane) (out as { pane: unknown }).pane = { x: num(pane, 'xSplit'), y: num(pane, 'ySplit') };
  for (const c of all(ws, 'col')) for (let i = num(c, 'min'); i <= num(c, 'max'); i++) out.widths[letters(i - 1)] = num(c, 'width');
  for (const r of all(ws, 'row')) if (r.getAttribute('outlineLevel')) out.outline[r.getAttribute('r')!] = num(r, 'outlineLevel');
  for (const c of all(ws, 'c')) {
    const ref = c.getAttribute('r')!;
    const t = c.getAttribute('t');
    const v = all(c, 'v')[0]?.textContent;
    if (all(c, 'f').length) throw new Error(`a formula in ${ref}`);
    if (v != null) out.cells[ref] = t === 's' ? sst[Number(v)]! : t === 'b' ? v === '1' : t === 'str' || t === 'inlineStr' ? unescapeX(v) : Number(v);
    const xf = xfs[num(c, 's')];
    if (!xf) continue;
    const f = num(xf, 'numFmtId');
    if (f) out.formats[ref] = codes.get(f) ?? String(f);
    const font = fonts[num(xf, 'fontId')];
    if (font && all(font, 'b').length) out.bold.push(ref);
    if (font && all(font, 'i').length) out.italic.push(ref);
    const color = font && all(font, 'color')[0]?.getAttribute('rgb');
    if (color) out.colors[ref] = color;
    const fill = all(fills[num(xf, 'fillId')] ?? st.documentElement, 'fgColor')[0]?.getAttribute('rgb');
    if (fill) out.fills[ref] = fill;
    const indent = all(xf, 'alignment')[0]?.getAttribute('indent');
    if (indent) out.indent[ref] = Number(indent);
  }
  return out;
}

/** 0 → A, 25 → Z, 26 → AA. */
export function letters(i: number): string {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** The parts of an .xlsx joined into one array. */
export const joinParts = (parts: readonly Uint8Array[]): Uint8Array => Buffer.concat(parts.map((p) => Buffer.from(p.buffer, p.byteOffset, p.byteLength)));
