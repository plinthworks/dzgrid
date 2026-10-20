import type { GridEvent } from '@dzgrid/core';
import type { GridContext } from '../context.js';

/**
 * A sentence said once the rows have settled after a user's action (step 17: the filters'
 * count, the search's, the pager's page): `trigger` names the action's event; in the browser
 * `say` runs at once, on a server once the answer is in (the model's own follow-up requests
 * included). A newer request a command starts first (another feature's, a host's) makes the
 * answer not this action's: nothing is said for it. Nothing on a failure: the base says the
 * error. Returns the kernel listener.
 */
export function settled(g: GridContext<unknown>, trigger: (e: GridEvent<unknown>) => boolean, say: () => void): (e: GridEvent<unknown>) => void {
  let waiting = false;
  return (e) => {
    const phase = g.rows.status.phase;
    // The trigger follows the model change its command made: a change a command made while
    // waiting is a newer request, unless the trigger comes right after it.
    if (trigger(e)) waiting = true;
    else if (e.type !== 'modelUpdated' || !waiting) return;
    else if (e.source !== 'data') return void (waiting = false);
    if (phase === 'loading') return;
    waiting = false;
    if (phase !== 'error') say();
  };
}
