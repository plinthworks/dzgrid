import type { ColumnDef, ColumnOrGroup, Json, LocaleCtx, ModelStatus, PageState, PartSlot, Placement, Problem, ResolvedColumn, RowCounts, RowKey, SortItem, ValuesHandle, ValuesOptions } from '@dzgrid/core';
import type { AppMessageKey, FilterMessageKey, MessageKey, PaginationMessageKey } from './messages.js';
import type { GridFeature } from './features.js';
import type { GridSettings } from './settings.js';

/**
 * One contract for everything a host may draw in the grid (Phase 3, the
 * plug-in design): a part mounts into a host element the grid gives it,
 * updates with a new context, and is destroyed before its host is reused
 * elsewhere. The grid never writes HTML; a part writes its own DOM.
 */
export interface Part<C> {
  mount(host: HTMLElement, c: C): PartHandle<C>;
}

export interface PartHandle<C> {
  /** Same host, new context: a pooled cell rebound to another row, a changed state. */
  update?(c: C): void;
  /** Remove listeners; the grid empties the host after. */
  destroy?(): void;
  /** The grid asks the part to take focus; false when it has nothing focusable. */
  focus?(): boolean;
}

/** What every part gets. */
export interface PartBase {
  readonly ctx: LocaleCtx;
  readonly dir: 'ltr' | 'rtl';
  /** The grid's messages, and the host's own `app.*` ones (a missing one shows its key, told once). */
  msg(key: MessageKey | FilterMessageKey | PaginationMessageKey | AppMessageKey, params?: Readonly<Record<string, string | number>>): string;
  announce(text: string): void;
  readonly doc: Document;
}

export interface SlotContext {
  cell: PartBase & {
    /** The cell's value, read and coerced by the column's codec; null when blank or unreadable. */
    readonly value: unknown;
    /** The text the grid would show. */
    readonly text: string;
    readonly row: Readonly<unknown>;
    readonly key: RowKey;
    readonly column: ResolvedColumn<unknown>;
    /** The grid's focus is on this cell. */
    readonly focused: boolean;
  };
  /** A column header's label (`@dzgrid/dom/slots`): the grid keeps the role, the sort state, the mark and the grip. */
  header: PartBase & {
    readonly column: ResolvedColumn<unknown>;
    /** The column's `header`, or its id. */
    readonly label: string;
    /** This column's place in the sort, or null. */
    readonly sort: SortItem | null;
    /** Its precedence in the sort, from 0, or null. */
    readonly sortIndex: number | null;
    /** Sorts by this column as the user would (`multi`: adds to the sort, as Shift does). */
    toggleSort(multi: boolean): void;
  };
  /** The overlay (`@dzgrid/dom/slots`). */
  overlay: PartBase & {
    readonly phase: 'loading' | 'empty' | 'no-match' | 'error';
    /** What the server's fetch failed with; null outside an error. */
    readonly failure: unknown;
    /** Asks for the rows again, puts the focus back on the grid and says it loads (the retry button's). */
    retry(): void;
    /** Empties every column filter and the quick search, as the user. */
    clearFilters(): void;
  };
  /**
   * A cell of the floating filter row (`@dzgrid/dom/filters`, step 12): `floating.<kind>`, else
   * the bare `floating` (the summary).
   */
  floating: PartBase & {
    readonly column: ResolvedColumn<unknown>;
    /** The column's filter kind: `filter.kind`, or its type (an enum's is `set`). */
    readonly kind: string;
    /** A built-in kind's stored filter; a custom kind's state; null: no filter. */
    readonly state: Json | null;
    /** Where the filter runs (`operations.filter`). */
    readonly where: Placement;
    /** The pause before a debounced edit applies: the column's, then `filters({ debounceMs })`, else 150 (browser) or 300 (server). */
    readonly debounceMs: number;
    /**
     * Stores the column's filter as the user (null removes it; a custom kind's state is wrapped as
     * `{type: 'custom', kind, state}`, and must be null when the kind says it is not active).
     * `debounced` by default: one pending edit per column, the next replacing it; `cancel` drops
     * the pending edit and stores nothing (`next` unused).
     */
    set(next: Json | null, o?: { readonly commit?: 'now' | 'debounced' | 'cancel' }): void;
    /** The column has a filter popup (step 13): a summary may open it. */
    readonly canOpen: boolean;
    /** Opens the column's popup from this cell (anchored to its `aria-haspopup` control, else the cell), or closes it when open. */
    openFilter(): void;
  };
  /**
   * The column's filter popup (`@dzgrid/dom/filters`, step 13): `filter.<kind>`, no bare fallback.
   * A part sends null when its draft filters nothing.
   */
  filter: PartBase & {
    readonly column: ResolvedColumn<unknown>;
    readonly kind: string;
    /** As the floating cell's: a built-in kind's filter, a custom kind's state, or null. */
    readonly state: Json | null;
    /** `server`: the popup keeps a draft and sends it at Apply (owner decision O3); `client`: live. */
    readonly where: Placement;
    readonly debounceMs: number;
    /** The column's `filter.ops`, empty when it gives none (the kind's own list). */
    readonly ops: readonly string[];
    /** The grid's day by its clock in its zone (`YYYY-MM-DD`): new at midnight, so an open popup follows it (step 14). */
    readonly today: string;
    /** As the floating cell's, the same pending edit per column (the last write wins). */
    set(next: Json | null, o?: { readonly commit?: 'now' | 'debounced' | 'cancel' }): void;
    /** Closes the popup, focus back on its anchor (the pending edit applied in the browser). */
    close(): void;
    /**
     * The column's value list (step 15): `kernel.values(column, o)` (docs/behaviors/value-list.md).
     * One handle per column: the part closes it when it goes, and asking again closes the first.
     */
    values(o?: ValuesOptions): ValuesHandle;
  };
  /** The tooltip, shown only when the host gave text (`@dzgrid/dom/slots`). */
  tooltip: PartBase & {
    /** The host's text (`headerTooltip`, `tooltip(value, row)`). */
    readonly text: string;
    /** The cell's value as the column's codec reads it; null for a header. */
    readonly value: unknown;
    /** The cell's row; null for a header. */
    readonly row: Readonly<unknown> | null;
    readonly column: ResolvedColumn<unknown>;
  };
  /**
   * A part of the footer (`@dzgrid/dom/pagination`, step 17): `footer.pager`, `footer.count`,
   * `footer.selected`, or a host's own listed in `pagination({ footer })`. The functions keep
   * their identity; they act as the user (`page.go`, `page.size`, `selection.allFiltered`,
   * `selection.clear`, the focus then back on the grid).
   */
  footer: PartBase & {
    readonly page: PageState;
    readonly counts: RowCounts;
    readonly status: ModelStatus;
    /** The rows shown, from 1; null with no rows or while loading. */
    readonly range: { readonly from: number; readonly to: number } | null;
    /**
     * `count`: the last told (null: every matching row, count unknown); `shown`: selected rows on
     * the page; `all`: every row of the query (everything-except); `canSelectAll`: "Select all N".
     */
    readonly selection: { readonly count: number | null; readonly shown: number; readonly all: boolean; readonly canSelectAll: boolean; readonly mode: 'none' | 'single' | 'multi' };
    go(index: number): void;
    /** The page after the one shown at the call, if any (prev: before). */
    next(): void;
    prev(): void;
    setSize(size: number): void;
    selectAll(): void;
    clearSelection(): void;
  };
}

