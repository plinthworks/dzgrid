import type { GridEvent, SortItem } from '@dzgrid/core';
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

/**
 * What the user selected (the count, or all matching rows when it is unknown),
 * or what the data took away: "all" cleared, rows dropped. A sentence is not
 * said twice in a row: unless the live region said something else meanwhile.
 */
export function selectionAnnouncer<T>(g: GridContext<T>): (e: Extract<GridEvent<T>, { type: 'selectionChanged' }>) => void {
  let said = '';
  return (e) => {
    const text = e.reason === 'scope-changed' ? g.msg('announce.selectionCleared')
      : e.reason === 'rows-dropped' ? g.msg('announce.selectionReduced', { n: e.count ?? 0 })
      : e.source !== 'user' ? null
      : e.count === null ? g.msg('announce.selectedAll') : g.msg('announce.selected', { n: e.count });
    // Something else changed the selection meanwhile: the next sentence is news, even the same one.
    if (text === null) {
      said = '';
      return;
    }
    if (text === said && g.live.said === text) return;
    said = text;
    g.live.announce(text);
  };
}
