import { filterKindOf, partNameFor, problem, type PartColumn, type ResolvedColumn } from '@dzgrid/core';
import { emit, filterKindLookup } from '@dzgrid/core/internal';
import type { GridContext } from '../context.js';
import type { Part } from '../part.js';

export const BUILT_IN: ReadonlySet<string> = new Set(['text', 'number', 'day', 'instant', 'boolean', 'set']);

export interface Resolved {
  readonly part: Part<any> | null;
  readonly kind: string;
  /** The column can filter here with this slot's switches (part or not): what a header part drives (step 21). */
  readonly ok: boolean;
}
/** The part a column gets in the floating row (`floating`) or its popup (`filter`). */
export type Resolve = (col: ResolvedColumn<unknown>, slot: 'floating' | 'filter') => Resolved;

/**
 * Which part draws a column's filter, from the registry: `floating.<kind>` then the bare
 * `floating` (the summary) in the floating row; `filter.<kind>` alone in the popup. None when the
 * column says `filter: false`, when the floating row is off for it (`filter.floating`, `filters({ floating })`),
 * or when a custom kind cannot filter where the rows are (no browser rule under the client).
 * `strict`: a part given only to a column naming its kind (the built-in `filter.set`, step 15).
 * An unknown kind the column names is said once per registry. Cached per columns' version.
 */
export function resolver(g: GridContext<unknown>, o: { readonly floating?: boolean }, strict?: object): Resolve {
  const kinds = filterKindLookup(g.settings.filterKinds);
  let reg: unknown = null;
  let version = -1;
  let by = new Map<string, Resolved>();
  let told = new Set<string>();
  return (col, slot) => {
    const now = g.parts();
    if (reg !== now || version !== g.columns.version) {
      if (reg !== now) told = new Set();
      reg = now;
      version = g.columns.version;
      by = new Map();
    }
    const id = slot + col.id;
    let r = by.get(id);
    if (r) return r;
    const f = col.def.filter;
    const pc: PartColumn = { id: col.id, type: col.type, ...(f && { filter: f }) };
    const kind = filterKindOf(pc);
    // The popup's own switch (`filters({ popup })`) is the menu's.
    let ok = f !== false && (slot === 'filter' || (f?.floating ?? o.floating === true));
    if (ok && !BUILT_IN.has(kind)) {
      const k = kinds.get(kind);
      const path = `columns.${col.id}.filter.kind`;
      // An unknown kind the column names is said once per registry; a custom type without one is silent.
      if (!k && f && f.kind && !told.has(path)) told.add(path), emit(g.kernel, { type: 'problems', source: 'host', problems: [problem('invalid-filter', 'error', path, 'unknown kind')] });
      // A kind without its browser rule cannot filter there: no part.
      ok = !!k && (!!k.test || g.rows.ops.filter !== 'client');
    }
    const name = ok ? (partNameFor(slot, pc, new Set(Object.keys(now).filter((n) => now[n]!.slot === slot))).name ?? (slot === 'floating' && now['floating']?.slot === 'floating' ? 'floating' : null)) : null;
    const part = name ? now[name]!.part : null;
    // The built-in set list only for a column that asks for it (owner decision Q2): an enum
    // column, set implicitly, keeps no popup; a host's own `filter.set` still serves it.
    by.set(id, (r = { part: part === strict && (f && f.kind) !== 'set' ? null : part, kind, ok }));
    return r;
  };
}
