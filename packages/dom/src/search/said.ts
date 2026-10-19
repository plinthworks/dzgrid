import type { GridEvent } from '@dzgrid/core';
import type { GridContext } from '../context.js';

/**
 * After a user's search, the row count (`announce.rows`, owner decision Q3): in the browser at
 * once, on a server once the answer is in (each model update until then). Nothing on a failure
 * (the base says the error) nor when the count is unknown. Returns the kernel listener.
 */
export function rowsSaid(g: GridContext<unknown>): (e: GridEvent<unknown>) => void {
  let waiting = false;
  return (e) => {
    if (e.type === 'quickChanged' ? e.source !== 'user' : e.type !== 'modelUpdated' || !waiting) return;
    const phase = g.rows.status.phase;
    const n = g.rows.counts.filtered;
    waiting = phase === 'loading';
    if (!waiting && phase !== 'error' && n != null) g.live.announce(g.msg('announce.rows', { n }));
  };
}
