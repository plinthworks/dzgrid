import type { GridContext } from '../context.js';
import type { GridInstance } from '../grid.js';
import type { NestedGridOptions } from './nested.js';

export type Hold = { wire(): void; off(): void };

/**
 * `arrows`, `inlineScroll` (1.13.0) on a panel's grid — a `nestedGrid` one, or one a host made (`adopt`, Angular's
 * `[dzgNested]`): following the master's sideways scroll, no scrollbar of its own from the first paint (`wire`, again
 * for a grid made again); the rest in a chunk loaded now (`through.ts`), unless `off` came first.
 */
export function hold(o: Pick<NestedGridOptions<unknown>, 'arrows' | 'inlineScroll'>, host: HTMLElement, grid: () => GridInstance<any, any>, ctx: () => GridContext<any>): Hold {
  let th: Hold | undefined;
  let gone = 0;
  const h: Hold = {
    wire() {
      if (o.inlineScroll) ctx().el.viewport.style.overflowX = 'hidden';
      th?.wire();
    },
    off: () => void ((gone = 1), th?.off()),
  };
  h.wire();
  if (o.arrows || o.inlineScroll) void import('./through.js').then((m) => void (gone || (th = m.through(o, host, grid, ctx))));
  return h;
}
