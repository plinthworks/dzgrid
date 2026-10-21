import { NO_OVERLAY, type ResolvedColumn, type ValueReader } from '../columns/defs.js';
import type { ColumnLookup } from '../columns/model.js';
import type { DisplayIndex } from '../ids.js';
import { problem, type Problem } from '../problems.js';
import type { DisplayedRows } from '../row/displayed.js';
import type { RowNode } from '../row/node.js';
import type { SpanCell, SpanMap } from '../spans/map.js';
import type { LocaleCtx } from '../value/locale.js';
import { separatorsFor } from '../value/number.js';
import { quoter } from './quote.js';
import { field, headerOf, writerFor, type WriterEnv } from './writers.js';

/** How the file is written (docs/behaviors/csv-export.md); every option has a default. */
export interface CsvOptions {
  /** `value` (default): machine values Excel can compute with; `display`: each cell as the grid formats it. */
  readonly text?: 'value' | 'display';
  /** Default: `csvSeparatorFor(ctx)`. */
  readonly separator?: ',' | ';' | '\t';
  /** A BOM first, so Excel reads UTF-8 (Arabic); default true. */
  readonly bom?: boolean;
  /** A line of column labels first; default true. */
  readonly header?: boolean;
  /** `excel` (default): the locale's decimal mark unless the separator is `,`; `raw`: the machine form. */
  readonly numbers?: 'excel' | 'raw';
  /** `wall` (default): the display zone's clock, seconds; `iso`: UTC with `Z`, exact. */
  readonly instants?: 'wall' | 'iso';
  readonly enums?: 'label' | 'code';
  /** The formula guard; default true. */
  readonly sanitizeFormulas?: boolean;
  /** A spanned cell: its value in every slot it covers (`repeat`, default) or in its first only. */
  readonly spans?: 'repeat' | 'first';
  /** Column ids, in order; default the visible columns. A hidden one named is written. */
  readonly columns?: readonly string[];
  /** Rows per chunk; default 500. */
  readonly chunkRows?: number;
  /**
   * A tree's depth (csv-export.md): `level` (default) a first column, 1 for the roots; `indent` two
   * spaces per level before the tree column's text; `none` flat rows. Only when the rows are a tree's.
   */
  readonly tree?: 'none' | 'level' | 'indent';
  /** The level column's header; default `Level`. */
  readonly levelHeader?: string;
  /** The column that carries the indent and a filler's label; default the first written. */
  readonly treeColumn?: string;
}

/** What the file is written from: pure data, no grid. */
export interface CsvInput<T> {
  readonly rows: DisplayedRows<T>;
  /** Display indices of `rows` to write, in order; null or absent: all of them. */
  readonly at?: Uint32Array | null;
  readonly columns: ColumnLookup<T>;
  readonly ctx: LocaleCtx;
  readonly reader?: ValueReader<T>;
  /** A span map built for these same rows and the visible columns. */
  readonly spans?: SpanMap | null;
  /** The visible column ids, in the map's order. */
  readonly spanColumns?: readonly string[];
}

/** Counts only: no cell value is ever in it. */
export interface CsvSummary {
  readonly rows: number;
  readonly columns: number;
  readonly blank: number;
  readonly invalid: number;
}

const BOM = '\uFEFF';
const SEPARATORS: readonly unknown[] = [',', ';', '\t'];

/** `;` where the locale writes decimals with a comma (Excel splits on it there), `,` elsewhere. */
export const csvSeparatorFor = (ctx: LocaleCtx): ',' | ';' => (separatorsFor(ctx).decimal === ',' ? ';' : ',');

/** The columns of a file: the visible ones, or those named (an unknown id is skipped and told). */
export function csvColumns<T>(cols: ColumnLookup<T>, ids?: readonly string[]): { columns: ResolvedColumn<T>[]; problems: Problem[] } {
  if (!ids) return { columns: [...cols.visible()], problems: [] };
  const columns: ResolvedColumn<T>[] = [];
  const problems: Problem[] = [];
  ids.forEach((id, i) => {
    const c = cols.get(id);
    if (c) columns.push(c);
    else problems.push(problem('unknown-column', 'warning', `csv.columns[${i}]`, String(id)));
  });
  return { columns, problems };
}

/**
 * The file, a chunk of about `chunkRows` rows at a time (the BOM and the
 * header in the first), so a page can yield between chunks and hand them to
 * a Blob; returns the counts. RFC 4180: CRLF after every line.
 */
