import type { GridContext } from './context.js';
import { idleLoop } from './idle.js';

/** The quick-search warm-up (D13), asked for by a feature (the search box, step 16). */
export interface Warmup {
  /**
   * A bound search box: returns its release (once). The last release ends what `want` asked for and
   * stops a warm-up under way, unless the grid prepares it anyway (`searchWarmup: 'idle'`).
   */
  hold(): () => void;
  /** A held box took focus: prepares the search, once until the last release (a server's needs nothing). */
  want(): void;
  warm(): void;
}

/**
 * The quick search prepared in idle time (D13), after a load, a language change, or the box emptied:
 * with `searchWarmup: 'idle'`, or while a feature wants it.
 */
export function installWarmup<T>(g: GridContext<T>): Warmup {
  let stopWarm: (() => void) | null = null;
  /** The boxes held, and whether one of them asked for it. */
  let holds = 0;
  let wanted = false;
  const stop = (): void => {
    stopWarm?.();
    stopWarm = null;
  };
  const w: Warmup = {
    hold() {
      holds++;
      let held = true;
      return () => {
        if (!held) return;
        held = false;
        if (!--holds) (wanted = false), g.settings.searchWarmup === 'idle' || stop();
      };
    },
    want() {
      if (holds && !wanted && g.rows.ops.quick !== 'server') (wanted = true), warm();
    },
    warm,
  };
  function warm(): void {
    stop();
    if (g.settings.searchWarmup !== 'idle' && !wanted) return;
    if (!g.rows.warmSearch) return;
    const s = g.rows.warmSearch();
    const end = idleLoop(() => s.step(2000), g.scope, { win: g.win, busy: () => g.now() - g.scrolledAt < 200 });
    stopWarm = () => {
      s.cancel();
      end();
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
