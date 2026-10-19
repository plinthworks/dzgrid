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
import { headerOf, writerFor, type WriterEnv } from './writers.js';

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
  const writers = new Map<string, (node: RowNode<T>) => string>();
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
  let out = o.bom === false ? '' : BOM;
  if (n && o.header !== false) out += line(cols.map((c) => headerOf(c, e)));
  for (let k = 0; k < total; k++) {
    const r = at ? at[k]! : k;
    const node = rows.nodeAt(r as DisplayIndex);
    let over: SpanCell[] | null = null;
    if (map && !map.fullWidth(r)) {
      for (const s of map.inRow(r, 0, ids.length - 1)) {
        if (s.rows === 1 && s.cols === 1) continue;
        over ??= [];
        for (let c = s.col; c < s.col + s.cols; c++) over[c] = s;
      }
    }
    const fields = cols.map((col, j) => {
      const s = over?.[place[j]!];
      if (!s) return writer(col)(node);
      if (s.row === r && s.col === place[j]) return writer(col)(node);
      if (firstOnly) return '';
      const origin = i.columns.get(ids[s.col]!);
      return origin ? writer(origin)(rows.nodeAt(s.row as DisplayIndex)) : '';
    });
    out += line(fields);
    if ((k + 1) % size === 0) {
      yield out;
      out = '';
    }
  }
  if (out) yield out;
  return { rows: total, columns: n, ...counts };
}

/** The whole file as one string: the chunks joined. Above a few hundred thousand rows, use the chunks. */
export function toCsv<T>(i: CsvInput<T>, o?: CsvOptions): string {
  let s = '';
  for (const part of csvChunks(i, o)) s += part;
  return s;
}
