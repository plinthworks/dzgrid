import type { ColumnFilter, Json, Placement, ResolvedColumn } from '@dzgrid/core';
import { emit } from '@dzgrid/core/internal';
import type { GridContext } from '../context.js';
import { BUILT_IN } from './resolve.js';

type How = 'now' | 'debounced' | 'cancel' | undefined;

/** What the floating cell's and the popup's parts share: the column, its kind, its state and `set`. */
export interface Edits {
  readonly column: ResolvedColumn<unknown>;
  readonly kind: string;
  readonly state: Json | null;
  readonly where: Placement;
  readonly debounceMs: number;
  set(next: Json | null, o?: { readonly commit?: How }): void;
}

export interface Commit {
  /** Applies the column's pending edit now (none: nothing). */
  flush(column: string): void;
  /** `who`: the part's host; its `cancel` drops only an edit it left pending itself. */
  edits(col: ResolvedColumn<unknown>, kind: string, who: object): Edits;
}

/**
 * The pause (docs/behaviors/filter-ui.md): one pending edit per column, shared by the floating
 * row and the popup (the last write wins), applied by its timer, a flush, or at once; `cancel`
 * drops it when the part cancelling wrote it (a box giving way to the summary leaves the popup's). A column gone takes its edit with it; the timers belong to the grid's scope. A custom
 * kind's state is wrapped as `{type: 'custom', kind, state}` here, unwrapped for its part.
 */
export function committer(g: GridContext<unknown>, o: { readonly debounceMs?: number }): Commit {
  const pending = new Map<string, { readonly f: ColumnFilter | null; readonly who: object; cancel(): void }>();
  const flush = (column: string): void => {
    const p = pending.get(column);
    if (!p) return;
    pending.delete(column);
    p.cancel();
    if (!g.columns.get(column)) return;
    const r = g.kernel.dispatch({ type: 'filter.column', column, filter: p.f }, 'user');
    if (!r.ok) emit(g.kernel, { type: 'problems', source: 'user', problems: r.problems });
  };
  const edit = (column: string, ms: number, f: ColumnFilter | null, how: How, who: object): void => {
    const p = pending.get(column);
    if (how === 'cancel' && p?.who !== who) return;
    p?.cancel();
    pending.delete(column);
    if (how === 'cancel') return;
    const at = how !== 'now' && ms > 0 && g.win;
    pending.set(column, { f, who, cancel: at ? g.scope.timeout(() => flush(column), ms) : () => {} });
    if (!at) flush(column);
  };
  const pause = (col: ResolvedColumn<unknown>): number => {
    for (const v of [col.def.filter && col.def.filter.debounceMs, o.debounceMs]) if (typeof v === 'number' && v >= 0 && v < Infinity) return v;
    return g.rows.ops.filter === 'server' ? 300 : 150;
  };
  return {
    flush,
    edits(col, kind, who) {
      const custom = !BUILT_IN.has(kind);
      const all = g.kernel.query.filter;
      // Its own entry only: an id such as `constructor` must not read the prototype.
      const stored = Object.hasOwn(all, col.id) ? all[col.id]! : null;
      const ms = pause(col);
      return {
        column: col, kind, where: g.rows.ops.filter, debounceMs: ms,
        state: (custom ? (stored?.type === 'custom' && stored.kind === kind ? stored.state : null) : stored) as Json | null,
        set: (next, x) => edit(col.id, ms, (custom && next !== null ? { type: 'custom', kind, state: next } : next) as ColumnFilter | null, x?.commit, who),
      };
    },
  };
}
