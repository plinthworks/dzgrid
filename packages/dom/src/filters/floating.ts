import { filterKindOf, partNameFor, problem, type ColumnDef, type ColumnFilter, type ColumnOrGroup, type Json, type PartColumn, type ResolvedColumn } from '@dzgrid/core';
import { emit, filterKindLookup } from '@dzgrid/core/internal';
import type { GridContext } from '../context.js';
import type { HeaderRowSpec } from '../render/header.js';
import type { Part, SlotContext } from '../part.js';
import { mounted, type Mounted } from '../mounted.js';

type FC = SlotContext['floating'];
type Resolved = { readonly part: Part<FC> | null; readonly kind: string };

const BUILT_IN: ReadonlySet<string> = new Set(['text', 'number', 'day', 'instant', 'boolean', 'set']);
/** What a floating cell may hold that takes the focus: out of the Tab order until Enter or F2. */
const CONTROLS = 'input,button,select,textarea,a[href],[tabindex]';
const leaves = (t: readonly ColumnOrGroup<unknown>[]): ColumnDef<unknown>[] => t.flatMap((d) => (d && 'children' in d ? leaves(d.children) : [d]));

export interface FloatingRow {
  readonly spec: HeaderRowSpec;
  sweep(): void;
  destroy(): void;
}

/**
 * The floating row (docs/behaviors/filter-ui.md, step 12): fixed when the grid is made (owner
 * decision O3), there when `filters({ floating: true })` or a column, hidden ones included, asks
 * for it; null otherwise. Each cell's part is resolved from the registry (`floating.<kind>`, then
 * the bare `floating`), mounted with its cell and swept when the cell leaves the column window.
 * The feature holds the pause: one pending edit per column, applied by its timer, Enter, Escape,
 * the focus leaving the cell or the cell leaving the window; dropped with the grid. Enter or F2
 * on a cell goes into its part, Escape inside comes back to the cell.
 */
