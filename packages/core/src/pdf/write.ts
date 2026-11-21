import { NO_OVERLAY, type ColumnOrGroup, type ResolvedColumn, type ValueReader } from '../columns/defs.js';
import type { DisplayIndex } from '../ids.js';
import { problem, type Problem } from '../problems.js';
import type { DataNode, RowNode } from '../row/node.js';
import { groupChains } from '../spans/bands.js';
import { csvColumns, type CsvInput, type CsvSummary } from '../csv/chunks.js';
import type { CsvScope } from '../csv/rows.js';
import type { Query } from '../model/query.js';
import type { LocaleCtx } from '../value/locale.js';
import { labelOf, readValue } from '../csv/writers.js';
import { HELVETICA, winAnsi } from './afm.js';
import { readTrueType, type TrueType } from './ttf.js';

/** What a title, subtitle or footer function is told by the DOM export: as Excel's (xlsx-export.md 6). */
export interface PdfTextContext {
  readonly rows: number;
  readonly scope: CsvScope;
  readonly query: Query;
  readonly now: number;
  readonly ctx: LocaleCtx;
}
/** A text, texts one line each, or (in the DOM export) a function of the export giving them. */
export type PdfText = string | readonly string[] | ((c: PdfTextContext) => string | readonly string[]);

/** How the .pdf is written (docs/behaviors/pdf-export.md); every option has a default. */
export interface PdfOptions {
  /** `a4` (default) or `letter`. */
  readonly page?: 'a4' | 'letter' | undefined;
  /** `auto` (default): landscape when the columns do not fit the portrait page. */
  readonly orientation?: 'auto' | 'portrait' | 'landscape' | undefined;
  /** Around the page, in points (default 36). */
  readonly margin?: number | undefined;
  /** The cells' size in points (default 8); a table shrunk to fit never goes under half of it. */
  readonly fontSize?: number | undefined;
  /** Lines a cell wraps to at most (default 3), the rest cut with « … »; 1: one line, clipped. */
  readonly wrap?: number | undefined;
  /** Header rows on every page (default true). */
  readonly header?: boolean | undefined;
  /** A header row per column-group level (default true). */
  readonly groups?: boolean | undefined;
  /** Column ids, in order; default the visible columns. */
  readonly columns?: readonly string[] | undefined;
  /** The column that carries a tree's indent and a group's label; absent: the first written. */
  readonly treeColumn?: string | undefined;
  /** `false`: the data rows only (no group, footer or totals row). */
  readonly groupRows?: boolean | undefined;
  /** Above the table on the first page, bold 14 pt; a function is the DOM export's (here: `invalid-setting`). */
  readonly title?: PdfText | undefined;
  readonly subtitle?: PdfText | undefined;
  /** Under the table on the last page. */
  readonly footer?: PdfText | undefined;
  /** « 1 / 3 » at the bottom of each page (default true); a function gives the application's words. */
  readonly pageNumbers?: boolean | ((page: number, pages: number) => string) | undefined;
  /** A TrueType font (.ttf) embedded for every text (pdf-export.md 13); absent: Helvetica, WinAnsi only. */
  readonly font?: ArrayBuffer | Uint8Array | undefined;
  /** Its bold face; absent: the regular one drawn heavier. */
  readonly boldFont?: ArrayBuffer | Uint8Array | undefined;
  /** The first column on the right. */
  readonly rtl?: boolean | undefined;
}

/** What the file is written from: CSV's input, the grid's widths and column groups, and (DOM) the screen's text. */
export interface PdfInput<T> extends CsvInput<T> {
  /** Column widths in CSS pixels, by id; default 100. */
  readonly widths?: Readonly<Record<string, number>>;
  /** The grid's column definitions, groups included: the group header rows. */
  readonly groups?: readonly ColumnOrGroup<T>[];
  /**
   * A cell's text as the screen shows it (the DOM export: a `showAs` share, a group's or the totals row's cell as print
   * writes them); absent, or undefined for a cell: the value read as every export reads it, in the column's format; a
   * group's label and its totals formatted.
   */
  readonly text?: ((node: RowNode<T>, column: ResolvedColumn<T>) => string | undefined) | undefined;
}

