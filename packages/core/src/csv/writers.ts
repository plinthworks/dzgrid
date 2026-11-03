import type { ResolvedColumn, ValueReader } from '../columns/defs.js';
import { idOfDataKey } from '../ids.js';
import type { DataNode, RowNode } from '../row/node.js';
import { isBlank } from '../value/codec.js';
import type { LocaleCtx } from '../value/locale.js';
import { separatorsFor } from '../value/number.js';
import { FORMULA, NUMERIC } from './quote.js';
import { wallWriter } from './wall.js';

/** The options a writer reads, resolved once per file. */
export interface WriterEnv<T> {
  readonly ctx: LocaleCtx;
  readonly reader: ValueReader<T>;
  readonly sep: string;
  readonly display: boolean;
  readonly raw: boolean;
  readonly iso: boolean;
  readonly codes: boolean;
  readonly guard: boolean;
  /** The clipboard's guard also covers a text starting with `'` before a formula start (`'=x` → `''=x`), so it survives Excel. */
  readonly tick?: boolean;
  readonly quote: (s: string) => string;
  /** Blank and unreadable cells, counted as they are written. */
  readonly counts: { blank: number; invalid: number };
}

const DIGITS = /^[0-9]+$/;

/** A guarded text, quoted. */
export const field = <T>(e: WriterEnv<T>, s: string): string => e.quote(e.guard && (FORMULA.test(s) || (e.tick && /^'[=+\-@]/.test(s))) ? `'${s}` : s);

/** The header of a column: its label (else its id), the zone after a wall-time instant's. */
export const headerOf = <T>(col: ResolvedColumn<T>, e: WriterEnv<T>): string =>
  field(e, (col.def.header ?? col.id) + (col.type === 'instant' && !e.display && !e.iso ? ` (${e.ctx.timeZone})` : ''));

/**
 * XLSX's column label: `headerOf`'s rule (keep the two together), the zone given (`UTC` with `instants: 'utc'`). Not
 * shared with `headerOf` itself: the clipboard's range entry, which carries `headerOf`, sits at its line (3 200).
 */
export const labelOf = <T>(col: ResolvedColumn<T>, zone: string | false): string => (col.def.header ?? col.id) + (col.type === 'instant' && zone ? ` (${zone})` : '');

/**
 * A data row's cell as every export reads it (CSV, XLSX, the clipboard: one rule): through the edit overlay, then
 * the column's codec. `undefined`: blank; null: unreadable. May throw (a host's `value`): the caller counts it.
 */
export function readValue<T>(col: ResolvedColumn<T>, node: DataNode<T>, e: Pick<WriterEnv<T>, 'reader' | 'ctx'>): unknown {
  const raw = e.reader.overlay ? e.reader.value(col, node.data, idOfDataKey(node.key) ?? `\0${node.key}`) : col.read(node.data);
  return isBlank(raw) || col.codec.isEmpty(raw) ? undefined : col.codec.coerce(raw, e.ctx);
}

/**
 * One column's cell writer (csv-export.md, the table of types), built once
 * per file: read through the overlay, blank or unreadable gives an empty
 * field (counted), then the text, `="…"` for a digits-only identifier, the
 * guard (never on a typed number), the quotes.
 */
export function writerFor<T>(col: ResolvedColumn<T>, e: WriterEnv<T>): (node: RowNode<T>, pad?: string) => string {
  const { ctx, counts } = e;
  const c = col.codec;
  const number = c.kind === 'number';
  let text: (v: any) => string | null = (v) => c.toExport(v);
  if (e.display) text = (v) => c.format(v, ctx);
  else if (number) {
    const mark = e.raw || e.sep === ',' ? '.' : separatorsFor(ctx).decimal;
    if (mark !== '.') text = (v) => c.toExport(v).replace('.', mark);
  } else if (col.type === 'instant' && !e.iso) text = wallWriter(ctx.timeZone);
  else if (col.type === 'enum' && !e.codes) text = (v) => c.format(v, ctx);
  const ident = col.def.csv === 'text';
  // `pad`: a tree's indent, before the guard and the quotes (csv-export.md).
  return (node, pad = '') => {
    let s: string | null;
    let v: unknown;
    // A filler or a detail has no cells to write (csv-export.md).
    if (node.kind !== 'data') return '';
    try {
      v = readValue(col, node, e);
      if (v === undefined) {
        counts.blank++;
        // A blank tree cell keeps its row's indent (csv-export.md).
        return pad;
      }
      s = v === null ? null : text(v);
    } catch {
      s = null;
    }
    if (s === null) {
      counts.invalid++;
      return pad;
    }
    if (ident && !pad && DIGITS.test(s)) return e.quote(`="${s}"`);
    s = pad + s;
    // A typed number skips the guard only when what is written looks like a number: a custom
    // codec claiming `number` but writing text is guarded like any text.
    return number && typeof v === 'number' && NUMERIC.test(s) ? e.quote(s) : field(e, s);
  };
}
