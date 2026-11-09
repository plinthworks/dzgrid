import type { AggFn, AggFuncName, ResolvedColumn, ValueReader } from '../columns/defs.js';
import { fits, NAMES } from '../grouping/agg.js';
import { idOfDataKey } from '../ids.js';
import { problem, type Problem } from '../problems.js';
import { positions, type DisplayedRows } from '../row/displayed.js';
import type { DataNode } from '../row/node.js';
import { isBlank } from '../value/codec.js';
import type { LocaleCtx } from '../value/locale.js';

/** One totals row: each column's total by id (null: nothing to show), the columns totalled, what was refused. */
export interface ColumnTotals {
  readonly values: Readonly<Record<string, unknown>>;
  readonly columns: readonly string[];
  readonly problems: readonly Problem[];
}

/**
 * The totals of `rows`' data rows for each of `columns` with a `total` (totals-row.md 1–3): sum (compensated) and mean
 * over the numbers present, count of every row, min / max by the column's order, first / last in the rows' order, or the
 * application's function of the typed values (empty ones null, `{ column, level: null }`). Values are read through
 * `reader` (the edit overlay), then the codec. A total that does not fit, an unknown name, a function that throws: told
 * by column and name (`columns.<id>.total`), never a value. Pure.
 */
export function columnTotals<T>(rows: DisplayedRows<T>, columns: readonly ResolvedColumn<T>[], o: { readonly ctx: LocaleCtx; readonly reader: ValueReader<T> }): ColumnTotals {
  const { ctx, reader } = o;
  const values: Record<string, unknown> = {};
  const problems: Problem[] = [];
  const nodes: DataNode<T>[] = [];
  for (const i of positions(rows)) {
    const n = rows.nodeAt(i);
    if (n.kind === 'data') nodes.push(n);
  }
  const done: string[] = [];
  for (const col of columns) {
    const fn = col.def.total as AggFuncName | AggFn | undefined;
    if (fn === undefined) continue;
    const path = `columns.${col.id}.total`;
    if (typeof fn != 'function' && !NAMES.includes(fn)) {
      problems.push(problem('invalid-setting', 'warning', path, typeof fn == 'string' ? fn : typeof fn));
      continue;
    }
    if (!fits(col, fn)) {
      problems.push(problem('agg-type', 'warning', path, fn as string));
      continue;
    }
    done.push(col.id);
    // A cell's typed value as the screen shows it (null: empty or unreadable).
    const read = (n: DataNode<T>): unknown => {
      try {
        const raw = reader.overlay ? reader.value(col, n.data, idOfDataKey(n.key) ?? `\0${n.key}`) : col.read(n.data);
        return isBlank(raw) ? null : col.codec.coerce(raw, ctx);
      } catch {
        return null;
      }
    };
    let v: unknown = null;
    if (fn === 'count') v = nodes.length;
    else if (typeof fn == 'function') {
      try {
        v = fn(nodes.map(read), { column: col.id, level: null });
      } catch {
        problems.push(problem('agg-threw', 'warning', path));
      }
    } else {
      const got = nodes.map(read).filter((x) => x !== null);
      if (fn === 'first' || fn === 'last') v = got.length ? got[fn === 'first' ? 0 : got.length - 1] : null;
      else if (fn === 'min' || fn === 'max') v = got.reduce<unknown>((a, b) => (a === null || col.codec.compare(b, a, ctx) * (fn === 'min' ? -1 : 1) > 0 ? b : a), null);
      else if (got.length) {
        // Neumaier's sum, as the group totals (aggregation.md 6): past the largest double, ±Infinity, uncompensated.
        let sum = 0;
        let fix = 0;
        for (const x of got as number[]) {
          const t = sum + x;
          if (Number.isFinite(t)) fix += Math.abs(sum) >= Math.abs(x) ? sum - t + x : x - t + sum;
          sum = t;
        }
        const total = Number.isFinite(sum) ? sum + fix : sum;
        v = fn === 'sum' ? total : total / got.length;
      }
    }
    values[col.id] = v;
  }
  return { values, columns: done, problems };
}