/** The counts and the problems: never a cell value, a row key or a row number. */
export interface PdfSummary extends CsvSummary {
  readonly problems: readonly Problem[];
  readonly pages: number;
}
/** One object of the file: its number, its dictionary's entries (no `<< >>`, no `/Length`), its stream's bytes. */
export interface PdfObject {
  readonly id: number;
  readonly dict: string;
  readonly data?: Uint8Array;
}
/** What `pdfParts` yields: an object, or (a number) the rows laid out so far, so a page can yield and say progress. */
export type PdfPiece = PdfObject | number;

export const PDF_MIME = 'application/pdf';

const SIZES = { a4: [595.28, 841.89], letter: [612, 792] } as const;
/** CSS pixels to points: 96 to the inch, 72 points. */
const PX = 0.75;
/** Letters that need shaping or right-to-left ordering (pdf-export.md 14): Hebrew to N'Ko and Arabic's extensions, the Indic and South-East Asian scripts, the presentation forms, and the same in the upper planes. */
const SHAPED = /[֐-ࣿऀ-࿿က-႟ᜀ-᢯ᨀ-ᱏꠀ-꫟יִ-﷿ﹰ-﻾]|[\ud802\ud803\ud83a\ud83b]/;
/** Invisible format characters, dropped. */
const DROP = /[­​-‏‪-‮⁠-⁩﻿]/g;
/** Spaces of other widths (French numbers' U+202F) as a space; the minus sign as a hyphen; a tab a space. */
const SPACES = /[\t -   　]/g;

const num = (n: number): string => String(Math.round(n * 100) / 100);
const ascii = (s: string): Uint8Array => {
  const b = new Uint8Array(s.length);
  for (let k = 0; k < s.length; k++) b[k] = s.charCodeAt(k);
  return b;
};
/** A text string of the document's properties: UTF-16BE, its mark first. */
const utf16 = (s: string): string => '<FEFF' + Array.from(s, (c) => c.charCodeAt(0).toString(16).padStart(4, '0')).join('') + '>';
const hex4 = (n: number): string => n.toString(16).padStart(4, '0');

/** A face the text is drawn with: a width per character (thousandths), its token for the content stream. */
interface Face {
  /** The character's width, or -1 when the face has none. */
  w(cp: number): number;
  tok(cps: readonly number[]): string;
  readonly ttf: TrueType | null;
  /** The characters written, by glyph (a TrueType face's ToUnicode map). */
  readonly seen: Map<number, number>;
}
const helvetica = (bold: 0 | 1): Face => ({
  w: (cp) => {
    const c = winAnsi(cp);
    return c ? HELVETICA[bold][c]! : -1;
  },
  tok: (cps) => {
    let s = '(';
    for (const cp of cps) {
      const c = winAnsi(cp);
      s += c === 40 || c === 41 || c === 92 ? '\\' + String.fromCharCode(c) : c > 126 ? '\\' + c.toString(8) : String.fromCharCode(c);
    }
    return s + ')';
  },
  ttf: null,
  seen: new Map(),
});
const trueType = (f: TrueType): Face => {
  const seen = new Map<number, number>();
  return {
    w: (cp) => {
      const g = f.glyph(cp);
      return g ? f.advance(g) : -1;
    },
    tok: (cps) => {
      let s = '<';
      for (const cp of cps) {
        const g = f.glyph(cp);
        seen.has(g) || seen.set(g, cp);
        s += hex4(g);
      }
      return s + '>';
    },
    ttf: f,
    seen,
  };
};

/** One line of a cell: its token, its width in points. */
interface Line {
  readonly t: string;
  readonly w: number;
}
const enum K {
  Data,
  Group,
  Total,
}
interface Laid {
  readonly kind: K;
  readonly h: number;
  readonly level: number;
  readonly cells: readonly (readonly Line[])[];
}

/**
 * The .pdf's objects, a page at a time, after the rows are laid out (a number yielded every 200 rows: the rows so far);
 * returns the counts and the problems. Right-to-left or shaped letters anywhere: nothing yielded, an error `pdf-script`.
 */
