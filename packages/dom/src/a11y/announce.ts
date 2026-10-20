import type { GridEvent, SortItem } from '@dzgrid/core';
import type { GridContext } from '../context.js';

/**
 * A user's sort, said: at once when its rows are there, else once its answer is in (a server's,
 * step 18: before it, the count would be of rows about to go). A newer change (its own model
 * change, not the data's) takes it over; a failure says no order.
 */
export function sortAnnouncer<T>(g: GridContext<T>): (e: GridEvent<T>) => void {
  let waiting = false;
  return (e) => {
    const phase = g.rows.status.phase;
    if (e.type === 'sortChanged' && e.source === 'user') phase === 'loading' ? (waiting = true) : announceSort(g, e.sort);
    else if (waiting && e.type === 'modelUpdated' && (e.source !== 'data' || phase !== 'loading')) (waiting = false), e.source === 'data' && phase === 'idle' && announceSort(g, g.kernel.query.sort);
  };
}

/**
 * The new order, with the count of the rows it orders (all the filtered ones, not a page), in the
 * bundle's words; the order alone when the count is unknown (a server without a total, step 18).
 */
function announceSort<T>(g: GridContext<T>, sort: readonly SortItem[]): void {
  if (!sort.length) return g.live.announce(g.msg('announce.sortCleared'));
  const first = sort[0]!;
  const col = g.columns.get(first.column);
  const n = g.rows.counts.filtered;
  g.live.announce(g.msg('announce.sorted', {
    column: col?.def.header ?? first.column,
    direction: g.msg(first.dir === 'asc' ? 'sort.ascending' : 'sort.descending'),
    rows: n === null ? '' : g.msg('announce.rows', { n }),
  }).trim());
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
