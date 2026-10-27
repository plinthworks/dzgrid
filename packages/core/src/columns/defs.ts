import type { InstantFormatSpec, NumberFormatSpec } from '../i18n/format.js';
import type { RowKey } from '../ids.js';
import { problem, type Problem } from '../problems.js';
import type { ColumnType, ValueCodec } from '../value/codec.js';
import { booleanCodec } from '../value/codecs/boolean.js';
import { dayCodec } from '../value/codecs/day.js';
import { enumCodec, type EnumOption } from '../value/codecs/enum.js';
import { instantCodec } from '../value/codecs/instant.js';
import { numberCodecWith } from '../value/codecs/number.js';
import { textCodec } from '../value/codecs/text.js';
import { isKnownZone } from '../value/zone-day.js';

/** A side of the grid, logically: in right-to-left the start is on the right. Never left or right. */
export type Side = 'start' | 'end';

export interface ColumnDef<T, V = unknown> {
  /** Required and stable: the key of the column's state. */
  readonly id: string;
  /** A path into the row (`a.b.c`); defaults to the id when no `value` is given. */
  readonly field?: string;
  readonly value?: (row: Readonly<T>) => V;
  /** Already translated by the host. */
  readonly header?: string;
  readonly type?: ColumnType;
  readonly codec?: ValueCodec<V>;
  readonly enumOptions?: readonly EnumOption[];
  readonly assumeZone?: string;
  readonly numberFormat?: NumberFormatSpec;
  readonly instantFormat?: InstantFormatSpec;
  readonly width?: number;
  readonly minWidth?: number;
  readonly maxWidth?: number;
  readonly flex?: number;
  readonly resizable?: boolean;
  readonly movable?: boolean;
  /** `false`: the column menu's « Hide » is disabled for it (Phase 6 step 3, column-menu.md 13). */
  readonly hideable?: false;
  /** `false`: no column menu (no ⋮, no right-click menu; its keys left to the page). Phase 6 step 3. */
  readonly menu?: false;
  /** `false`: left out of the column chooser's list (still hideable by the menu). Phase 6 step 4, columns-chooser.md 6. */
  readonly chooser?: false;
  readonly sortable?: boolean;
  /**
   * `false`: not filterable. `kind`: the filter kind whose UI the column shows (a built-in or a
   * custom kind's name). `floating`: a box in the floating filter row (`@dzgrid/dom/filters`; the
   * grid's `filters({ floating })` otherwise, `false` keeps this column out). `debounceMs`: the
   * pause before what is typed there applies (150 in the browser, 300 on a server by default).
   * `ops`: the operators its popup offers, in this order (the kind's own list when absent).
   */
  readonly filter?: false | { readonly kind?: string; readonly floating?: boolean; readonly debounceMs?: number; readonly ops?: readonly string[] };
  readonly pinned?: Side | null;
  readonly hidden?: boolean;
  readonly align?: 'start' | 'center' | 'end';
  /**
   * Parts by name for this column (a cell renderer, a header, a tooltip): plain names, resolved by the grid's registry.
   * `cellClass` (step 26, docs/behaviors/cell-class.md): classes for a body cell from its data, space-separated (null: none).
   * `headerClass` (showcase themes step 6): classes for the column's header cell, space-separated.
   */
  readonly ui?: { readonly cell?: string; readonly header?: string; readonly tooltip?: string; readonly cellClass?: (c: CellClassContext<T, V>) => string | null | undefined; readonly headerClass?: string };
  /** Shown over the header, already translated by the host. */
  readonly headerTooltip?: string;
  /** Shown over a cell, already translated; null for none. The grid never guesses one from the content. */
  /** `context`: the grid's `settings.context` (step 21). */
  readonly tooltip?: (value: V | null, row: Readonly<T>, context: unknown) => string | null;
  /**
   * Consecutive rows with the same value show one tall cell (docs/behaviors/spans.md).
   * `true` compares the values' stable text; a function decides; `within` cuts a run
   * where the listed columns change. Needs the spans feature; the base ignores it.
   */
  readonly merge?: true | ((a: SpanCtx<T>, b: SpanCtx<T>) => boolean) | { readonly same?: (a: SpanCtx<T>, b: SpanCtx<T>) => boolean; readonly within?: readonly string[] };
  /** How many rows this cell covers, from the data (1 when absent). Needs the spans feature. */
  readonly rowSpan?: (ctx: SpanCtx<T>) => number;
  /** How many columns this cell covers, from the data (1 when absent). Needs the spans feature. */
  readonly colSpan?: (ctx: SpanCtx<T>) => number;
  /**
   * Under a collapsible group (header-groups.md 1): shown only while it is open (`'open'`) or closed (`'closed'`);
   * absent, in both. Ignored under a group that does not open and close.
   */
  readonly groupShow?: 'open' | 'closed';
  /** `'text'`: in a CSV file, a digits-only value is written `="0123"` so Excel keeps it as text (csv-export.md). */
  readonly csv?: 'text';
  /**
   * Whether a data row's cell can be edited (editing.md 1): `true`, or a rule told the row and the
   * grid's `settings.context`; only `true` means yes. Never a detail, filler or loading row.
   */
  readonly editable?: EditableRule<T>;
  /**
   * A refusal code (`validation.<code>` in the DOM's messages) or null: run by `@dzgrid/core/edit`
   * after the column's `edit` checks (edit-validation.md 1). Synchronous only (owner S3-O1).
   */
  readonly validate?: (value: V | null, row: Readonly<T>, context: unknown) => string | null | undefined;
  /** The simple checks of a kept value (owner S3-O3), run by `@dzgrid/core/edit`; the base reads none of it. */
  readonly edit?: EditChecks<T, V>;
}

