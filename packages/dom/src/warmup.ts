import type { GridContext } from './context.js';
import { idleLoop } from './idle.js';

/** The quick search prepared in idle time (D13), after a load, a language change, or the box emptied. */
export function installWarmup<T>(g: GridContext<T>): { warm(): void } {
  let stopWarm: (() => void) | null = null;
  function warm(): void {
    stopWarm?.();
    stopWarm = null;
    if (g.settings.searchWarmup !== 'idle') return;
    if (!g.rows.warmSearch) return;
    const w = g.rows.warmSearch();
    const stop = idleLoop(() => w.step(2000), g.scope, { win: g.win, busy: () => g.now() - g.scrolledAt < 200 });
    stopWarm = () => {
      w.cancel();
      stop();
    };
  }
  let quickBefore = g.kernel.query.quick;
  g.scope.add(g.kernel.subscribe((e) => {
    if (e.type !== 'modelUpdated') return;
    const emptied = quickBefore.trim() !== '' && g.kernel.query.quick.trim() === '';
    quickBefore = g.kernel.query.quick;
    // A server's rows arrive as a new query or page: prepare their search too (done at once when it runs there).
    if (e.kind === 'rows' || e.kind === 'context' || emptied || (g.rows.kind === 'source' && (e.kind === 'query' || e.kind === 'page'))) warm();
  }));
  return { warm };
}
