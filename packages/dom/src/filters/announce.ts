import type { GridContext } from '../context.js';

/**
 * After a user's filter change, the filtered count (`announce.filtered {rows}`), or
 * `announce.filteredOpen` when nobody knows it. In the browser the rows are there when
 * `filterChanged` comes; on a server, once the answer is in (a failed fetch says nothing more:
 * the base says the error). Also asks for a paint, which `filterChanged` alone does not.
 * Returns the unsubscribe.
 */
export function announceFilters(g: GridContext<unknown>): () => void {
  let waiting = false;
  const say = (): void => {
    waiting = false;
    const n = g.rows.counts.filtered;
    g.live.announce(n === null ? g.msg('announce.filteredOpen') : g.msg('announce.filtered', { rows: g.msg('announce.rows', { n }) }));
  };
  return g.kernel.subscribe((e) => {
    if (e.type === 'filterChanged') {
      g.schedule();
      if (e.source === 'user') {
        if (g.rows.status.phase === 'loading') waiting = true;
        else say();
      }
    } else if (e.type === 'modelUpdated' && waiting) {
      const phase = g.rows.status.phase;
      if (phase === 'error') waiting = false;
      else if (phase !== 'loading') say();
    }
  });
}
