import { NO_OVERLAY, type ColumnOrGroup, type ResolvedColumn, type ValueReader } from '../columns/defs.js';
import type { DisplayIndex } from '../ids.js';
import { problem, type Problem } from '../problems.js';
import type { DataNode, RowNode } from '../row/node.js';
import type { SpanCell } from '../spans/map.js';
import { groupChains } from '../spans/bands.js';
import { dayToEpochDay, type Day } from '../value/day.js';
import { csvColumns, type CsvInput, type CsvSummary } from '../csv/chunks.js';
import { labelOf, readValue } from '../csv/writers.js';
import { wallMs, wallText } from '../csv/wall.js';
import { styleBook, type CellLook } from './styles.js';
import { colName, esc, numFmtFor, sheetNameOf, tEl } from './xml.js';
import { crc32, utf8, zipFile } from './zip.js';

/** What the `xlsxStyle` hook is told of one written cell (a header cell: `row` null, `value` its label). */
export interface XlsxStyleContext<T> {
  readonly column: string;
  readonly value: unknown;
  readonly row: Readonly<T> | null;
  readonly header: boolean;
}
/** The application's look for a cell: colours as `RRGGBB` (its own values, never the grid's). */
export interface XlsxStyle {
  readonly fill?: string;
  readonly color?: string;
  readonly bold?: boolean;
  readonly italic?: boolean;
}

/** How the .xlsx is written (docs/behaviors/xlsx-export.md); every option has a default. */
export interface XlsxOptions<T = any> {
  /** `value` (default): typed cells; `display`: every cell a text cell, as the grid formats it. */
  readonly text?: 'value' | 'display' | undefined;
  readonly enums?: 'label' | 'code' | undefined;
  /** Header rows first; default true. */
  readonly header?: boolean | undefined;
  /** Column ids, in order; default the visible columns. */
  readonly columns?: readonly string[];
  readonly levelHeader?: string | undefined;
  /** The column that carries the indent and a filler's label; absent or not written: the first written. */
  readonly treeColumn?: string | undefined;
  /** Cleaned (`sheetNameOf`); default `Sheet1`. */
  readonly sheetName?: string;
  /** One header row per group level (default true). */
  readonly groups?: boolean;
  /** Header rows and the leading start-pinned columns frozen (default true). */
  readonly freeze?: boolean;
  /** A spanned value in every slot (`repeat`, default) or once in merged slots. */
  readonly spans?: 'repeat' | 'merge';
  /** A tree's rows: Excel's outline (default), CSV's level column, or flat. */
  readonly tree?: 'outline' | 'level' | 'none';
  /** `wall` (default): the display zone's clock; `utc`. */
  readonly instants?: 'wall' | 'utc';
  /** A right-to-left sheet. */
  readonly rtl?: boolean;
  /** The application's colours, called once per written cell (Q-X4). */
  readonly xlsxStyle?: (c: XlsxStyleContext<T>) => XlsxStyle | null | undefined;
  /** Rows per sheet piece; default 500. */
  readonly chunkRows?: number;
}

/** What the file is written from: CSV's input, and the grid's layout. */
export interface XlsxInput<T> extends CsvInput<T> {
  /** Column widths in pixels, by id; a column without one gets Excel's default. */
  readonly widths?: Readonly<Record<string, number>>;
  /** The start-pinned column ids: frozen when written first. */
  readonly pinned?: readonly string[];
  /** The grid's column definitions, groups included: the group header rows. */
  readonly groups?: readonly ColumnOrGroup<T>[];
}

/** The counts and the problems: never a cell value, a row key or a row number. */
export interface XlsxSummary extends CsvSummary {
  readonly problems: readonly Problem[];
}

/** One piece of one part of the file; the pieces of a part come together, in order. */
export interface XlsxPiece {
  readonly entry: string;
  readonly text: string;
}

