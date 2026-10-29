import type { ResolvedColumn, ValueReader } from '../columns/defs.js';
import { dayToEpochDay, epochDayToDay, type Day } from '../value/day.js';
import type { DisplayedRows } from '../row/displayed.js';
import type { LocaleCtx } from '../value/locale.js';
import { boxRows, type RangeBox } from './box.js';
import { shownValue } from './copy.js';
import type { PlannedCell } from './paste.js';

/** Toward which side a fill goes: down or up a column, to the logical end or start of a row. */
export type FillWay = 'down' | 'up' | 'end' | 'start';

export interface FillOptions<T> {
  readonly ctx: LocaleCtx;
  /** The edit overlay: the source cells as the user sees them. */
  readonly reader: ValueReader<T>;
  /** `copy` (Ctrl+D / Ctrl+R): the source repeated, never a series. Default `auto` (fill.md 3). */
  readonly mode?: 'auto' | 'copy';
  /** Ctrl held at the drop: a copy becomes a series, a series a copy. */
  readonly swap?: boolean;
}

/**
 * A drag of the fill handle from `src` to a cell (display row, column index): the box beside the source
 * to fill and its way, on the axis the cell is farther out on (ties: rows); null back inside (fill.md 3; F1).
 * `along`: that axis only, the other distance ignored (1.1.0, fill.md 26); another value: both.
 */
export function fillTarget(src: RangeBox, to: { readonly row: number; readonly col: number }, along?: 'row' | 'column'): { readonly box: RangeBox; readonly way: FillWay } | null {
  // One way only (fill.md 26): the other distance counts as none (`row`: along the row, `column`: up or down).
  const dr = along == 'row' ? 0 : to.row < src.top ? src.top - to.row : to.row > src.bottom ? to.row - src.bottom : 0;
  const dc = along == 'column' ? 0 : to.col < src.start ? src.start - to.col : to.col > src.end ? to.col - src.end : 0;
  if (!dr && !dc) return null;
  if (dr >= dc) return to.row > src.bottom ? { box: { ...src, top: src.bottom + 1, bottom: to.row }, way: 'down' } : { box: { ...src, top: to.row, bottom: src.top - 1 }, way: 'up' };
  return to.col > src.end ? { box: { ...src, start: src.end + 1, end: to.col }, way: 'end' } : { box: { ...src, start: to.col, end: src.start - 1 }, way: 'start' };
}

/** The decimals a number is written with for export, an exponent included (`1e-7`: 7). */
const decimalsOf = (s: string): number => {
  const m = /(?:\.(\d+))?(?:e([-+]?\d+))?$/i.exec(s)!;
  return Math.min(100, Math.max(0, (m[1]?.length ?? 0) - Number(m[2] ?? 0)));
};

/**
 * One line's values at position `p` from its first source cell (down / end: n, n+1, …; up / start: −1,
 * −2, …): a series when the line is numbers or days with one step (one number only with `swap`, one day
 * unless `swap`), rounded to the source's decimals; otherwise the source repeated (fill.md 3–5; F2–F5).
 */
function line<T>(vals: unknown[], cols: readonly ResolvedColumn<T>[], o: FillOptions<T>): (p: number) => unknown {
  const n = vals.length;
  const repeat = (p: number) => vals[((p % n) + n) % n];
  if (o.mode === 'copy') return repeat;
  const num = vals.every((v, i) => typeof v === 'number' && cols[i]!.codec.kind === 'number');
  if (!num && !vals.every((v, i) => typeof v === 'string' && cols[i]!.type === 'day')) return repeat;
  const x = vals.map((v) => (num ? (v as number) : dayToEpochDay(v as Day)));
  let d = 0;
  if (num) for (let i = 0; i < n; i++) d = Math.max(d, decimalsOf(cols[i]!.codec.toExport(vals[i])));
  const round = (v: number) => Number(v.toFixed(d));
  const step = n > 1 ? round(x[1]! - x[0]!) : 1;
  const series = n > 1 ? !o.swap && x.every((v, i) => !i || round(v - x[i - 1]!) === step) : num === !!o.swap;
  if (!series) return repeat;
  return (p) => {
    const v = round(x[0]! + p * step);
    // Past the days the grid writes: a value the column refuses (counted), never a blank.
    return num ? v : epochDayToDay(v) ?? Number.NaN;
  };
}

/**
 * The cells a fill writes (fill.md 3–8; F2–F7): per line (a column down or up, a row toward the end or
 * the start), the source's data rows read as shown; the target's data rows only (details, fillers and
 * loading rows stepped over without a step); `{ value }` inputs, in row then column order, for the
 * editing commit to check.
 */
export function planFill<T>(src: RangeBox, target: RangeBox, way: FillWay, displayed: DisplayedRows<T>, columns: readonly ResolvedColumn<T>[], o: FillOptions<T>): PlannedCell[] {
  const down = way === 'down' || way === 'up';
  const back = way === 'up' || way === 'start';
  const sRows = boxRows(src, displayed);
  const tRows = boxRows(target, displayed);
  const sCols = columns.slice(src.start, src.end + 1);
  const tCols = columns.slice(target.start, target.end + 1);
  const out: PlannedCell[] = [];
  if (!sRows.length) return out;
  const lines = down
    ? sCols.map((c) => line(sRows.map((r) => shownValue(c, r, o.reader, o.ctx)), sRows.map(() => c), o))
    : sRows.map((r) => line(sCols.map((c) => shownValue(c, r, o.reader, o.ctx)), sCols, o));
  tRows.forEach((r, ri) =>
    tCols.forEach((c, ci) => {
      const p = down ? (back ? ri - tRows.length : sRows.length + ri) : back ? ci - tCols.length : sCols.length + ci;
      const f = lines[down ? ci : ri];
      if (f) out.push({ key: r.key, column: c.id, input: { value: f(p) } });
    }),
  );
  return out;
}
