import type { DisplayIndex, FocusPos, Query, RowKey } from '@dzgrid/core';
import { emit } from '@dzgrid/core/internal';
import { detailConflicts } from '@dzgrid/core/detail';
// The base by the package's own name (external in this entry's size line): never bundled twice.
import { createGrid, UPDATE_POLICY } from '@dzgrid/dom';
import type { GridContext, GridEnv } from '../context.js';
import type { GridInstance } from '../grid.js';
import type { PartHandle, SlotContext, SlotPart } from '../part.js';
import type { GridSettings } from '../settings.js';

/** What a nested grid's settings are made from: the panel's context (the master row, its key, the depth). */
export type NestedContext = SlotContext['detail'];

export interface NestedGridOptions<C> {
  /** The grid for a master: its rows, columns, messages, label (« Visits of … »), its own features. */
  readonly settings: (c: NestedContext) => GridSettings<C>;
  /** How many masters' grids are remembered (sort, filters, quick search, open rows, focused cell, scroll), the least recently used forgotten first: 20. */
  readonly keep?: number;
  /** Called with each grid made, once it is mounted (a host wiring its own toolbar or events). */
  readonly onGrid?: (grid: GridInstance<C, any>, c: NestedContext) => void;
  /** The grid's test seams (`createGrid`'s third argument): tests only. */
  readonly env?: (c: NestedContext) => GridEnv;
}

/**
 * `nestedGrid(options)`: a ready `'detail'` part that makes a grid in each panel (master-detail.md): its
 * own keys, scroll and focus; Enter or F2 on the panel focuses it (its focus, else the first row in view);
 * Escape it leaves goes back to the panel's cell, one level only. Each master's sort, filters, open rows,
 * focused cell and scroll (its top row and the offset into it) are remembered when its panel goes (closed,
 * scrolled away) and given back when it comes again, for the last `keep` masters. A new master row or
 * language updates the grid in place (`grid.update`); only a change of a fixed setting makes it again. Past 3 levels, the grid made tells `unsupported-combination` (`detail.depth`, owner Q5).
 * A nested grid needs a fixed or function height (it has no natural height of its own).
 */