/**
 * A column's edit rules (edit-validation.md 1, owner S3-O3), checked in this order after the codec:
 * `required` (an empty value), `min` / `max` (compared by the column's codec: a number, a `Day`, an
 * instant), `pattern` (string values, the whole value; `g`, `y` and `m` dropped, `i`, `u`, `s` kept;
 * developer config: a regex that backtracks badly is the app's to avoid), `options` (a list,
 * or one told the row and the app's context; the cell's current value always passes). `maxLength` and
 * `editor` are the DOM's (steps 5–6). A bad rule is a warning `invalid-column` at
 * `columns.<id>.edit.<key>`, and that rule is ignored.
 */
export interface EditChecks<T, V = unknown> {
  readonly required?: boolean;
  readonly min?: V;
  readonly max?: V;
  readonly pattern?: string | RegExp;
  readonly options?: readonly EnumOption[] | ((row: Readonly<T>, context: unknown) => readonly EnumOption[]);
  readonly maxLength?: number;
  readonly editor?: string;
}

/** A column's `editable`: yes, no, or a rule over the row and the application's context. */
export type EditableRule<T> = boolean | ((row: Readonly<T>, context: unknown) => boolean);

/** What `ui.cellClass` is told about one body cell: its coerced value, displayed text, row, key, column id, `settings.context`. */
export interface CellClassContext<T, V = unknown> {
  readonly value: V | null;
  readonly text: string;
  readonly row: Readonly<T>;
  readonly key: RowKey;
  readonly column: string;
  readonly context: unknown;
}

/**
 * What a span rule is told about one cell. One object reused from call to
 * call: valid during the call only.
 */
export interface SpanCtx<T> {
  readonly row: Readonly<T>;
  /** The cell's raw value. */
  readonly value: unknown;
  readonly key: RowKey;
  /** The row's position in the displayed rows. */
  readonly index: number;
  readonly column: string;
  /** The rows displayed before and after it (null at the ends). */
  readonly prev: Readonly<T> | null;
  readonly next: Readonly<T> | null;
}

/** Columns under one header (docs/behaviors/spans.md): the base keeps only its leaves. */
export interface ColumnGroupDef<T> {
  readonly id: string;
  /** Already translated by the host. */
  readonly header?: string;
  readonly children: readonly ColumnOrGroup<T>[];
  /** Opens and closes (header-groups.md 1; needs the spans feature): a button in its header, Enter or Space on it. */
  readonly collapsible?: boolean;
  /** A collapsible group's state when the grid starts (default true: open). */
  readonly open?: boolean;
}

export type ColumnOrGroup<T> = ColumnDef<T, any> | ColumnGroupDef<T>;

/**
 * The columns of a tree of groups, in order: a group (anything with a
 * `children` array) gives its leaves, and nothing else of it is kept.
 */
export function leaves<T>(defs: readonly ColumnOrGroup<T>[]): ColumnDef<T, any>[] {
  return defs.flatMap((d) => (d && Array.isArray((d as ColumnGroupDef<T>).children) ? leaves((d as ColumnGroupDef<T>).children) : [d as ColumnDef<T, any>]));
}

export interface ResolvedColumn<T> {
  readonly id: string;
  readonly def: ColumnDef<T, any>;
  readonly type: ColumnType;
  readonly codec: ValueCodec<any>;
  /** The raw cell value from the host's row; the codec reads it with `coerce`. */
  readonly read: (row: Readonly<T>) => unknown;
  readonly sortable: boolean;
  readonly filterable: boolean;
}

/**
 * The seam where the edit overlay plugs in (Phase 4): sorting, filtering and
 * display read cell values through it, so an edit shows everywhere before the
 * host saves it. Phase 1 has none.
 */
export interface ValueReader<T> {
  readonly version: number;
  readonly overlay: boolean;
  value(col: ResolvedColumn<T>, row: Readonly<T>, id: string): unknown;
}

export const NO_OVERLAY: ValueReader<never> = {
  version: 0,
  overlay: false,
  value: (col, row) => col.read(row),
};

