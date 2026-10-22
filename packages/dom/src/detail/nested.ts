import type { Query, RowKey } from '@dzgrid/core';
import { emit } from '@dzgrid/core/internal';
import { detailConflicts } from '@dzgrid/core/detail';
// The base by the package's own name (external in this entry's size line): never bundled twice.
import { createGrid } from '@dzgrid/dom';
import type { GridContext, GridEnv } from '../context.js';
import type { GridInstance } from '../grid.js';
import type { SlotContext, SlotPart } from '../part.js';
import type { GridSettings } from '../settings.js';

/** What a nested grid's settings are made from: the panel's context (the master row, its key, the depth). */
export type NestedContext = SlotContext['detail'];

export interface NestedGridOptions<C> {
  /** The grid for a master: its rows, columns, messages, label (« Visits of … »), its own features. */
  readonly settings: (c: NestedContext) => GridSettings<C>;
  /** How many masters' grids are remembered (sort, filters, quick search, scroll), the least recently used forgotten first: 20. */
  readonly keep?: number;
  /** Called with each grid made, once it is mounted (a host wiring its own toolbar or events). */
  readonly onGrid?: (grid: GridInstance<C, any>, c: NestedContext) => void;
  /** The grid's test seams (`createGrid`'s third argument): tests only. */
  readonly env?: (c: NestedContext) => GridEnv;
}

/**
 * `nestedGrid(options)`: a ready `'detail'` part that makes a grid in each panel (master-detail.md): its
 * own keys, scroll and focus; Enter or F2 on the panel focuses it (its focus, else its first cell); Escape
 * it leaves goes back to the panel's cell, one level only. Each master's sort, filters and scroll are
 * remembered when its panel goes (closed, scrolled away) and given back when it comes again, for the last
 * `keep` masters. Past 3 levels, the grid made tells `unsupported-combination` (`detail.depth`, owner Q5).
 * A nested grid needs a fixed or function height (it has no natural height of its own).
 */
export function nestedGrid<C>(o: NestedGridOptions<C>): SlotPart<'detail'> {
  const memory = new Map<RowKey, { query: Query; top: number }>();
  return {
    slot: 'detail',
    part: {
      mount(host, c) {
        let grid: GridInstance<C, any>;
        let ctx: GridContext<C>;
        /** What this master's grid is left as, for its next panel (the least recently used forgotten first). */
        const save = (): void => {
          memory.delete(c.master);
          memory.set(c.master, { query: grid.kernel.query, top: ctx.scroll.logicalTop });
          for (const k of memory.keys()) if (memory.size > (o.keep ?? 20)) memory.delete(k);
        };
        const make = (): void => {
          grid = createGrid<C>(host, o.settings(c), o.env?.(c));
          ctx = (grid as unknown as { context: GridContext<C> }).context;
          // A host callback that throws after the grid is made: the grid goes too (the part's mount failed).
          try {
            const told = detailConflicts({ depth: c.depth! });
            if (told.length) emit(grid.kernel, { type: 'problems', source: 'host', problems: told });
            const was = memory.get(c.master);
            if (was) {
              grid.kernel.dispatch({ type: 'query.set', query: was.query }, 'api');
              // After the grid's first paint (the same frame's next job): its rows are there to scroll to.
              ctx.scheduler.schedule({ read() {}, write() { ctx.scroll.scrollTo(was.top); ctx.schedule(); } });
            }
            o.onGrid?.(grid, c);
          } catch (err) {
            grid.destroy();
            throw err;
          }
        };
        make();
        // Escape this grid did not take (on a cell): back to the panel's cell, once (a grid deeper in it took its
        // own). Not while a composition is cancelled, nor when it only hid this grid's tooltip.
        // The tooltip's state before the grid's own keydown (which hides it, and leaves the key unhandled).
        let tip = false;
        const peek = (): void => void (tip = !ctx.el.tooltip.hidden);
        const esc = (e: KeyboardEvent): void => {
          if (e.key === 'Escape' && !e.defaultPrevented && !e.isComposing && !tip && (e.target as Element).closest('.dzg') === ctx.el.root) e.preventDefault(), c.leave?.();
        };
        host.addEventListener('keydown', peek, true);
        host.addEventListener('keydown', esc);
        return {
          // Another master row (new data) or language: the grid made again from the host's settings, its state kept.
          update(n) {
            const again = n.row !== c.row || n.ctx !== c.ctx;
            if (again) save(), grid.destroy();
            c = n;
            if (again) make();
          },
          focus() {
            const f = grid.kernel.focus;
            const d = grid.kernel.rows.displayed;
            const first = ctx.columns.visible()[0];
            if (f?.kind === 'cell') grid.api.focusCell(f.row, f.column);
            else if (d.count && first) grid.api.focusCell(d.keyAt(d.index(0)!), first.id);
            else return false;
            return true;
          },
          destroy() {
            save();
            host.removeEventListener('keydown', peek, true);
            host.removeEventListener('keydown', esc);
            grid.destroy();
          },
        };
      },
    },
  };
}