export function floatingRow(g: GridContext<unknown>, o: { readonly floating?: boolean; readonly debounceMs?: number }): FloatingRow | null {
  if (o.floating !== true && !leaves(g.settings.columns).some((d) => d?.filter && d.filter.floating === true)) return null;
  const kinds = filterKindLookup(g.settings.filterKinds);
  const cells = new Map<HTMLElement, Mounted<FC>>();
  const pending = new Map<string, { readonly f: ColumnFilter | null; cancel(): void }>();
  let reg: unknown = null;
  let version = -1;
  let by = new Map<string, Resolved>();
  let told = new Set<string>();

  function resolve(col: ResolvedColumn<unknown>): Resolved {
    const now = g.parts();
    if (reg !== now || version !== g.columns.version) {
      if (reg !== now) told = new Set();
      reg = now;
      version = g.columns.version;
      by = new Map();
    }
    let r = by.get(col.id);
    if (r) return r;
    const f = col.def.filter;
    const pc: PartColumn = { id: col.id, type: col.type, ...(f && { filter: f }) };
    const kind = filterKindOf(pc);
    let ok = f !== false && (f?.floating ?? o.floating === true);
    if (ok && !BUILT_IN.has(kind)) {
      const k = kinds.get(kind);
      const path = `columns.${col.id}.filter.kind`;
      // An unknown kind the column names is said once per registry; a custom type without one is silent.
      if (!k && f && f.kind && !told.has(path)) told.add(path), emit(g.kernel, { type: 'problems', source: 'host', problems: [problem('invalid-filter', 'error', path, 'unknown kind')] });
      // A kind without its browser rule cannot filter there: no box.
      ok = !!k && (!!k.test || g.rows.ops.filter !== 'client');
    }
    const name = ok ? (partNameFor('floating', pc, new Set(Object.keys(now).filter((n) => now[n]!.slot === 'floating'))).name ?? (now['floating']?.slot === 'floating' ? 'floating' : null)) : null;
    by.set(col.id, (r = { part: name ? (now[name]!.part as Part<FC>) : null, kind }));
    return r;
  }

  // A column gone (removed) takes its edit with it.
  const flush = (column: string): void => {
    const p = pending.get(column);
    if (!p) return;
    pending.delete(column);
    p.cancel();
    if (!g.columns.get(column)) return;
    const r = g.kernel.dispatch({ type: 'filter.column', column, filter: p.f }, 'user');
    if (!r.ok) emit(g.kernel, { type: 'problems', source: 'user', problems: r.problems });
  };
  const edit = (column: string, ms: number, f: ColumnFilter | null, how: string | undefined): void => {
    pending.get(column)?.cancel();
    pending.delete(column);
    if (how === 'cancel') return;
    const at = how !== 'now' && ms > 0 && g.win;
    pending.set(column, { f, cancel: at ? g.scope.timeout(() => flush(column), ms) : () => {} });
    if (!at) flush(column);
  };
  const pause = (col: ResolvedColumn<unknown>): number => {
    for (const v of [col.def.filter && col.def.filter.debounceMs, o.debounceMs]) if (typeof v === 'number' && v >= 0 && v < Infinity) return v;
    return g.rows.ops.filter === 'server' ? 300 : 150;
  };
  const tab = (cell: HTMLElement, i: number): void => {
    for (const c of cell.querySelectorAll<HTMLElement>(CONTROLS)) c.tabIndex = i;
  };

  function paint(cell: HTMLElement, col: ResolvedColumn<unknown>): void {
    const m = cells.get(cell);
    if (!m) return;
    const { part, kind } = resolve(col);
    const custom = !BUILT_IN.has(kind);
    const stored = g.kernel.query.filter[col.id] ?? null;
    const state = (custom ? (stored?.type === 'custom' && stored.kind === kind ? stored.state : null) : stored) as Json | null;
    const ms = pause(col);
    m.set(cell, part, {
      column: col, kind, state, where: g.rows.ops.filter, debounceMs: ms,
      set: (next, x) => edit(col.id, ms, (custom && next !== null ? { type: 'custom', kind, state: next } : next) as ColumnFilter | null, x?.commit),
    });
    // One tab stop for the grid: the cell's controls only while the focus is in them.
    const at = g.doc.activeElement;
    if (at === cell || !cell.contains(at)) tab(cell, -1);
    // The grid reads as read-only; a cell holding a box is not.
    if (cell.querySelector('input')) cell.setAttribute('aria-readonly', 'false');
    else cell.removeAttribute('aria-readonly');
  }

  g.scope.on(g.el.header, 'keydown', (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    const cell = t.closest<HTMLElement>('.dzg-hextra');
    const m = cell && cells.get(cell);
    if (!m) return;
    const column = cell.dataset['col']!;
    if (t === cell) {
      if ((e.key !== 'Enter' && e.key !== 'F2') || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      e.preventDefault();
      e.stopPropagation();
      tab(cell, 0);
      if (!m.focus()) tab(cell, -1);
    } else if (e.key === 'Escape') {
      // Back to the cell, the filter kept; never to a host dialog around the grid. Inside a
      // composition, it only ends it: kept in the box, nothing applied.
      e.stopPropagation();
      if (!e.isComposing) e.preventDefault(), flush(column), cell.focus();
    } else if (e.key === 'Enter' && !e.isComposing) flush(column);
  });
  g.scope.on(g.el.header, 'focusout', (e: FocusEvent) => {
    const t = e.target as HTMLElement;
    const cell = t.closest<HTMLElement>('.dzg-hextra');
    const to = e.relatedTarget as Node | null;
    if (!cell || t === cell || !cells.has(cell) || (to && to !== cell && cell.contains(to))) return;
    tab(cell, -1);
    flush(cell.dataset['col']!);
  });

  return {
    spec: { id: 'filters.floating', mount: (cell) => void cells.set(cell, mounted<FC>(g)), update: paint },
    // A cell that left the column window (or the page): its pending edit applied, its part destroyed.
    sweep() {
      for (const [cell, m] of cells) {
        if (g.el.header.contains(cell)) continue;
        flush(cell.dataset['col']!);
        m.clear();
        cells.delete(cell);
      }
    },
    // The pending edits' timers belong to the grid's scope: they go with it.
    destroy() {
      for (const m of cells.values()) m.clear();
    },
  };
}