const FORBIDDEN_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);
const COLUMN_TYPES: ReadonlySet<string> = new Set(['text', 'number', 'day', 'instant', 'boolean', 'enum', 'custom']);

/**
 * A reader for `a.b.c`, or null for an empty path, an empty segment or a
 * prototype key. Own properties only: a row that is a class instance with
 * getters needs a `value` function instead.
 */
export function compilePath(path: string): ((row: unknown) => unknown) | null {
  if (typeof path !== 'string' || path === '') return null;
  const segs = path.split('.');
  if (segs.some((s) => s === '' || FORBIDDEN_SEGMENTS.has(s))) return null;
  if (segs.length === 1) {
    const k = segs[0]!;
    return (row) => (row == null ? undefined : Object.hasOwn(row as object, k) ? (row as Record<string, unknown>)[k] : undefined);
  }
  return (row) => {
    let v: unknown = row;
    for (const k of segs) {
      if (v == null || typeof v !== 'object' || !Object.hasOwn(v, k)) return undefined;
      v = (v as Record<string, unknown>)[k];
    }
    return v;
  };
}

function codecFor<T>(def: ColumnDef<T, any>, type: ColumnType): ValueCodec<any> | 'needs-codec' | 'needs-options' {
  if (def.codec) return def.codec;
  switch (type) {
    case 'text': return textCodec;
    case 'number': return numberCodecWith(def.numberFormat ?? {});
    case 'boolean': return booleanCodec;
    case 'day': return dayCodec;
    case 'instant': return instantCodec({ ...(def.assumeZone !== undefined && { assumeZone: def.assumeZone }), ...(def.instantFormat && { format: def.instantFormat }) });
    case 'enum': return def.enumOptions ? enumCodec(def.enumOptions) : 'needs-options';
    case 'custom': return 'needs-codec';
  }
}

/**
 * Checks the host's definitions. A column that cannot work is refused with a
 * problem, the others go on: a duplicate id keeps the first column, a bad path
 * or a missing codec drops the column. Groups give their leaves (`leaves`);
 * a problem's path counts the leaves.
 */
export function resolveColumns<T>(tree: readonly ColumnOrGroup<T>[]): {
  readonly columns: readonly ResolvedColumn<T>[];
  readonly problems: readonly Problem[];
} {
  const columns: ResolvedColumn<T>[] = [];
  const problems: Problem[] = [];
  const seen = new Set<string>();
  const defs = leaves(tree);
  defs.forEach((def, i) => {
    const at = `columns[${i}]`;
    if (!def || typeof def.id !== 'string' || def.id === '') return void problems.push(problem('invalid-column', 'error', at, 'id'));
    if (seen.has(def.id)) return void problems.push(problem('duplicate-column-id', 'error', at));
    const badSize = (['width', 'minWidth', 'maxWidth', 'flex'] as const).find((k) => def[k] !== undefined && !(typeof def[k] === 'number' && Number.isFinite(def[k]) && def[k]! >= 0));
    if (badSize) return void problems.push(problem('invalid-column', 'error', `${at}.${badSize}`));
    if (def.pinned !== undefined && def.pinned !== null && def.pinned !== 'start' && def.pinned !== 'end') {
      return void problems.push(problem('invalid-column', 'error', `${at}.pinned`));
    }
    if (def.type !== undefined && !COLUMN_TYPES.has(def.type)) return void problems.push(problem('invalid-column', 'error', `${at}.type`));
    if (def.assumeZone !== undefined && !isKnownZone(def.assumeZone)) return void problems.push(problem('unknown-zone', 'error', `${at}.assumeZone`));
    const type = def.type ?? 'text';
    const codec = codecFor(def, type);
    if (typeof codec === 'string') return void problems.push(problem('invalid-column', 'error', at, codec));
    let read: (row: Readonly<T>) => unknown;
    if (def.value) read = def.value;
    else {
      const path = compilePath(def.field ?? def.id);
      if (!path) return void problems.push(problem('invalid-field-path', 'error', `${at}.field`));
      read = path as (row: Readonly<T>) => unknown;
    }
    // A wrong `editable`: told, the column kept, read-only (editableAt wants `true`). A wrong `validate` is
    // told by `@dzgrid/core/edit`, which runs it (Phase 5 step 3).
    if (def.editable !== undefined && typeof def.editable !== 'boolean' && typeof def.editable !== 'function') problems.push(problem('invalid-column', 'warning', `${at}.editable`));
    seen.add(def.id);
    columns.push({ id: def.id, def, type, codec, read, sortable: def.sortable !== false, filterable: def.filter !== false });
  });
  // More than six pinned on a side leave little room to scroll the rest: accepted, with a warning (D14).
  for (const side of ['start', 'end'] as const) {
    const n = defs.filter((d) => d?.pinned === side).length;
    if (n > 6) problems.push(problem('too-many-pinned', 'warning', 'columns', `${side}:${n}`));
  }
  return { columns, problems };
}
