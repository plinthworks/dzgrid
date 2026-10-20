import type { GridEvent } from '@dzgrid/core';
import type { GridContext } from '../context.js';

/**
 * A sentence said once the rows have settled after a user's action (step 17: the filters'
 * count, the search's, the pager's page): `trigger` names the action's event; in the browser
 * `say` runs at once, on a server once the answer is in (each model update until then; a
 * request replaced by a newer one waits for the last answer). Nothing on a failure: the base
 * says the error. Returns the kernel listener.
 */
export function settled(g: GridContext<unknown>, trigger: (e: GridEvent<unknown>) => boolean, say: () => void): (e: GridEvent<unknown>) => void {
  let waiting = false;
  return (e) => {
    if (!trigger(e) && (e.type !== 'modelUpdated' || !waiting)) return;
    const phase = g.rows.status.phase;
    waiting = phase === 'loading';
    if (!waiting && phase !== 'error') say();
  };
}
