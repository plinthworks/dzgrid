import type { ResolvedColumn, ValueReader } from '../columns/defs.js';
import { headerOf, writerFor, type WriterEnv } from '../csv/writers.js';
import { idOfDataKey } from '../ids.js';
import type { DisplayedRows } from '../row/displayed.js';
import type { DataNode } from '../row/node.js';
import { isBlank } from '../value/codec.js';
import type { LocaleCtx } from '../value/locale.js';
import { boxRows, type RangeBox } from './box.js';

export interface CopyOptions<T> {
  readonly ctx: LocaleCtx;
  /** The edit overlay: a copy writes what the user sees. */
  readonly reader: ValueReader<T>;
  /** The formula guard (owner QB3); default true. */
  readonly guard?: boolean;
  /** Numbers with a point whatever the locale (QB9: default false, the locale's mark). */
  readonly raw?: boolean;
  /** A first row of headers (the API only, clipboard.md 8); default false. */
  readonly headers?: boolean;
}

/** A cell's value as shown, coerced by its column, or null for a blank or one it cannot read (C2). */
export function shownValue<T>(col: ResolvedColumn<T>, node: DataNode<T>, reader: ValueReader<T>, ctx: LocaleCtx): unknown {
  try {
    const raw = reader.overlay ? reader.value(col, node.data, idOfDataKey(node.key) ?? '') : col.read(node.data);
    return isBlank(raw) || col.codec.isEmpty(raw) ? null : col.codec.coerce(raw, ctx);
  } catch {
    return null;
  }
}

/**
 * What a copy of a box writes (clipboard.md 4–8; C1–C4): `text` the export values with a tab (the CSV
 * writer's rules: the locale's decimal mark, ISO days, wall-time instants, labels, the guard, `="…"`;
 * quoted later by the TSV), rows × the box's columns, headers first when asked; `values` the values
 * shown, for the page's own copy memo. Data rows only: a detail, filler or loading row writes no line.
 */
export function copyMatrix<T>(b: RangeBox, displayed: DisplayedRows<T>, columns: readonly ResolvedColumn<T>[], o: CopyOptions<T>): { readonly text: string[][]; readonly values: unknown[][] } {
  const cols = columns.slice(b.start, b.end + 1);
  const e: WriterEnv<T> = { ctx: o.ctx, reader: o.reader, sep: '\t', display: false, raw: !!o.raw, iso: false, codes: false, guard: o.guard !== false, tick: true, quote: (s) => s, counts: { blank: 0, invalid: 0 } };
  const writers = cols.map((c) => writerFor(c, e));
  const rows = boxRows(b, displayed);
  const text = rows.map((n) => writers.map((w) => w(n)));
  if (o.headers) text.unshift(cols.map((c) => headerOf(c, e)));
  return { text, values: rows.map((n) => cols.map((c) => shownValue(c, n, o.reader, o.ctx))) };
}