export type WiredSlot = keyof SlotContext;

/** A part for a slot, registered by name in `settings.parts`. */
export interface SlotPart<S extends WiredSlot = WiredSlot> {
  readonly slot: S;
  readonly part: Part<SlotContext[S]>;
}

export function definePart<S extends WiredSlot>(slot: S, part: Part<SlotContext[S]>): SlotPart<S> {
  return { slot, part };
}

type Registry = Readonly<Record<string, SlotPart>>;

/**
 * The grid's parts (step 12): the features' (the first giving a name wins) under the host's
 * `settings.parts` (its names always win). The same object until `settings.parts` changes.
 */
export function featureParts(features: readonly GridFeature[] = [], own: () => Registry | undefined): () => Registry {
  const base: Record<string, SlotPart> = {};
  for (const f of features) for (const n in f.parts) base[n] ??= f.parts[n]!;
  let seen: unknown = base;
  let all: Registry = {};
  return () => {
    const o = own();
    if (o !== seen) all = { ...base, ...(seen = o) };
    return all;
  };
}

/** The feature each slot needs; the cell is the base's. */
const NEEDS: Partial<Record<PartSlot, string>> = { header: 'slots', overlay: 'slots', tooltip: 'slots', floating: 'filters', filter: 'filters', footer: 'pagination' };
const leaves = (t: readonly ColumnOrGroup<unknown>[]): ColumnDef<unknown>[] => t.flatMap((d) => (d && 'children' in d ? leaves(d.children) : [d]));

/**
 * Parts whose slot needs a feature the grid lacks, columns asking for a filter UI without
 * `filters()` (`columns[i].filter`, i over the leaves), and paged rows without `pagination()`
 * (`settings.pagination`, step 17): told once, a warning each, the detail naming the feature.
 */
export function unslotted(s: GridSettings<unknown>, paged: unknown): Problem[] {
  const has = new Set(s.features?.map((f) => f.id));
  const missing = (path: string, detail?: string): Problem[] => (detail && !has.has(detail) ? [{ code: 'missing-feature', severity: 'warning', path, detail }] : []);
  return [
    ...Object.keys(s.parts ?? {}).flatMap((n) => missing(`parts.${n}`, NEEDS[s.parts![n]!.slot])),
    ...(paged ? missing('settings.pagination', 'pagination') : []),
    ...leaves(s.columns).flatMap((d, i) => (d?.filter && (d.filter.floating || d.filter.kind) ? missing(`columns[${i}].filter`, 'filters') : [])),
  ];
}

export type { PartSlot };