/** Excel's limits (rows, header rows included, and columns). */
export const XLSX_ROWS = 1_048_576;
export const XLSX_COLUMNS = 16_384;
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const CT = 'application/vnd.openxmlformats-officedocument.spreadsheetml.';
const DAY = 86_400_000;
/** The serial of 1970-01-01 in the 1900 system; serials hold from 61 (1900-03-01). */
const EPOCH = 25_569;
const MAX_TEXT = 32_767;
const OUTLINE = 7;
const STYLES = 60_000;
const RGB = /^[0-9a-f]{6}$/i;

/** A day's serial in the 1900 system, or null before 1900-03-01 (Excel counts a 1900-02-29 that never was). */
export const serialOfDay = (d: Day): number | null => {
  const s = dayToEpochDay(d) + EPOCH;
  return s >= 61 ? s : null;
};

/**
 * The .xlsx's parts as text, a piece at a time (`chunkRows` rows of the sheet a piece), so a page can yield between
 * pieces; returns the counts and the problems. The sheet first, then the shared strings, the styles, the workbook (its
 * parts depend on what the sheet held); the fixed parts before. Never a formula. Past Excel's limits: nothing, and a
 * problem `xlsx-too-large`.
 */
export function* xlsxParts<T>(i: XlsxInput<T>, o: XlsxOptions<T> = {}): Generator<XlsxPiece, XlsxSummary> {
  const { rows, ctx } = i;
  const counts = { blank: 0, invalid: 0 };
  const env = { ctx, reader: i.reader ?? (NO_OVERLAY as ValueReader<T>) };
  const picked = csvColumns(i.columns, o.columns);
  const problems: Problem[] = picked.problems;
  const cols = picked.columns;
  const n = cols.length;
  const at = i.at ?? null;
  const total = n ? (at ? at.length : rows.count) : 0;
  const levelAt = o.tree === 'none' ? undefined : rows.levelAt;
  const lead = levelAt && o.tree === 'level' ? 1 : 0;
  const outline = !!levelAt && !lead;
  const W = n && n + lead;
  const treeAt = rows.levelAt ? Math.max(0, cols.findIndex((c) => c.id === o.treeColumn)) : -1;
  const L = Array.from({ length: W }, (_, j) => colName(j));
  const hdr = o.header !== false && W > 0;
  const chain = o.groups !== false && hdr && i.groups ? groupChains(i.groups).chain : null;
  const chainOf = (c: ResolvedColumn<T>) => chain?.get(c.id) ?? [];
  const depth = Math.max(0, ...cols.map((c) => chainOf(c).length));
  const H = hdr ? depth + 1 : 0;
  const tell = (code: Problem['code'], path: string, k?: number) => problems.push(problem(code, code === 'xlsx-too-large' ? 'error' : 'warning', path, k === undefined ? undefined : String(k)));
  if (W > XLSX_COLUMNS || H + total > XLSX_ROWS) {
    tell('xlsx-too-large', 'xlsx');
    return { rows: 0, columns: n, ...counts, problems };
  }
  const pinned = new Set(i.pinned);
  let px = 0;
  while (px < n && pinned.has(cols[px]!.id)) px++;
  const X = o.freeze === false || !px ? 0 : px + lead;
  const Y = o.freeze === false ? 0 : H;
  const book = styleBook();
  const look = (l: CellLook) => book.xf(l);

  yield { entry: '[Content_Types].xml', text: `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="${CT}sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="${CT}worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="${CT}styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="${CT}sharedStrings+xml"/></Types>` };
  const rel = (list: string) => `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list}</Relationships>`;
  yield { entry: '_rels/.rels', text: rel(`<Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/>`) };
  yield { entry: 'xl/_rels/workbook.xml.rels', text: rel(`<Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${REL}/styles" Target="styles.xml"/><Relationship Id="rId3" Type="${REL}/sharedStrings" Target="sharedStrings.xml"/>`) };

  // Shared strings, in order of first use.
  const sst = new Map<string, number>();
  let uses = 0;
  const str = (s: string): number => {
    uses++;
    let k = sst.get(s);
    if (k === undefined) sst.set(s, (k = sst.size));
    return k;
  };
  const sAttr = (s: number) => (s ? ` s="${s}"` : '');
  const textCell = (ref: string, s: string, st: number) => `<c r="${ref}"${sAttr(st)} t="s"><v>${str(s)}</v></c>`;
  const numCell = (ref: string, v: number, st: number) => `<c r="${ref}"${sAttr(st)}><v>${Object.is(v, -0) ? 0 : v}</v></c>`;

  // The application's look: checked, then shared; a bad answer or a throw ignored and told once; past the cap, plain.
  const hook = o.xlsxStyle;
  let bad = false;
  let full = false;
  const hooked = (base: CellLook, c: XlsxStyleContext<T>): number => {
    let s: XlsxStyle | null | undefined;
    try {
      s = hook!(c);
    } catch {
      s = null;
      bad = true;
    }
    if (!s) return look(base);
    const rgb = (v: unknown) => (v === undefined ? undefined : typeof v == 'string' && RGB.test(v) ? 'FF' + v.toUpperCase() : ((bad = true), undefined));
    const x = book.xf({ ...base, fill: rgb(s.fill), color: rgb(s.color), bold: base.bold || s.bold === true, italic: s.italic === true }, STYLES);
    if (x >= 0) return x;
    full = true;
    return look(base);
  };

  // ---- The header rows: group labels merged across their columns, a column's label merged upward to its first free level.
  const merges: string[] = [];
  const head: string[][] = Array.from({ length: H }, () => []);
  if (hdr) {
    const hl: CellLook = { bold: true, border: true };
    const gl = look({ ...hl, center: true });
    const put = (r: number, j: number, s: string, st: number) => (head[r]![j] = s ? textCell(L[j]! + (r + 1), s, st) : `<c r="${L[j]}${r + 1}" s="${st}"/>`);
    const leaf = (j: number, label: string, top: number, st: number) => {
      put(top, j, label, st);
      for (let r = top + 1; r < H; r++) put(r, j, '', st);
      if (top < H - 1) merges.push(`${L[j]}${top + 1}:${L[j]}${H}`);
    };
    if (lead) leaf(0, o.levelHeader ?? 'Level', 0, hook ? hooked(hl, { column: '', value: o.levelHeader ?? 'Level', row: null, header: true }) : look(hl));
    for (let k = 0; k < depth; k++) {
      for (let j = 0; j < n; ) {
        const g = chainOf(cols[j]!)[k];
        let e = j + 1;
        // A group's run: its next written columns, cut at the frozen columns' edge.
        while (g && e < n && chainOf(cols[e]!)[k]?.id === g.id && e + lead !== X) e++;
        if (g) {
          for (let c = j; c < e; c++) put(k, c + lead, c === j ? g.label : '', gl);
          if (e - j > 1) merges.push(`${L[j + lead]}${k + 1}:${L[e - 1 + lead]}${k + 1}`);
        }
        j = e;
      }
    }
    cols.forEach((c, j) => {
      const label = labelOf(c, o.text !== 'display' && (o.instants === 'utc' ? 'UTC' : ctx.timeZone));
      leaf(j + lead, label, chainOf(c).length, hook ? hooked(hl, { column: c.id, value: label, row: null, header: true }) : look(hl));
    });
  }

  // ---- What the outline needs before the rows: the deepest level, the rows past Excel's seven.
  let top = 0;
  let deep = 0;
  if (outline) {
    for (let k = 0; k < total; k++) {
      const r = (at ? at[k]! : k) as DisplayIndex;
      const nd = rows.nodeAt(r);
      if (nd.kind === 'detail' || nd.key[0] === 'l') continue;
      const lv = levelAt!.call(rows, r);
      if (lv > OUTLINE) deep++;
      top = Math.max(top, Math.min(lv, OUTLINE));
    }
    if (deep) tell('xlsx-outline-depth', 'xlsx.tree', deep);
  }

  const widths = i.widths ?? {};
  let colsXml = '';
  cols.forEach((c, j) => {
    const px = widths[c.id];
    // ECMA-376 §18.3.1.13: the width in characters of the 7 px digit, the padding included, in 256ths.
    if (typeof px == 'number' && px >= 0) colsXml += `<col min="${j + lead + 1}" max="${j + lead + 1}" width="${Math.min(255, Math.trunc((px / 7) * 256) / 256)}" customWidth="1"/>`;
  });
  const pane = X || Y ? `<pane${X ? ` xSplit="${X}"` : ''}${Y ? ` ySplit="${Y}"` : ''} topLeftCell="${colName(X)}${Y + 1}" activePane="${X && Y ? 'bottomRight' : Y ? 'bottomLeft' : 'topRight'}" state="frozen"/>` : '';
  let out = `${HEAD}<worksheet xmlns="${NS}" xmlns:r="${REL}">${outline ? '<sheetPr><outlinePr summaryBelow="0"/></sheetPr>' : ''}<sheetViews><sheetView workbookViewId="0"${o.rtl ? ' rightToLeft="1"' : ''}>${pane}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"${top ? ` outlineLevelRow="${top}"` : ''}/>${colsXml && `<cols>${colsXml}</cols>`}<sheetData>`;
  head.forEach((cells, r) => (out += `<row r="${r + 1}">${cells.join('')}</row>`));

  // ---- Each column's cell, built once: the value read as CSV reads it, then typed.
  const display = o.text === 'display';
  const wall = o.instants === 'utc' ? (ms: number) => Math.floor(ms / 1000) * 1000 : wallMs(ctx.timeZone);
  const early = new Map<number, number>();
  const cut = new Map<number, number>();
  // A span's origin column not written (j -1): its slots counted under the first column rather than a path `[-1]`.
  const more = (m: Map<number, number>, j: number) => m.set(Math.max(0, j), (m.get(Math.max(0, j)) ?? 0) + 1);
  const indents = new Map<string, number>();
  type Cell = (ref: string, node: DataNode<T>, lv: number) => string;
  const cellOf = (col: ResolvedColumn<T>, j: number): Cell => {
    const c = col.codec;
    const type = display || col.def.csv === 'text' ? 'text' : c.kind === 'number' ? 'number' : col.type;
    const fmt = type === 'day' ? 14 : type === 'instant' ? 22 : type === 'number' ? numFmtFor(col.def.numberFormat, ctx) : 0;
    const tree = outline && j === treeAt;
    /** The cell's look at a tree level: its format, the indent in the tree column. */
    const lookAt = (lv: number, f: string | number): CellLook => ({ fmt: f, ...(tree && lv && { indent: Math.min(lv, OUTLINE) }) });
    const styleAt = (lv: number, f: string | number): number => {
      const k = `${j}|${lv}|${f}`;
      let s = indents.get(k);
      if (s === undefined) indents.set(k, (s = look(lookAt(lv, f))));
      return s;
    };
    const text = (ref: string, s: string, st: number) => {
      if (s.length > MAX_TEXT) {
        more(cut, j);
        s = s.slice(0, /[\ud800-\udbff]/.test(s[MAX_TEXT - 1]!) ? MAX_TEXT - 1 : MAX_TEXT);
      }
      return textCell(ref, s, st);
    };
    return (ref, node, lv) => {
      let v: unknown;
      try {
        v = readValue(col, node, env);
      } catch {
        v = null;
      }
      let f: string | number = fmt;
      let w: (st: number) => string = (st) => (st ? `<c r="${ref}" s="${st}"/>` : '');
      if (v === undefined) counts.blank++;
      else {
        try {
          if (v === null) throw 0;
          if (type === 'text') {
            const s = display ? c.format(v, ctx) : c.toExport(v);
            w = (st) => text(ref, s, st);
          } else if (type === 'number' && typeof v == 'number') {
            if (!Number.isFinite(v)) throw 0;
            w = (st) => numCell(ref, v as number, st);
          } else if ((type === 'day' || type === 'instant') && v !== null) {
            const day = type === 'day';
            const ms = day ? 0 : wall(v as number);
            const s = day ? serialOfDay(v as Day) : ms / DAY + EPOCH >= 61 ? ms / DAY + EPOCH : null;
            if (s === null) {
              const t = day ? (v as string) : wallText(ms);
              if (t === null) throw 0;
              more(early, j);
              f = 0;
              w = (st) => text(ref, t, st);
            } else w = (st) => numCell(ref, s, st);
          } else if (type === 'boolean' && typeof v == 'boolean') w = (st) => `<c r="${ref}"${sAttr(st)} t="b"><v>${v ? 1 : 0}</v></c>`;
          else {
            const s = type === 'enum' && o.enums !== 'code' ? c.format(v, ctx) : c.toExport(v);
            w = (st) => text(ref, s, st);
          }
        } catch {
          counts.invalid++;
          v = null;
        }
      }
      // A blank or unreadable cell: no cell, unless the application gives it a look.
      return v == null && !hook ? '' : w(hook ? hooked(lookAt(lv, f), { column: col.id, value: v ?? null, row: node.data, header: false }) : styleAt(lv, f));
    };
  };
  const writers = new Map<string, Cell>();
  const writer = (col: ResolvedColumn<T>): Cell => {
    let w = writers.get(col.id);
    if (!w) writers.set(col.id, (w = cellOf(col, cols.indexOf(col))));
    return w;
  };

  // ---- Spans: CSV's, and with `merge` the value once where every slot is written (all the rows: no `at`).
  const map = i.spans && !i.spans.none ? i.spans : null;
  const ids = i.spanColumns ?? [];
  const place = cols.map((c) => ids.indexOf(c.id));
  const merging = o.spans === 'merge' && !at;
  /** The merges kept, by origin (`row:col` in the map): the output column. */
  const merged = new Map<string, [SpanCell, number]>();
  const outRow = merging && map ? new Int32Array(rows.count) : null;
  const size = Number.isInteger(o.chunkRows) && o.chunkRows! > 0 ? o.chunkRows! : 500;
  let written = 0;
  for (let k = 0; k < total; k++) {
    const r = at ? at[k]! : k;
    const node: RowNode<T> = rows.nodeAt(r as DisplayIndex);
    if (node.kind === 'detail' || node.key[0] === 'l') continue;
    const y = H + ++written;
    if (outRow) outRow[r] = y;
    const lv = levelAt ? levelAt.call(rows, r as DisplayIndex) : 0;
    let over: SpanCell[] | null = null;
    if (map && !map.fullWidth(r)) {
      for (const s of map.inRow(r, 0, ids.length - 1)) {
        if (s.rows === 1 && s.cols === 1) continue;
        over ??= [];
        for (let c = s.col; c < s.col + s.cols; c++) over[c] = s;
      }
    }
    let line = `<row r="${y}"${outline && lv ? ` outlineLevel="${Math.min(lv, OUTLINE)}"` : ''}>`;
    if (lead) line += numCell(`A${y}`, lv + 1, 0);
    cols.forEach((col, j) => {
      const ref = L[j + lead]! + y;
      // A filler: its label in the tree column, nothing else.
      if (node.kind !== 'data') {
        if (j === treeAt) line += textCell(ref, node.kind === 'group' ? node.label : '', outline && lv ? look({ indent: Math.min(lv, OUTLINE) }) : 0);
        return;
      }
      const s = over?.[place[j]!];
      if (!s || (s.row === r && s.col === place[j])) {
        // A merge where its slots are written side by side in the same order.
        if (s && merging && place.slice(j, j + s.cols).every((p, q) => p === s.col + q)) merged.set(`${s.row}:${s.col}`, [s, j]);
        line += writer(col)(ref, node, lv);
        return;
      }
      if (merged.has(`${s.row}:${s.col}`)) return;
      const origin = i.columns.get(ids[s.col]!);
      const from = rows.nodeAt(s.row as DisplayIndex);
      if (origin && from.kind === 'data') line += writer(origin)(ref, from, lv);
    });
    out += line + '</row>';
    if (written % size === 0) {
      yield { entry: 'xl/worksheets/sheet1.xml', text: out };
      out = '';
    }
  }
  for (const [s, j] of merged.values()) merges.push(`${L[j + lead]}${outRow![s.row]}:${L[j + lead + s.cols - 1]}${outRow![s.row + s.rows - 1]}`);
  const range = hdr ? `${L[0]}${H}:${L[W - 1]}${H + written}` : '';
  out += `</sheetData>${range && `<autoFilter ref="${range}"/>`}${merges.length ? `<mergeCells count="${merges.length}">${merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : ''}</worksheet>`;
  yield { entry: 'xl/worksheets/sheet1.xml', text: out };

  let t = `${HEAD}<sst xmlns="${NS}" count="${uses}" uniqueCount="${sst.size}">`;
  let m = 0;
  for (const s of sst.keys()) {
    t += `<si>${tEl(s)}</si>`;
    if (++m % 2000 === 0) {
      yield { entry: 'xl/sharedStrings.xml', text: t };
      t = '';
    }
  }
  yield { entry: 'xl/sharedStrings.xml', text: t + '</sst>' };
  yield { entry: 'xl/styles.xml', text: HEAD + book.text() };
  const name = sheetNameOf(o.sheetName);
  const abs = range.replace(/([A-Z]+)(\d+)/g, '$$$1$$$2');
  yield { entry: 'xl/workbook.xml', text: `${HEAD}<workbook xmlns="${NS}" xmlns:r="${REL}"><sheets><sheet name="${esc(name)}" sheetId="1" r:id="rId1"/></sheets>${range && `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${esc(name.replace(/'/g, "''"))}'!${abs}</definedName></definedNames>`}</workbook>` };

  early.forEach((k, j) => tell('xlsx-early-day', `xlsx.columns[${j}]`, k));
  cut.forEach((k, j) => tell('xlsx-text-cut', `xlsx.columns[${j}]`, k));
  if (bad) tell('invalid-setting', 'xlsx.xlsxStyle');
  if (full) tell('xlsx-style-limit', 'xlsx.xlsxStyle');
  return { rows: written, columns: n, ...counts, problems };
}

/**
 * The whole file at once, for a Node server or a test: the parts encoded, each checked (CRC) and deflated by `deflate`
 * (node's `zlib.deflateRawSync`, say) or stored; the ZIP's pieces and the summary. Past 4 GB: no pieces, a problem.
 */
export function toXlsx<T>(i: XlsxInput<T>, o?: XlsxOptions<T>, deflate?: (b: Uint8Array) => Uint8Array): { readonly parts: Uint8Array[]; readonly summary: XlsxSummary } {
  const texts = new Map<string, string>();
  const it = xlsxParts(i, o);
  let r = it.next();
  for (; !r.done; r = it.next()) texts.set(r.value.entry, (texts.get(r.value.entry) ?? '') + r.value.text);
  if (!texts.size) return { parts: [], summary: r.value };
  const z = zipFile([...texts].map(([name, s]) => {
    const b = utf8(s);
    return { name, crc: crc32(b), size: b.length, ...(deflate ? { method: 8 as const, data: [deflate(b)] } : { method: 0 as const, data: [b] }) };
  }));
  return { parts: z.parts, summary: { ...r.value, problems: [...r.value.problems, ...z.problems] } };
}
