import type { FilterModel } from '../filter/model.js';
import type { SortItem } from '../sort/compile.js';

/** What the user asked for. `key` is canonical: two queries with equal keys show the same rows. */
export interface Query {
  readonly sort: readonly SortItem[];
  readonly filter: FilterModel;
  readonly quick: string;
  readonly key: string;
}

/** JSON with object keys sorted, so `{a, b}` and `{b, a}` give one key. */
export function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
    .join(',')}}`;
}

export function makeQuery(q: Partial<Pick<Query, 'sort' | 'filter' | 'quick'>> = {}): Query {
  const sort = q.sort ?? [];
  const filter = q.filter ?? {};
  const quick = q.quick ?? '';
  return { sort, filter, quick, key: canonical({ sort, filter, quick }) };
}

export const EMPTY_QUERY: Query = makeQuery();
