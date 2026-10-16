import type { SortItem } from './compile.js';

/**
 * A header click: ascending, then descending, then no sort. Without `multi`
 * the column becomes the only sort; with it, a new column joins at the end
 * and a sorted one cycles in place, keeping the order of precedence.
 */
export function nextSort(sort: readonly SortItem[], column: string, multi: boolean): readonly SortItem[] {
  const at = sort.findIndex((s) => s.column === column);
  const cur = at === -1 ? null : sort[at]!;
  const next: SortItem | null = !cur ? { column, dir: 'asc' } : cur.dir === 'asc' ? { ...cur, dir: 'desc' } : null;
  if (!multi) return next ? [next] : [];
  if (at === -1) return [...sort, next!];
  return next ? sort.map((s, i) => (i === at ? next : s)) : sort.filter((_, i) => i !== at);
}
