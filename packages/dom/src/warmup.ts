import type { GridContext } from './context.js';
import { idleLoop } from './idle.js';

/** The quick-search warm-up: `want`, a feature asking for it (a bound search box took focus, step 16). */
export interface Warmup {
  want: boolean;
  warm(): void;
}

/**
 * The quick search prepared in idle time (D13), after a load, a language change, or the box emptied:
 * with `searchWarmup: 'idle'`, or while a feature wants it.
 */
export function installWarmup<T>(g: GridContext<T>): Warmup {
  let stopWarm: (() => void) | null = null;
  const w: Warmup = { want: false, warm };
  function warm(): void {
    stopWarm?.();
    stopWarm = null;
    if (g.settings.searchWarmup !== 'idle' && !w.want) return;
    if (!g.rows.warmSearch) return;
    const s = g.rows.warmSearch();
    const stop = idleLoop(() => s.step(2000), g.scope, { win: g.win, busy: () => g.now() - g.scrolledAt < 200 });
    stopWarm = () => {
      s.cancel();
      stop();
    };
  }
  let quickBefore = g.kernel.query.quick;
  g.scope.add(g.kernel.subscribe((e) => {
    if (e.type !== 'modelUpdated') return;
    const emptied = quickBefore.trim() !== '' && g.kernel.query.quick.trim() === '';
    quickBefore = g.kernel.query.quick;
    // A server's rows arrive as a new query or page: prepare their search too (done at once when it runs there).
    if (e.kind === 'rows' || e.kind === 'context' || emptied || (g.rows.kind === 'source' && e.kind === 'query')) warm();
  }));
  return w;
}
