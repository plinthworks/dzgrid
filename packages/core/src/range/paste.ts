import type { ResolvedColumn } from '../columns/defs.js';
import type { CellInput } from '../edit/input.js';
import type { RowKey } from '../ids.js';
import type { DisplayedRows } from '../row/displayed.js';
import { stripMarks } from '../value/digits.js';
import type { RangeBox } from './box.js';

/** One cell a paste, a fill or a bulk edit writes, given to the editing commit as it is. */
export interface PlannedCell {
  readonly key: RowKey;
  readonly column: string;
  readonly input: CellInput;
}

export interface PastePlan {
  /** In row then column order; each cell once; data rows only. */
  readonly cells: readonly PlannedCell[];
  /** Source cells that fell past the last row shown or the last visible column. */
  readonly outside: number;
  /** Over the cap: nothing planned (never truncated, owner QB4). */
  readonly tooBig: boolean;
  /** What was written, for the block shown after the paste; null when nothing. */
  readonly box: RangeBox | null;
}

/** Owner QB4: over this many cells a paste writes nothing. */
export const PASTE_MAX = 100_000;

/**
 * Where a paste writes (clipboard.md 14–21; P0–P7). The target's rows are the data rows from its top
 * down (details, fillers and loading rows stepped over without using a line), its columns from its start
 * to the last visible one. Shape (owner QB6): when the target's data rows and columns are each a whole
 * multiple of the source's (one value always is), the source repeats over the target; otherwise it is
 * written once from the top-left, past the rows or columns shown counted `outside`. A short row's missing
 * cells are empty text. No editability check: the commit refuses and counts (one place, P5). Bulk edit is
 * this plan with one value.
 */
export function planPaste<T>(src: readonly (readonly CellInput[])[], at: RangeBox, displayed: DisplayedRows<T>, columns: readonly ResolvedColumn<T>[], o?: { readonly max?: number }): PastePlan {
  const h = src.length;
  let w = 0;
  for (const r of src) w = Math.max(w, r.length);
  // P0: no cell, nothing. One empty text plans clears (a bulk edit of an emptied field, fill.md 9): an
  // empty clipboard text is the DOM's to skip before planning (clipboard.md 14).
  if (!w) return { cells: [], outside: 0, tooBig: false, box: null };
  const data = (i: number) => displayed.nodeAt(displayed.index(i)!).kind === 'data';
  let inside = 0;
  for (let i = at.top; i <= at.bottom; i++) if (data(i)) inside++;
  const cols = at.end - at.start + 1;
  const tile = inside > 0 && inside % h === 0 && cols % w === 0;
  const H = tile ? inside : h;
  const W = tile ? cols : w;
  const rows: number[] = [];
  for (let i = at.top; i < displayed.count && rows.length < H; i++) if (data(i)) rows.push(i);
  const wide = Math.min(W, columns.length - at.start);
  if (rows.length * wide > (o?.max ?? PASTE_MAX)) return { cells: [], outside: 0, tooBig: true, box: null };
  const cells: PlannedCell[] = [];
  for (let r = 0; r < rows.length; r++) {
    const key = displayed.keyAt(displayed.index(rows[r]!)!);
    const line = src[r % h]!;
    for (let c = 0; c < wide; c++) {
      const col = columns[at.start + c]!;
      const input = line[c % w] ?? { text: '' };
      cells.push({ key, column: col.id, input: 'text' in input ? { text: pasteText(input.text, col) } : input });
    }
  }
  return {
    cells,
    outside: H * W - rows.length * wide,
    tooBig: false,
    box: cells.length ? { top: rows[0]!, bottom: rows[rows.length - 1]!, start: at.start, end: at.start + wide - 1 } : null,
  };
}

/** ISO 4217 codes (from Intl when it lists them), read once. */
let codes: ReadonlySet<string> | null = null;
const isCode = (s: string): boolean =>
  (codes ??= new Set(typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('currency') : ['DZD', 'EUR', 'USD', 'GBP', 'EGP', 'MAD', 'TND', 'SAR', 'AED', 'CHF', 'CAD', 'JPY', 'CNY'])).has(s);
/** A currency: a Unicode currency sign, three capitals (kept only when a real code), the local forms DA, د.ج, دج, ج.م. */
const MONEY = '(\\p{Sc}|[A-Z]{3}|DA|د\\.?ج\\.?|ج\\.م\\.?)';
const LEAD = new RegExp(`^([-+]?)\\s*${MONEY}(?!\\p{L})\\s*`, 'u');
const TRAIL = new RegExp(`\\s*(?<!\\p{L})${MONEY}\\s*$`, 'u');
const real = (m: RegExpExecArray | null): m is RegExpExecArray => !!m && (!/^[A-Z]{3}$/.test(m[m.length - 1]!) || isCode(m[m.length - 1]!));
const TICK = /^'(?='?[=+\-@])/;
const IDENT = /^="(\d+)"$/;
const MIDNIGHT = /^(\d{4}-\d{2}-\d{2}) 00:00:00$/;

/**
 * One pasted cell's text made ready for its column (clipboard.md 19; P6): in a number column, the bidi
 * marks dropped and one currency at the start (a sign before it kept), else at the end, removed (owner
 * QB10: Unicode signs, real ISO codes, the local forms; parentheses and words stay); in a day column an
 * ISO day at midnight read as the day; in other columns one `'` before a formula start (or before our
 * guarded `'`) and our identifier mark `="0123"` removed (QB3). Otherwise as is.
 */
export function pasteText<T>(text: string, col: ResolvedColumn<T>): string {
  if (col.codec.kind === 'number') {
    const s = stripMarks(text);
    let m = LEAD.exec(s);
    let u = real(m) ? m[1] + s.slice(m[0].length) : s;
    if (u === s) u = real((m = TRAIL.exec(s))) ? s.slice(0, m.index) : s;
    return u !== s && u.trim() ? u : text;
  }
  if (col.type === 'day') text = text.replace(MIDNIGHT, '$1');
  return text.replace(TICK, '').replace(IDENT, '$1');
}
