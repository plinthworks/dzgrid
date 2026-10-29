import type { ColumnDef, ColumnOrGroup, Json, LocaleCtx, ModelStatus, PageState, PartSlot, Placement, Problem, ResolvedColumn, RowCounts, RowKey, SortItem, ValuesHandle, ValuesOptions } from '@dzgrid/core';
import type { AppMessageKey, ExportMessageKey, FilterMessageKey, MessageKey, PaginationMessageKey } from './messages.js';
import type { PartsMessageKey, DetailMessageKey, EditMessageKey, EditorsMessageKey, RulesMessageKey, TreeMessageKey, RangeMessageKey, FillMessageKey, ColumnsMessageKey, ColumnsChooserMessageKey, ColumnMenuMessageKey, PinnedMessageKey, PrintMessageKey, FreshMessageKey } from './part-texts.js';
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
  msg(key: MessageKey | FilterMessageKey | PaginationMessageKey | ExportMessageKey | PartsMessageKey | RulesMessageKey | TreeMessageKey | DetailMessageKey | EditMessageKey | EditorsMessageKey | RangeMessageKey | FillMessageKey | ColumnsMessageKey | ColumnsChooserMessageKey | ColumnMenuMessageKey | PinnedMessageKey | PrintMessageKey | FreshMessageKey | AppMessageKey, params?: Readonly<Record<string, string | number>>): string;
  announce(text: string): void;
  readonly doc: Document;
  /** The application's `settings.context` (step 21): its own, beside `ctx`, the grid's language and zone. */
  readonly context?: unknown;
}

/**
 * A column's filter as a header part drives it (step 21, `filters()`): the same pending edit as the
 * floating box and the popup. One object while what it holds is the same: a new one when the
 * column's filter, its column or `dropped` changed (another write dropped this part's pending edit).
 */