export function* csvChunks<T>(i: CsvInput<T>, o: CsvOptions = {}): Generator<string, CsvSummary> {
  const { rows, ctx } = i;
  const sep = SEPARATORS.includes(o.separator) ? o.separator! : csvSeparatorFor(ctx);
  const counts = { blank: 0, invalid: 0 };
  const e: WriterEnv<T> = {
    ctx, sep, counts,
    reader: i.reader ?? (NO_OVERLAY as ValueReader<T>),
    display: o.text === 'display',
    raw: o.numbers === 'raw',
    iso: o.instants === 'iso',
    codes: o.enums === 'code',
    guard: o.sanitizeFormulas !== false,
    quote: quoter(sep),
  };
  const cols = csvColumns(i.columns, o.columns).columns;
  const n = cols.length;
  const writers = new Map<string, (node: RowNode<T>, pad?: string) => string>();
  const writer = (col: ResolvedColumn<T>) => {
    let w = writers.get(col.id);
    if (!w) writers.set(col.id, (w = writerFor(col, e)));
    return w;
  };
  const at = i.at ?? null;
  const total = n ? (at ? at.length : rows.count) : 0;
  const size = Number.isInteger(o.chunkRows) && o.chunkRows! > 0 ? o.chunkRows! : 500;
  // Spans: each output column's place in the map (-1: not in it); `first` only when every row is written.
  const map = i.spans && !i.spans.none ? i.spans : null;
  const ids = i.spanColumns ?? [];
  const place = cols.map((c) => ids.indexOf(c.id));
  const firstOnly = o.spans === 'first' && !at;
  let sylk = true;
  const line = (fields: string[]): string => {
    // Excel takes a file whose first field starts with ID for SYLK: quote it.
    if (sylk && fields[0]!.startsWith('ID')) fields[0] = `"${fields[0]}"`;
    sylk = false;
    return (n === 1 && fields[0] === '' ? '""' : fields.join(sep)) + '\r\n';
  };
  const levelAt = o.tree === 'none' ? undefined : rows.levelAt;
  const indent = o.tree === 'indent';
  const treeAt = !rows.levelAt ? -1 : o.treeColumn === undefined ? 0 : cols.findIndex((c) => c.id === o.treeColumn);
  /** A tree's level column first (`level`): its header, or the row's level from 1. */
  const lead = (fields: string[], v: string): string[] => (levelAt && !indent && fields.unshift(v), fields);
  let out = o.bom === false ? '' : BOM;
  if (n && o.header !== false) out += line(lead(cols.map((c) => headerOf(c, e)), field(e, o.levelHeader ?? 'Level')));
  let written = 0;
  for (let k = 0; k < total; k++) {
    const r = at ? at[k]! : k;
    const node = rows.nodeAt(r as DisplayIndex);
    // A detail panel is never written (csv-export.md).
    if (node.kind === 'detail') continue;
    written++;
    const lv = levelAt ? levelAt.call(rows, r as DisplayIndex) : 0;
    const pad = indent ? '  '.repeat(lv) : '';
    let over: SpanCell[] | null = null;
    if (map && !map.fullWidth(r)) {
      for (const s of map.inRow(r, 0, ids.length - 1)) {
        if (s.rows === 1 && s.cols === 1) continue;
        over ??= [];
        for (let c = s.col; c < s.col + s.cols; c++) over[c] = s;
      }
    }
    const fields = cols.map((col, j) => {
      // A filler: its label in the tree column, every other field empty.
      if (j === treeAt) return node.kind === 'group' ? field(e, pad + node.label) : writer(col)(node, pad);
      const s = over?.[place[j]!];
      if (!s) return writer(col)(node);
      if (s.row === r && s.col === place[j]) return writer(col)(node);
      if (firstOnly) return '';
      const origin = i.columns.get(ids[s.col]!);
      return origin ? writer(origin)(rows.nodeAt(s.row as DisplayIndex)) : '';
    });
    out += line(lead(fields, String(lv + 1)));
    if (written % size === 0) {
      yield out;
      out = '';
    }
  }
  if (out) yield out;
  return { rows: written, columns: n, ...counts };
}

/** The whole file as one string: the chunks joined. Above a few hundred thousand rows, use the chunks. */
export function toCsv<T>(i: CsvInput<T>, o?: CsvOptions): string {
  let s = '';
  for (const part of csvChunks(i, o)) s += part;
  return s;
}
