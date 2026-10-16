import type { ColumnEnv } from '../model/column-cache.js';
import { problem, type Problem } from '../problems.js';

export interface SortItem {
  readonly column: string;
  readonly dir: 'asc' | 'desc';
  /** Default last, in both directions (D3). */
  readonly nulls?: 'first' | 'last';
}

/**
 * The display order for a sort: an index array, never a copy of the rows.
 *
 * Every key is a number — the value itself, or a text's rank — so the
 * comparison is a subtraction. Blanks (`NaN`) are placed by `nulls`, whatever
 * the direction; equal rows keep their source order, descending too: the sort
 * is stable by construction, not by the engine's promise.
 */
export function sortIndices<T>(
  items: readonly SortItem[],
  within: Uint32Array | null,
  env: ColumnEnv<T>,
): { readonly order: Uint32Array; readonly problems: readonly Problem[] } {
  const problems: Problem[] = [];
  const keys: { k: Float64Array; sign: number; first: boolean }[] = [];
  const used = new Set<string>();
  items.forEach((item, i) => {
    const at = `sort[${i}]`;
    const col = env.columns.get(item?.column);
    if (!col) return void problems.push(problem('unknown-column', 'error', at));
    if (!col.sortable || (item.dir !== 'asc' && item.dir !== 'desc') || (item.nulls !== undefined && item.nulls !== 'first' && item.nulls !== 'last') || used.has(col.id)) {
      return void problems.push(problem('invalid-sort', 'error', at));
    }
    used.add(col.id);
    const built = col.codec.keyKind === 'number' ? env.cache.keys(col, env) : env.cache.ranks(col, env);
    problems.push(...built.problems);
    keys.push({ k: 'keys' in built ? built.keys : built.ranks, sign: item.dir === 'asc' ? 1 : -1, first: item.nulls === 'first' });
  });

  const order = within ? Uint32Array.from(within) : identity(env.source.count);
  if (!keys.length) return { order, problems };

  order.sort((a, b) => {
    for (const { k, sign, first } of keys) {
      const x = k[a]!;
      const y = k[b]!;
      const xb = x !== x;
      const yb = y !== y;
      if (xb || yb) {
        if (xb && yb) continue;
        return xb === first ? -1 : 1;
      }
      if (x !== y) return x < y ? -sign : sign;
    }
    return a - b;
  });
  return { order, problems };
}

function identity(n: number): Uint32Array {
  const o = new Uint32Array(n);
  for (let i = 0; i < n; i++) o[i] = i;
  return o;
}