export type HeaderFilter = Pick<SlotContext['floating'], 'kind' | 'state' | 'where' | 'debounceMs' | 'dropped' | 'set' | 'canOpen' | 'openFilter'>;

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
    /** The column's filter with `filters()` (step 21); null without it, for `filter: false` or an unknown kind. */
    readonly filter: HeaderFilter | null;
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
     * How many edits this part left pending were dropped by another write (another box or the
     * popup on the column, a host's filter on it, a clear of all filters): when it changes, the
     * part's own edit is gone and it shows `state` again.
     */
    readonly dropped: number;
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
    /** `filters({ apply })`: `'button'` keeps a draft in the browser too, sent at Apply or Enter, dropped on closing. */
    readonly apply?: 'button' | 'live' | undefined;
    readonly debounceMs: number;
    /** As the floating cell's: edits of this popup's that another write dropped. */
    readonly dropped: number;
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
  /**
   * One row of the set filter's value list (`filters()`, feedback pass C), named by the column's `filter.optionPart`. The
   * part paints the row's content; the grid keeps the row: `role=option`, `aria-selected`, its name (« label, count »),
   * the roving focus, the keys and the window (only the rows drawn have a part; one per row, updated, destroyed when the
   * row leaves the window or the popup closes). A click anywhere on the row toggles it: a control of the part's that
   * calls `toggle()` stops its click. The part paints the label area only (owner's look, app-feedback 11 and 17): the
   * grid keeps its box before it and its count after it. The part's host is `inert` (the row is the control, its name
   * the grid's): out of the name, and a control put in it takes no focus (review finding 4, WCAG 4.1.2); a click on it
   * lands on the row, which toggles.
   */
  filterOption: PartBase & {
    /** The value, or null for the blanks' row. */
    readonly value: string | null;
    /** The grid's label for it (the blanks' row: `filter.set.blanks`). */
    readonly label: string;
    /** How many rows have it, when known; `countText` in the grid's digits ('' when not shown). */
    readonly count: number | null;
    readonly countText: string;
    /** Ticked in the draft. */
    readonly selected: boolean;
    readonly blank: boolean;
    readonly column: ResolvedColumn<unknown>;
    /** Ticks or unticks it in the draft, as a click on the row. */
    toggle(): void;
  };
  /**
   * The content of one item of the column ⋮ menu (`@dzgrid/dom/column-menu`, Phase 6 step 12, owner Q12-2), named by the
   * item's `part`. The part paints the item's content (a swatch, an icon, the text styled); the grid keeps the item: its
   * role, `aria-checked`, `aria-disabled`, the roving focus, the keys, the type-ahead, and its name, the item's `label`
   * (`aria-label`): show that text too (WCAG 2.5.3). The part's host is `inert` and `aria-hidden`: a control put in it
   * takes no focus, nothing of it joins the name; a click on it is the item's. Mounted when the menu draws the item,
   * destroyed when it redraws or closes. A part that throws: the item's plain text.
   */
  menuItem: PartBase & {
    readonly id: string;
    readonly label: string;
    readonly kind: 'item' | 'radio' | 'check';
    readonly checked: boolean;
    readonly disabled: boolean;
    /** The column whose menu it is. */
    readonly column: ResolvedColumn<unknown>;
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
  /**
   * The application's editor of a cell (`@dzgrid/dom/editors`, Phase 5 step 6; editors.md 18–19): registered as a
   * part of slot `editor`, named by the column's `edit.editor`, or `editor.<type>` replacing that type's built-in.
   * Mounted in a host put in the cell (`data-dzg-owner="editor"`); its `focus()` takes the focus (false: the host).
   * Enter, Tab and Escape reaching the host not prevented: `read()` kept and moved, kept and next, given up.
   */
  editor: PartBase & {
    /** The cell's value as the column's codec reads it; null when blank. */
    readonly value: unknown;
    /** The text the grid shows for it. */
    readonly text: string;
    readonly row: Readonly<unknown>;
    readonly key: RowKey;
    readonly column: ResolvedColumn<unknown>;
    /** What opened it; `char`, the character typed when a key did. */
    readonly start: 'f2' | 'enter' | 'key' | 'dblclick' | 'tap' | 'tab';
    readonly char?: string;
    /** Through the column's checks and the save: true, closed and moved as Enter; false, refused (the bubble and the sentence), still open. */
    keep(input: CellInput): boolean;
    /** Gives the edit up (as Escape). */
    cancel(): void;
    /** The part's own refusal: `validation.<code>` (or the app's `app.*`), the bubble, the blink, one sentence; still open. */
    refuse(code: string): void;
    /** A node of the part's outside the cell (its own popup) counts as inside: focus there is no blur. Returns its disposer. */
    own(el: HTMLElement): () => void;
  };
  /**
   * A master's detail panel (`@dzgrid/dom/detail`, Phase 4 step 10), mounted in the detail row's one cell
   * (`RowView.slot`); the base destroys it when the row leaves the window or the grid ends.
   */
  detail: PartBase & {
    /** The master's row. */
    readonly row: Readonly<unknown>;
    /** The detail row's key (`x:` + the master's). */
    readonly key: RowKey;
    readonly master: RowKey;
    /** The panel's height in px, as the row layout places it. */
    readonly height: number;
    /** The depth a grid made in this panel has: this grid's + 1 (1: a grid on the page). Past 3, a problem (owner Q5). Given by `detail()`. */
    readonly depth?: number;
    /** Puts the focus back on this panel's cell, as Escape from a control inside does (a nested grid's Escape). Given by `detail()`. */
    leave?(): void;
  };
}

/** What an editor keeps: text typed (read by the column's codec) or a value picked. */
export type CellInput = { readonly text: string } | { readonly value: unknown };
/** An editor part's handle (slot `editor`): `read()`, what Enter, Tab and a blur keep (none: nothing kept). */
export interface EditorHandle extends PartHandle<SlotContext['editor']> {
  read?(): CellInput | undefined;
}

export type WiredSlot = keyof SlotContext;

/** A part for a slot, registered by name in `settings.parts`. */
export interface SlotPart<S extends WiredSlot = WiredSlot> {
  readonly slot: S;
  readonly part: Part<SlotContext[S]>;
}

export function definePart<S extends WiredSlot>(slot: S, part: S extends 'editor' ? { mount(host: HTMLElement, c: SlotContext['editor']): EditorHandle } : Part<SlotContext[S]>): SlotPart<S> {
  return { slot, part: part as Part<SlotContext[S]> };
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
const NEEDS: Partial<Record<WiredSlot, string>> = { header: 'slots', overlay: 'slots', tooltip: 'slots', floating: 'filters', filter: 'filters', filterOption: 'filters', footer: 'pagination', detail: 'detail', editor: 'editors' };
/** A column's `ui` keys (feedback pass D: any other is said). */
const UI = ['cell', 'header', 'tooltip', 'cellClass', 'headerClass', 'data'];
const leaves = (t: readonly ColumnOrGroup<unknown>[]): ColumnDef<unknown>[] => t.flatMap((d) => (d && 'children' in d ? leaves(d.children) : [d]));

/**
 * Parts whose slot needs a feature the grid lacks, columns asking for a filter UI without
 * `filters()` (`columns[i].filter`, i over the leaves), a column's header or tooltip part without `slots()`
 * (`columns[i].ui.header`; `header.filterBox` also without `filters()`), and paged rows without `pagination()`
 * (`settings.pagination`, step 17): told once, a warning each, the detail naming the feature.
 */
export function unslotted(s: GridSettings<unknown>, paged: unknown): Problem[] {
  const has = new Set(s.features?.map((f) => f.id));
  const missing = (path: string, detail?: string, severity: Problem['severity'] = 'warning'): Problem[] => (detail && !has.has(detail) ? [{ code: 'missing-feature', severity, path, detail }] : []);
  return [
    ...Object.keys(s.parts ?? {}).flatMap((n) => missing(`parts.${n}`, NEEDS[s.parts![n]!.slot as WiredSlot])),
    ...(paged ? missing('settings.pagination', 'pagination') : []),
    // A selection rule without its feature (step 21): an error, the grid selects nothing (fail closed).
    ...(s.selection?.canSelect ? missing('settings.selection.canSelect', 'rules', 'error') : []),
    ...leaves(s.columns).flatMap((d, i) => [
      ...(d?.filter && (d.filter.floating || d.filter.kind) ? missing(`columns[${i}].filter`, 'filters') : []),
      ...Object.keys(d?.ui ?? {}).flatMap((k): Problem[] => {
        const at = `columns[${i}].ui.${k}`;
        const v = d!.ui![k as 'header'];
        // A header or tooltip part named by the column (feedback pass E): `slots()` draws them; `header.filterBox` is
        // `filters()`'. An app's own key (feedback pass D): said, its data belongs in `ui.data`.
        return UI.includes(k) ? (v && (k === 'header' || k === 'tooltip') ? [...missing(at, 'slots'), ...(v === 'header.filterBox' ? missing(at, 'filters') : [])] : []) : [{ code: 'unknown-ui-key', severity: 'warning', path: at, detail: k }];
      }),
    ]),
  ];
}

export type { PartSlot };
