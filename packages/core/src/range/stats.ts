import type { ResolvedColumn, ValueReader } from '../columns/defs.js';
import type { NumberFormatSpec } from '../i18n/format.js';
import type { DisplayedRows } from '../row/displayed.js';
import type { LocaleCtx } from '../value/locale.js';
import type { RangeBox } from './box.js';
import { shownValue } from './copy.js';

/**
 * A block's figures (docs/behaviors/status-bar.md, Phase 9 SB1): `cells` its data rows × its columns; `filled` the cells
 * not empty, any type; `numbers` the finite numbers of its `type: 'number'` columns (the typed value, never the text
 * shown), and their `sum` (compensated), `min`, `max` (null without a number); `partial` a loading row inside the box;
 * `formats` the distinct `numberFormat` of the columns where a number was met, in reading order (`{}`: none given).
 */
export interface RangeStats {
  readonly cells: number;
  readonly filled: number;
  readonly numbers: number;
  readonly sum: number;
  readonly min: number | null;
  readonly max: number | null;
  readonly partial: boolean;
  readonly formats: readonly NumberFormatSpec[];
}

/**
 * The figures of box `b` for the rows shown (`boxRows`' rows: details, fillers and loading rows count for nothing) and
 * the visible columns in reading order, each cell read as the user sees it (`reader`, the edit overlay). Neumaier's
 * summation: 0.1 ten times is 1. Pure: no Intl, no clock; the DOM writes the figures.
 */
export function rangeStats<T>(b: RangeBox, displayed: DisplayedRows<T>, columns: readonly ResolvedColumn<T>[], o: { readonly ctx: LocaleCtx; readonly reader: ValueReader<T> }): RangeStats {
  const cols = columns.slice(b.start, b.end + 1);
  const seen = new Map<string, NumberFormatSpec>();
  let cells = 0, filled = 0, numbers = 0, sum = 0, fix = 0, partial = false;
  let min: number | null = null, max: number | null = null;
  for (let i = b.top; i <= b.bottom; i++) {
    const at = displayed.index(i);
    const n = at === null ? null : displayed.nodeAt(at);
    if (n?.kind !== 'data') {
      partial ||= !n || n.kind === 'loading';
      continue;
    }
    for (const c of cols) {
      cells++;
      const v = shownValue(c, n, o.reader, o.ctx);
      if (v === null) continue;
      filled++;
      if (c.type !== 'number' || typeof v !== 'number' || !Number.isFinite(v)) continue;
      numbers++;
      const t = sum + v;
      // Past the largest double the sum is ±Infinity: no compensation (it would make NaN).
      if (Number.isFinite(t)) fix += Math.abs(sum) >= Math.abs(v) ? sum - t + v : v - t + sum;
      sum = t;
      if (min === null || v < min) min = v;
      if (max === null || v > max) max = v;
      const f = c.def.numberFormat ?? {};
      const k = JSON.stringify(f);
      if (!seen.has(k)) seen.set(k, f);
    }
  }
  return { cells, filled, numbers, sum: Number.isFinite(sum) ? sum + fix : sum, min, max, partial, formats: [...seen.values()] };
}
