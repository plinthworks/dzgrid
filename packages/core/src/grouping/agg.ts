import type { AggFn, AggFuncName, ResolvedColumn } from '../columns/defs.js';
import { ColumnCache, THREW, type ColumnEnv } from '../model/column-cache.js';
import { problem, type Problem } from '../problems.js';
import { isBlank } from '../value/codec.js';

/** A cell's typed value as the user sees it (through the edit overlay), or null when empty or unreadable. */
export const valueAt = <T>(col: ResolvedColumn<T>, env: ColumnEnv<T>, src: number): unknown => {
  const raw = ColumnCache.raw(col, env, src);
  return raw === THREW || isBlank(raw) ? null : col.codec.coerce(raw, env.ctx);
};

/** The totals of one grouping: per group (by number), the grand ones, the columns totalled, and what was refused. */
export interface Totals {
  readonly at: readonly Readonly<Record<string, unknown>>[];
  readonly grand: Readonly<Record<string, unknown>>;
  readonly columns: readonly string[];
  readonly problems: readonly Problem[];
}

/** What a grouping hands its totals: each group's level and leaf range over the all-open order. */
interface Ranges {
  readonly G: number;
  readonly lv: Int32Array;
  readonly lo: Int32Array;
  readonly hi: Int32Array;
  readonly leaves: Uint32Array;
}

const NAMES = ['sum', 'avg', 'min', 'max', 'count', 'first', 'last'];

/**
 * The totals (aggregation.md 1–8, 15): for each visible column with a total (the options' `aggFuncs` winning over the
 * column's `aggFunc`), then each column named only in `aggFuncs`, every group's and the grand one. Each is a scan of
 * the group's rows (one rule at every level, never a total of rounded totals); sums compensated (Neumaier, as
 * `rangeStats`); empty values skipped but by `count`, which counts rows. A total that does not fit its column's type, an
 * unknown name or column, a function that throws: told by column and name, never a value.
 */
export function totalsOf<T>(s: Ranges, env: ColumnEnv<T>, aggFuncs: Readonly<Record<string, AggFuncName | AggFn>> | undefined): Totals {
  const problems: Problem[] = [];
  const specs: { col: ResolvedColumn<T>; fn: AggFuncName | AggFn }[] = [];
  const take = (col: ResolvedColumn<T>, fn: unknown): void => {
    if (fn === undefined) return;
    const path = `columns.${col.id}.aggFunc`;
    if (typeof fn == 'function') return void specs.push({ col, fn: fn as AggFn });
    if (!NAMES.includes(fn as string)) return void problems.push(problem('invalid-setting', 'warning', path, typeof fn == 'string' ? fn : typeof fn));
    const t = col.type;
    const fits = fn === 'sum' || fn === 'avg' ? t === 'number' : fn === 'min' || fn === 'max' ? /^(number|day|instant|text)$/.test(t) : true;
    if (fits) specs.push({ col, fn: fn as AggFuncName });
    else problems.push(problem('agg-type', 'warning', path, fn as string));
  };
  const own = (id: string) => aggFuncs !== undefined && Object.hasOwn(aggFuncs, id);
  const seen = new Set<string>();
  for (const col of env.columns.visible()) seen.add(col.id), take(col, own(col.id) ? aggFuncs![col.id] : col.def.aggFunc);
  for (const id of Object.keys(aggFuncs ?? {})) {
    if (seen.has(id)) continue;
    const col = env.columns.get(id);
    if (col) take(col, aggFuncs![id]);
    else problems.push(problem('unknown-column', 'warning', 'grouping.aggFuncs', id));
  }

  const { G, lv, lo, hi, leaves } = s;
  const at: Record<string, unknown>[] = Array.from({ length: G }, () => ({}));
  const grand: Record<string, unknown> = {};
  for (const { col, fn } of specs) {
    const id = col.id;
    let threw = false;
    // Sum and mean read the numbers; min and max the column's sort keys (a number, a day, an instant, a text's rank
    // under the collation), then the value of the row that holds the extreme.
    const keys = typeof fn == 'string' && /^(sum|avg|min|max)$/.test(fn) ? (col.codec.keyKind === 'number' ? env.cache.keys(col, env).keys : env.cache.ranks(col, env).ranks) : null;
    const one = (a: number, b: number, level: number | null): unknown => {
      if (typeof fn == 'function') {
        const values: unknown[] = [];
        for (let j = a; j < b; j++) values.push(valueAt(col, env, leaves[j]!));
        try {
          return fn(values, { column: id, level });
        } catch {
          threw = true;
          return null;
        }
      }
      if (fn === 'count') return b - a;
      if (!keys) {
        const step = fn === 'first' ? 1 : -1;
        for (let j = fn === 'first' ? a : b - 1; j >= a && j < b; j += step) {
          const v = valueAt(col, env, leaves[j]!);
          if (v !== null) return v;
        }
        return null;
      }
      let sum = 0;
      let fix = 0;
      let k = 0;
      let best = -1;
      let bv = 0;
      for (let j = a; j < b; j++) {
        const src = leaves[j]!;
        const v = keys[src]!;
        if (v !== v) continue;
        k++;
        if (fn === 'sum' || fn === 'avg') {
          const t = sum + v;
          // Past the largest double the sum is ±Infinity: no compensation (it would make NaN).
          if (Number.isFinite(t)) fix += Math.abs(sum) >= Math.abs(v) ? sum - t + v : v - t + sum;
          sum = t;
        } else if (best < 0 || (fn === 'min' ? v < bv : v > bv)) (best = src), (bv = v);
      }
      if (!k) return null;
      if (best >= 0) return valueAt(col, env, best);
      const total = Number.isFinite(sum) ? sum + fix : sum;
      return fn === 'sum' ? total : total / k;
    };
    for (let g = 0; g < G; g++) at[g]![id] = one(lo[g]!, hi[g]!, lv[g]!);
    grand[id] = one(0, leaves.length, null);
    if (threw) problems.push(problem('agg-threw', 'warning', `columns.${id}.aggFunc`));
  }
  return { at, grand, columns: specs.map((x) => x.col.id), problems };
}
