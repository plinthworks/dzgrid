import type { SortItem } from '@dzgrid/core';
import type { GridContext } from '../context.js';

/** The new order, with the row count, in the bundle's words. */
export function announceSort<T>(g: GridContext<T>, sort: readonly SortItem[]): void {
  if (!sort.length) return g.live.announce(g.msg('announce.sortCleared'));
  const first = sort[0]!;
  const col = g.columns.get(first.column);
  g.live.announce(g.msg('announce.sorted', {
    column: col?.def.header ?? first.column,
    direction: g.msg(first.dir === 'asc' ? 'sort.ascending' : 'sort.descending'),
    rows: g.msg('announce.rows', { n: g.rows.displayed.count }),
  }));
}