export function nestedGrid<C>(o: NestedGridOptions<C>): SlotPart<'detail'> {
  const memory = new Map<RowKey, Kept>();
  /** Grids whose panel went while they were saving (owner S8-O3), off the page until their answer (a refusal: until shown or let go), by master. */
  const alive = new Map<RowKey, Alive<C>>();
  return {
    slot: 'detail',
    part: {
      /**
       * The kept grids let go (review 2): every one when the grid around is destroyed (`keep` absent), else those
       * whose master row `keep` no longer finds. A grid kept for a refusal only stays until then, or until its panel
       * comes back and shows it.
       */
      drop(keep?: (master: RowKey) => boolean): void {
        // Still saving: its master gone, it goes once the answer is in (`gone`); only refused: now.
        for (const [m, a] of alive) if (!keep?.(m)) (a.gone = 1), (keep && a.busy() > 1) || (alive.delete(m), a.off(), a.grid.destroy());
      },
      mount(host, c) {
        let grid: GridInstance<C, any>;
        let ctx: GridContext<C>;
        let s: GridSettings<C>;
        /** What was remembered, until the restore job has run (a save before it keeps it). */
        let was: Kept | undefined;
        /** What this master's grid is left as, for its next panel (the least recently used forgotten first). */
        const save = (): void => {
          const t = ctx.scroll.logicalTop;
          const d = grid.kernel.rows.displayed;
          const i = d.count && ctx.layout ? ctx.layout.indexAt(t) : undefined;
          memory.delete(c.master);
          memory.set(c.master, was ?? { query: grid.kernel.query, top: t, at: i === undefined ? i : d.keyAt(i), off: i === undefined ? 0 : t - ctx.layout!.offsetOf(i), open: [...grid.kernel.expansion], focus: grid.kernel.focus });
          for (const k of memory.keys()) if (memory.size > (o.keep ?? 20)) memory.delete(k);
        };
        const make = (): void => {
          grid = createGrid<C>(host, s, o.env?.(c));
          ctx = (grid as unknown as { context: GridContext<C> }).context;
          // A host callback that throws after the grid is made: the grid goes too (the part's mount failed).
          try {
            const told = detailConflicts({ depth: c.depth! });
            if (told.length) emit(grid.kernel, { type: 'problems', source: 'host', problems: told });
            const w = (was = memory.get(c.master));
            if (w) {
              const k = grid.kernel;
              k.dispatch({ type: 'query.set', query: w.query }, 'api');
              if (w.open.length) k.dispatch({ type: 'rows.expand', rows: w.open, expanded: true }, 'api');
              if (w.focus) k.dispatch({ type: 'focus.set', focus: w.focus }, 'api');
              // After the grid's first paint (the same frame's next job): its rows are there to scroll to; the
              // top row where it was (rows open above it or gone move the pixels), else the pixels.
              ctx.scheduler.schedule({ read() {}, write() {
                const i = w.at === undefined ? -1 : k.rows.displayed.indexOf(w.at);
                ctx.scroll.scrollTo(i < 0 ? w.top : ctx.layout!.offsetOf(i as DisplayIndex) + w.off);
                was = undefined;
                ctx.schedule();
              } });
            }
            o.onGrid?.(grid, c);
          } catch (err) {
            grid.destroy();
            throw err;
          }
        };
        const focus = (): boolean => {
          const f = grid.kernel.focus;
          const d = grid.kernel.rows.displayed;
          const first = ctx.columns.visible()[0];
          const L = ctx.layout;
          const t = ctx.scroll.logicalTop;
          // The first row whose top is in view (never a scroll away from where the grid was left).
          let i = L && d.count ? L.indexAt(t) : d.index(0);
          if (L && i !== null && L.offsetOf(i) < t) i = d.index(i + 1) ?? i;
          if (f?.kind === 'cell') grid.api.focusCell(f.row, f.column);
          else if (i !== null && first) grid.api.focusCell(d.keyAt(i), first.id);
          else return false;
          return true;
        };
        // A grid kept alive for this master (its panel went while it saved): given back, on the page again, as it is.
        const kept = alive.get(c.master);
        const now = c;
        if (kept) {
          alive.delete(c.master);
          kept.off();
          ({ grid, ctx, s, c } = kept);
          host.append(ctx.el.root);
        } else {
          s = o.settings(c);
          make();
        }
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
        const h: PartHandle<NestedContext> = {
          // Another master row (new data) or language: the host's settings again, given to the grid in place
          // (its focus, scroll and state untouched); a fixed setting changed: the grid made again, its state
          // and the focus inside it kept.
          update(n) {
            if (n.row === c.row && n.ctx === c.ctx) return void (c = n);
            c = n;
            const was = s;
            s = o.settings(n);
            const patch: Record<string, unknown> = {};
            for (const key in { ...was, ...s }) {
              const v = s[key as keyof GridSettings<C>];
              if (UPDATE_POLICY[key as keyof GridSettings<C>] === 'live' && v !== was[key as keyof GridSettings<C>]) patch[key] = v;
            }
            if (fixed(s) === fixed(was)) return grid.update(patch);
            const inside = host.contains(host.ownerDocument.activeElement);
            save();
            grid.destroy();
            make();
            if (inside) focus();
          },
          focus,
          destroy() {
            save();
            host.removeEventListener('keydown', peek, true);
            host.removeEventListener('keydown', esc);
            // An open field leaves as a blur keeps it (Q5): its text sent while its row is held.
            ctx.editor?.field.dispatchEvent(new FocusEvent('focusout'));
            // 2: a field open or something to send; 1: a refusal to show (kept until shown or let go); 0: idle.
            const busy = (): number => (ctx.editor ? 2 : ctx.edit?.busy?.() ?? 0);
            if (!busy()) return grid.destroy();
            // Saving (S8-O3): off the page, alive until nothing is left to send or to hear, then gone.
            const a: Alive<C> = { grid, ctx, s, c, busy, off: () => {} };
            // Off the page with its panel (the base removes the box); its listener sees it through.
            alive.set(c.master, a);
            // Judged once the events of a change are all told (a refusal's `saveFailed` comes after its states).
            a.off = grid.kernel.subscribe(() => queueMicrotask(() => void (alive.get(a.c.master) === a && busy() < (a.gone ? 2 : 1) && (alive.delete(a.c.master), a.off(), grid.destroy()))));
          },
        };
        // Given back: the master's row and context now.
        if (kept) h.update!(now);
        return h;
      },
    } as SlotPart<'detail'>['part'],
  };
}

/** A grid kept alive off the page (S8-O3): what its mount held, and its listener's end. */
interface Alive<C> {
  readonly grid: GridInstance<C, any>;
  readonly ctx: GridContext<C>;
  readonly s: GridSettings<C>;
  readonly c: NestedContext;
  readonly busy: () => number;
  /** Its master row is gone: let go as soon as nothing is in flight. */
  gone?: number;
  off: () => void;
}

/** A master's grid as it was left: its query, open rows, focused cell, top row and the offset into it (the pixels if gone). */
interface Kept {
  readonly query: Query;
  readonly top: number;
  readonly at: RowKey | undefined;
  readonly off: number;
  readonly open: RowKey[];
  readonly focus: FocusPos | null;
}

/**
 * A grid's fixed settings as text, functions by their source: a host writing `getRowId: (r) => r.id` or
 * `features: [tree()]` inline in its `settings` makes new ones at each call, and that is not a new grid.
 * (The live keys, rows among them, are left out at every level: a nested option of the same name too.)
 */
const fixed = (s: object): string | undefined =>
  JSON.stringify(s, (k, v) => (UPDATE_POLICY[k as keyof GridSettings<unknown>] === 'live' ? undefined : typeof v === 'function' ? '' + v : v));
