import type { InstantFormatSpec, NumberFormatSpec } from '../i18n/format.js';
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
  readonly sortable?: boolean;
  readonly filter?: false;
  readonly pinned?: Side | null;
  readonly hidden?: boolean;
  readonly align?: 'start' | 'center' | 'end';
  /** Shown over the header, already translated by the host. */
  readonly headerTooltip?: string;
  /** Shown over a cell, already translated; null for none. The grid never guesses one from the content. */
  readonly tooltip?: (value: V | null, row: Readonly<T>) => string | null;
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
 * or a missing codec drops the column.
 */
export function resolveColumns<T>(defs: readonly ColumnDef<T, any>[]): {
  readonly columns: readonly ResolvedColumn<T>[];
  readonly problems: readonly Problem[];
} {
  const columns: ResolvedColumn<T>[] = [];
  const problems: Problem[] = [];
  const seen = new Set<string>();
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
    seen.add(def.id);
    columns.push({ id: def.id, def, type, codec, read, sortable: def.sortable !== false, filterable: def.filter !== false });
  });
  // More than six pinned on a side leave little room to scroll the rest: accepted, with a warning (D14).
  for (const side of ['start', 'end'] as const) {
    const n = defs.filter((d) => d.pinned === side).length;
    if (n > 6) problems.push(problem('too-many-pinned', 'warning', 'columns', `${side}:${n}`));
  }
  return { columns, problems };
}