export function* pdfParts<T>(i: PdfInput<T>, o: PdfOptions = {}): Generator<PdfPiece, PdfSummary> {
  const { rows, ctx } = i;
  const counts = { blank: 0, invalid: 0 };
  const env = { ctx, reader: i.reader ?? (NO_OVERLAY as ValueReader<T>) };
  const picked = csvColumns(i.columns, o.columns);
  const problems: Problem[] = picked.problems;
  const cols = picked.columns;
  const n = cols.length;
  const at = i.at ?? null;
  const total = n ? (at ? at.length : rows.count) : 0;
  const flat = o.groupRows === false;
  const skip = (nd: RowNode<T>) => nd.kind === 'detail' || nd.key[0] === 'l' || (flat && nd.kind !== 'data');
  const levelAt = rows.levelAt;
  const treeAt = Math.max(0, cols.findIndex((c) => c.id === o.treeColumn));
  const counted = new Map<string, Map<string, number>>();
  const more = (code: string, path: string) => {
    const m = counted.get(code) ?? counted.set(code, new Map()).get(code)!;
    m.set(path, (m.get(path) ?? 0) + 1);
  };
  const tell = (code: Problem['code'], path: string, k?: number) => problems.push(problem(code, code === 'pdf-script' || code === 'pdf-font' ? 'error' : 'warning', path, k === undefined ? undefined : String(k)));
  const stop = (): PdfSummary => {
    for (const [p, k] of counted.get('pdf-script') ?? []) tell('pdf-script', p, k);
    return { rows: 0, columns: n, ...counts, problems, pages: 0 };
  };

  // ---- Faces: the application's TrueType fonts, else Helvetica.
  const load = (b: unknown, path: string): TrueType | null => {
    if (b == null) return null;
    const f = b instanceof ArrayBuffer || b instanceof Uint8Array ? readTrueType(b) : null;
    if (!f) tell('pdf-font', path);
    return f;
  };
  const F = load(o.font, 'pdf.font');
  const FB = F && load(o.boldFont, 'pdf.boldFont');
  const regular = F ? trueType(F) : helvetica(0);
  const faces: [Face, Face] = [regular, F ? (FB ? trueType(FB) : regular) : helvetica(1)];
  // No bold face given: the regular one drawn heavier (filled and stroked).
  const fakeBold = !!F && !FB;

  // ---- Page and scale.
  const clamp = (v: unknown, lo: number, hi: number, d: number) => (typeof v == 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  const M = clamp(o.margin, 0, 144, 36);
  const base = clamp(o.fontSize, 4, 24, 8);
  const most = Math.trunc(clamp(o.wrap, 1, 50, 3));
  const [pw0, ph0] = SIZES[o.page === 'letter' ? 'letter' : 'a4'];
  const natural = cols.map((c) => {
    const px = i.widths?.[c.id];
    return (typeof px == 'number' && px > 0 && Number.isFinite(px) ? px : 100) * PX;
  });
  const want = natural.reduce((a, b) => a + b, 0);
  const land = o.orientation === 'landscape' || (o.orientation !== 'portrait' && want > pw0 - 2 * M);
  const [PW, PH] = land ? [ph0, pw0] : [pw0, ph0];
  const room = Math.max(1, PW - 2 * M);
  const s = want > room ? room / want : 1;
  const widths = natural.map((w) => w * s);
  const fs = base * Math.max(s, 0.5);
  const padX = fs * 0.5;
  const padY = fs * 0.35;
  const LH = fs * 1.2;
  const indent = fs * 1.25;
  const rtl = !!o.rtl;
  // Each column's edges, from the page's left.
  const left: number[] = [];
  let cum = 0;
  for (const w of widths) left.push(rtl ? PW - M - cum - w : M + cum), (cum += w);
  const tableW = cum;
  const x0 = rtl ? PW - M - tableW : M;

  // ---- Text: cleaned, checked, mapped to the face, wrapped.
  let script = false;
  const clean = (raw: string, path: string): string | null => {
    const t = raw.normalize('NFC').replace(DROP, '').replace(SPACES, ' ').replace(/−/g, '-');
    if (SHAPED.test(t)) {
      script = true;
      more('pdf-script', path);
      return null;
    }
    return t;
  };
  const fit = (raw: string, face: Face, size: number, width: number, lines: number, path: string, nowrap = false): Line[] => {
    const t = clean(raw, path);
    if (t === null || t === '') return [];
    const k = size / 1000;
    let miss = false;
    const q = face.w(63);
    const wOf = (cp: number) => face.w(cp) * k;
    const paras = t.split(/\r\n|\r|\n/).map((p) =>
      Array.from(p, (c) => {
        const cp = c.codePointAt(0)!;
        if (face.w(cp) >= 0) return cp;
        miss = true;
        return q >= 0 ? 63 : 32;
      }),
    );
    if (miss) more('pdf-glyph', path);
    const out: number[][] = [];
    const sp = wOf(32);
    for (const p of nowrap ? [paras.flatMap((x, j) => (j ? [32, ...x] : x))] : paras) {
      if (nowrap) {
        out.push(p);
        continue;
      }
      let line: number[] = [];
      let lw = 0;
      // Words: runs of non-spaces.
      for (const word of p.reduce<number[][]>((a, cp) => (cp === 32 ? a.push([]) : a[a.length - 1]!.push(cp), a), [[]])) {
        if (!word.length) continue;
        const ww = word.reduce((a, cp) => a + wOf(cp), 0);
        if (line.length && lw + sp + ww <= width) {
          line.push(32, ...word);
          lw += sp + ww;
          continue;
        }
        if (line.length) out.push(line), (line = []), (lw = 0);
        if (ww <= width) {
          (line = word), (lw = ww);
          continue;
        }
        for (const cp of word) {
          const cw = wOf(cp);
          if (line.length && lw + cw > width) out.push(line), (line = []), (lw = 0);
          line.push(cp);
          lw += cw;
        }
      }
      out.push(line);
    }
    const width_ = (l: readonly number[]) => l.reduce((a, cp) => a + wOf(cp), 0);
    let kept = out.slice(0, lines);
    if (out.length > lines || width_(kept[kept.length - 1]!) > width) {
      // Cut: the last line ends with « … » (three dots where the face has none).
      const dots = face.w(0x2026) >= 0 ? [0x2026] : [46, 46, 46];
      const dw = width_(dots);
      const last = [...kept[kept.length - 1]!];
      while (last.length && width_(last) + dw > width) last.pop();
      while (last[last.length - 1] === 32) last.pop();
      kept = [...kept.slice(0, -1), [...last, ...dots]];
      more('pdf-text-cut', path);
    }
    return kept.map((l) => ({ t: face.tok(l), w: width_(l) }));
  };

  // ---- Titles and footer: texts only, a bad value left out and told.
  const texts = (k: 'title' | 'subtitle' | 'footer'): string[] => {
    const a: unknown[] = n ? [o[k] ?? []].flat() : [];
    return a.some((x) => typeof x != 'string') ? (tell('invalid-setting', `pdf.${k}`), []) : (a as string[]);
  };
  const TS = 14;
  const SS = 9;
  const T0 = texts('title');
  const block = (k: 'title' | 'subtitle' | 'footer', bold: boolean, size: number): Line[] => (k === 'title' ? T0 : texts(k)).flatMap((t) => (t ? fit(t, faces[bold ? 1 : 0], size, PW - 2 * M, 3, `pdf.${k}`) : [{ t: '()', w: 0 }]));
  const title = block('title', true, TS);
  const sub = block('subtitle', false, SS);
  const foot = block('footer', false, SS);

  // ---- The header rows: group labels over their runs, then the columns' labels.
  const hdr = o.header !== false && n > 0;
  const chain = o.groups !== false && hdr && i.groups ? groupChains(i.groups).chain : null;
  const chainOf = (c: ResolvedColumn<T>) => chain?.get(c.id) ?? [];
  const depth = Math.max(0, ...cols.map((c) => chainOf(c).length));
  const align = (c: ResolvedColumn<T>, head?: boolean): 'start' | 'center' | 'end' => (head && c.def.headerAlign) || c.def.align || (c.type === 'number' ? 'end' : 'start');
  /** Per header level: the runs `[first, last, label line]`. */
  const bands: [number, number, Line | undefined][][] = [];
  for (let k = 0; k < depth; k++) {
    const runs: [number, number, Line | undefined][] = [];
    for (let j = 0; j < n; ) {
      const g = chainOf(cols[j]!)[k];
      let e = j + 1;
      while (g && e < n && chainOf(cols[e]!)[k]?.id === g.id) e++;
      if (g) runs.push([j, e - 1, fit(g.label, faces[1], fs, widths.slice(j, e).reduce((a, b) => a + b, 0) - 2 * padX, 1, `pdf.columns[${j}]`, true)[0]]);
      j = e;
    }
    bands.push(runs);
  }
  const heads = hdr ? cols.map((c, j) => fit(labelOf(c, false), faces[1], fs, widths[j]! - 2 * padX, most, `pdf.columns[${j}]`)) : [];
  const leafH = hdr ? Math.max(1, ...heads.map((l) => l.length)) * LH + 2 * padY : 0;
  const HH = hdr ? depth * (LH + 2 * padY) + leafH : 0;

  // ---- The rows, laid out: each cell's lines, the row's height.
  const fns = i.aggFuncs;
  const value = (col: ResolvedColumn<T>, node: RowNode<T>): string => {
    if (node.kind === 'data') {
      let v: unknown;
      try {
        v = readValue(col, node as DataNode<T>, env);
      } catch {
        v = null;
      }
      if (v === undefined) return (counts.blank++, '');
      if (v === null) return (counts.invalid++, '');
      try {
        return col.codec.format(v as never, ctx);
      } catch {
        return (counts.invalid++, '');
      }
    }
    const fn = fns && Object.hasOwn(fns, col.id) ? fns[col.id] : col.def.aggFunc;
    const a = (node as { aggs?: Record<string, unknown> }).aggs?.[col.id];
    if (a == null) return '';
    try {
      if (fn === 'count') return String(a);
      const v = typeof fn == 'function' ? col.codec.coerce(a, ctx) : a;
      return v == null ? '' : col.codec.format(v as never, ctx);
    } catch {
      return '';
    }
  };
  const textOf = (col: ResolvedColumn<T>, node: RowNode<T>, j: number): string => {
    if (i.text) {
      // The screen's text where the hook gives one (a throw: an empty cell).
      try {
        const t = i.text(node, col);
        if (t !== undefined) return String(t);
      } catch {
        return '';
      }
    }
    if (node.kind !== 'data' && j === treeAt) return node.kind === 'group' || node.kind === 'footer' ? (i.groupLabel?.(node) ?? node.label) : '';
    return value(col, node);
  };
  const laid: Laid[] = [];
  for (let k = 0; k < total; k++) {
    const r = at ? at[k]! : k;
    const node: RowNode<T> = rows.nodeAt(r as DisplayIndex);
    if (skip(node)) continue;
    const kind = node.kind === 'data' ? K.Data : node.kind === 'group' ? K.Group : K.Total;
    const lv = levelAt ? levelAt.call(rows, r as DisplayIndex) : 0;
    const face = faces[kind === K.Data ? 0 : 1];
    const cells = cols.map((col, j) => {
      // A filler (no totals): its label only.
      if (node.kind !== 'data' && j !== treeAt && !('aggs' in node)) return [];
      const t = textOf(col, node, j);
      const w = widths[j]! - 2 * padX - (j === treeAt ? lv * indent : 0);
      return fit(t, face, fs, Math.max(w, fs), most, `pdf.columns[${j}]`, col.codec.kind === 'number' || col.type === 'number');
    });
    laid.push({ kind, level: lv, cells, h: Math.max(1, ...cells.map((c) => c.length)) * LH + 2 * padY });
    if (laid.length % 200 === 0) yield laid.length;
  }
  // ---- Pages: the rows placed, never split; the header on each.
  const top = PH - M;
  const bottom = M;
  const titleH = title.length * TS * 1.25 + sub.length * SS * 1.3 + (title.length || sub.length ? fs : 0);
  const pages: [number, number][] = [];
  let y = top - titleH - HH;
  let from = 0;
  laid.forEach((row, k) => {
    if (y - row.h < bottom && k > from) pages.push([from, k]), (from = k), (y = top - HH);
    y -= row.h;
  });
  pages.push([from, laid.length]);
  const footH = foot.length ? fs + foot.length * SS * 1.3 : 0;
  const footPage = foot.length > 0 && y - footH < bottom;
  if (footPage) pages.push([laid.length, laid.length]);
  const P = pages.length;
  // « 1 / 3 », or the application's words.
  const pn = o.pageNumbers ?? true;
  const labels = pages.map((_, p) => {
    let t = pn === false ? '' : `${p + 1} / ${P}`;
    if (typeof pn == 'function') {
      try {
        const x = pn(p + 1, P);
        t = typeof x == 'string' ? x : '';
      } catch {
        t = '';
      }
    }
    return t ? fit(t, faces[0], 8, PW - 2 * M, 1, 'pdf.pageNumbers', true)[0] : undefined;
  });
  if (script) return stop();
  for (const [code, m] of counted) for (const [p, k] of m) tell(code as Problem['code'], p, k);

  // ---- Objects: 1 the catalog, 2 the properties, 3 the pages, 4 the resources, 5–6 the fonts, then each TrueType
  // font's own four, then each page and its content. A number left unused (the bold font drawn from the regular) is a
  // free entry of the cross-reference table.
  let next = 7;
  const fontIds = faces.map((f, k) => (f.ttf && !(k && fakeBold) ? [next++, next++, next++, next++] : []));
  const firstPage = next;
  const heavy = (on: boolean) => (fakeBold ? (on ? ` 0 G ${num(fs * 0.025)} w 2 Tr` : ' 0 Tr') : '');
  /** A title's, subtitle's or footer's line at the page's start. */
  const edge = (l: Line) => (rtl ? PW - M - l.w : M);
  for (let p = 0; p < P; p++) {
    const [a, b] = pages[p]!;
    let g = '';
    let t = 'BT';
    let font = '';
    let gray = -1;
    const setFont = (f: 0 | 1, size: number) => {
      const want = `/F${f + 1} ${num(size)} Tf${heavy(f === 1 && size === fs)}`;
      if (want !== font) (t += ` ${want}`), (font = want);
    };
    const setGray = (v: number) => v !== gray && ((t += ` ${v} g`), (gray = v));
    const text = (l: Line, x: number, yy: number) => (t += `\n1 0 0 1 ${num(x)} ${num(yy)} Tm ${l.t} Tj`);
    /** A line at a side of the box `[x, w]`: the start (right in right-to-left), the end, or the middle. */
    const place = (l: Line, x: number, w: number, side: 'start' | 'center' | 'end', ind = 0) =>
      side === 'center' ? x + (w - l.w) / 2 : (side === 'end') !== rtl ? x + w - padX - ind - l.w : x + padX + ind;
    let yy = top;
    if (p === 0 && (title.length || sub.length)) {
      setFont(1, TS);
      setGray(0);
      for (const l of title) text(l, edge(l), (yy -= TS * 1.25) + TS * 0.25);
      setFont(0, SS);
      setGray(0.33);
      for (const l of sub) text(l, edge(l), (yy -= SS * 1.3) + SS * 0.3);
      yy -= fs;
    }
    if (hdr && (a < b || p === 0)) {
      g += `0.92 g ${num(x0)} ${num(yy - HH)} ${num(tableW)} ${num(HH)} re f\n`;
      setFont(1, fs);
      setGray(0);
      for (const runs of bands) {
        for (const [j, e, l] of runs) {
          const xs = Math.min(left[j]!, left[e]!);
          const w = widths.slice(j, e + 1).reduce((u, v) => u + v, 0);
          if (l) text(l, place(l, xs, w, 'center'), yy - padY - fs * 0.92);
          g += `0.7 G 0.5 w ${num(xs + 2)} ${num(yy - LH - 2 * padY)} m ${num(xs + w - 2)} ${num(yy - LH - 2 * padY)} l S\n`;
        }
        yy -= LH + 2 * padY;
      }
      heads.forEach((ls, j) => ls.forEach((l, q) => text(l, place(l, left[j]!, widths[j]!, align(cols[j]!, true)), yy - padY - fs * 0.92 - q * LH)));
      yy -= leafH;
      g += `0.4 G 0.75 w ${num(x0)} ${num(yy)} m ${num(x0 + tableW)} ${num(yy)} l S\n`;
    }
    for (let k = a; k < b; k++) {
      const row = laid[k]!;
      if (row.kind === K.Group) g += `0.96 g ${num(x0)} ${num(yy - row.h)} ${num(tableW)} ${num(row.h)} re f\n`;
      if (row.kind === K.Total) g += `0.4 G 0.5 w ${num(x0)} ${num(yy)} m ${num(x0 + tableW)} ${num(yy)} l S\n`;
      setFont(row.kind === K.Data ? 0 : 1, fs);
      setGray(0);
      row.cells.forEach((ls, j) => {
        const ind = j === treeAt ? row.level * indent : 0;
        ls.forEach((l, q) => text(l, place(l, left[j]!, widths[j]!, align(cols[j]!), ind), yy - padY - fs * 0.92 - q * LH));
      });
      yy -= row.h;
      g += `0.85 G 0.25 w ${num(x0)} ${num(yy)} m ${num(x0 + tableW)} ${num(yy)} l S\n`;
    }
    if (foot.length && p === P - 1) {
      if (!footPage) yy -= fs;
      setFont(0, SS);
      setGray(0.33);
      for (const l of foot) text(l, edge(l), (yy -= SS * 1.3) + SS * 0.3);
    }
    const pl = labels[p];
    if (pl) setFont(0, 8), setGray(0.33), text(pl, (PW - pl.w) / 2, Math.max(2, M / 2 - 3));
    const id = firstPage + p * 2;
    yield { id: id + 1, dict: '', data: ascii(`${g}${t}${fakeBold ? ' 0 Tr' : ''}\nET\n`) };
    yield { id, dict: `/Type /Page /Parent 3 0 R /MediaBox [0 0 ${num(PW)} ${num(PH)}] /Resources 4 0 R /Contents ${id + 1} 0 R` };
  }

  // ---- The fonts: Helvetica by name, or the TrueType subset embedded with its widths and its ToUnicode map.
  for (let f = 0; f < (fakeBold ? 1 : 2); f++) {
    const face = faces[f]!;
    const tt = face.ttf;
    if (!tt) {
      yield { id: 5 + f, dict: `/Type /Font /Subtype /Type1 /BaseFont /${f ? 'Helvetica-Bold' : 'Helvetica'} /Encoding /WinAnsiEncoding` };
      continue;
    }
    const [cid, desc, file, map] = fontIds[f]!;
    const used = [0, ...face.seen.keys()].sort((x, z) => x - z).filter((x, k, l) => !k || l[k - 1] !== x);
    // A subset's name: six letters from its glyphs (the same glyphs, the same name).
    let h = 2166136261;
    for (const x of used) h = Math.imul(h ^ x, 16777619) >>> 0;
    let tag = '';
    for (let k = 0; k < 6; k++) (tag += String.fromCharCode(65 + (h % 26))), (h = Math.floor(h / 26));
    const name = `${tag}+DzGrid${f ? 'Bold' : 'Font'}`;
    const raw = tt.subset(new Set(used));
    yield { id: file!, dict: `/Length1 ${raw.length}`, data: raw };
    yield { id: desc!, dict: `/Type /FontDescriptor /FontName /${name} /Flags 32 /FontBBox [${tt.box.join(' ')}] /ItalicAngle 0 /Ascent ${tt.ascent} /Descent ${tt.descent} /CapHeight ${tt.cap} /StemV 80 /FontFile2 ${file} 0 R` };
    yield { id: cid!, dict: `/Type /Font /Subtype /CIDFontType2 /BaseFont /${name} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${desc} 0 R /W [${used.map((x) => `${x} [${tt.advance(x)}]`).join(' ')}] /CIDToGIDMap /Identity` };
    // The ToUnicode map: each glyph back to its character, so the text copies and searches.
    const pairs = [...face.seen].sort((x, z) => x[0] - z[0]);
    let cmap = '/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n';
    for (let k = 0; k < pairs.length; k += 100) {
      const part = pairs.slice(k, k + 100);
      cmap += `${part.length} beginbfchar\n${part.map(([gl, cp]) => `<${hex4(gl)}> <${Array.from(String.fromCodePoint(cp).split(''), (c) => hex4(c.charCodeAt(0))).join('')}>`).join('\n')}\nendbfchar\n`;
    }
    yield { id: map!, dict: '', data: ascii(cmap + 'endcmap\nCMapName currentdict /CIDResource defineresource pop\nend\nend\n') };
    yield { id: 5 + f, dict: `/Type /Font /Subtype /Type0 /BaseFont /${name} /Encoding /Identity-H /DescendantFonts [${cid} 0 R] /ToUnicode ${map} 0 R` };
  }
  yield { id: 4, dict: `/Font << /F1 5 0 R /F2 ${fakeBold ? 5 : 6} 0 R >>` };
  yield { id: 3, dict: `/Type /Pages /Kids [${pages.map((_, p) => `${firstPage + p * 2} 0 R`).join(' ')}] /Count ${P}` };
  const name = T0[0];
  yield { id: 2, dict: `/Producer (DzGrid)${name ? ` /Title ${utf16(name.normalize('NFC'))}` : ''}` };
  yield { id: 1, dict: `/Type /Catalog /Pages 3 0 R${rtl ? ' /ViewerPreferences << /Direction /R2L >>' : ''}` };
  return { rows: laid.length, columns: n, ...counts, problems, pages: P };
}

/**
 * The file around the objects (ISO 32000-1 §7.5): the header, each object as given (a stream's bytes as they come:
 * `deflated` when the caller compressed them, FlateDecode), then the cross-reference table, the trailer and
 * `startxref`. The pieces in order; `end()` gives the last ones.
 */
export function pdfFile(): { add(o: PdfObject, deflated?: Uint8Array): Uint8Array[]; end(): Uint8Array[] } {
  const offs: number[] = [];
  let pos = 0;
  const out = (s: string | Uint8Array): Uint8Array => {
    const b = typeof s == 'string' ? ascii(s) : s;
    pos += b.length;
    return b;
  };
  let head: Uint8Array | null = out('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n');
  return {
    add(o, deflated) {
      const first = head ? [head] : [];
      head = null;
      offs[o.id] = pos;
      const d = deflated ?? o.data;
      const dict = `<<${o.dict ? ' ' + o.dict : ''}${d ? ` /Length ${d.length}${deflated ? ' /Filter /FlateDecode' : ''}` : ''} >>`;
      return d ? [...first, out(`${o.id} 0 obj\n${dict}\nstream\n`), out(d), out('\nendstream\nendobj\n')] : [...first, out(`${o.id} 0 obj\n${dict}\nendobj\n`)];
    },
    end() {
      const at = pos;
      let x = `xref\n0 ${offs.length || 1}\n0000000000 65535 f \n`;
      for (let k = 1; k < offs.length; k++) x += offs[k] === undefined ? '0000000000 65535 f \n' : `${String(offs[k]).padStart(10, '0')} 00000 n \n`;
      return [...(head ? [head] : []), out(`${x}trailer\n<< /Size ${offs.length || 1} /Root 1 0 R /Info 2 0 R >>\nstartxref\n${at}\n%%EOF\n`)];
    },
  };
}

/**
 * The whole file at once, for a Node server or a test: each stream deflated by `deflate` (node's `zlib.deflateSync`,
 * zlib-wrapped, as FlateDecode reads) or stored. No parts when nothing could be written (`pdf-script`).
 */
export function toPdf<T>(i: PdfInput<T>, o?: PdfOptions, deflate?: (b: Uint8Array) => Uint8Array): { readonly parts: Uint8Array[]; readonly summary: PdfSummary } {
  const f = pdfFile();
  const parts: Uint8Array[] = [];
  const it = pdfParts(i, o);
  let r = it.next();
  for (; !r.done; r = it.next()) if (typeof r.value != 'number') parts.push(...f.add(r.value, r.value.data && deflate ? deflate(r.value.data) : undefined));
  return { parts: parts.length ? [...parts, ...f.end()] : [], summary: r.value };
}
