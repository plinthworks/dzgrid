import { createColumnModel, isSelected, localeCtx, NO_OVERLAY, parseInstant, type ColumnDef, type RowKey, type SelectionState } from '@dzgrid/core';
import { createRowStore, ColumnCache } from '@dzgrid/core/internal';

type Row = Record<string, unknown> & { id: string };

/** A store, columns and a cache for a case: the pieces the client pipeline wires together. */
/**
 * A case's clock as milliseconds: an ISO UTC instant, a number of milliseconds
 * (a year past the ones a Day can write), or "NaN", "Infinity", "-Infinity" (a
 * host clock gone wrong, which JSON cannot write as a number). Absent: no clock.
 */
export function clockOf(now: string | number | undefined): number | undefined {
  if (now === undefined || typeof now === 'number') return now;
  if (now === 'NaN' || now === 'Infinity' || now === '-Infinity') return Number(now);
  const t = parseInstant(now);
  if (t === null) throw new Error(`bad clock ${now}`);
  return t;
}

/** `now`: the case's clock (clockOf); absent, no clock. */
export function harness(input: { locale: string; timeZone?: string; now?: string | number; columns: ColumnDef<Row>[]; rows: Row[] }) {
  const store = createRowStore<Row>((r) => r.id);
  store.replaceAll(input.rows);
  const columns = createColumnModel<Row>(input.columns);
  const ctx = localeCtx({ locale: input.locale, ...(input.timeZone && { timeZone: input.timeZone }) });
  const cache = new ColumnCache<Row>();
  const now = clockOf(input.now);
  return { store, columns, ctx, cache, env: () => ({ source: store.snapshot, columns, ctx, reader: NO_OVERLAY, cache, ...(now !== undefined && { now }) }) };
}

/**
 * A selection rule written as data (step 21, `selection-rules` cases): a row is refused when its id
 * is in `refuse`; when it conflicts with a row already in the selection (`conflicts`, pairs either
 * way); when the selection already holds `max` rows (an include set); or when the selection holds a
 * row of another `groups` value. Refused: `reason` when given (the sentence), false otherwise.
 */
export interface RuleSpec {
  readonly refuse?: readonly string[];
  readonly conflicts?: readonly (readonly [string, string])[];
  readonly max?: number;
  readonly groups?: Readonly<Record<string, string>>;
  readonly reason?: string;
}

export function ruleOf(spec: RuleSpec, keyOf: (id: string) => RowKey, idOf: (key: RowKey) => string) {
  return (row: { readonly data: { readonly id: string } }, s: SelectionState): boolean | string => {
    const id = row.data.id;
    const has = (other: string) => isSelected(s, keyOf(other));
    const no =
      spec.refuse?.includes(id) ||
      spec.conflicts?.some(([a, b]) => (a === id && has(b)) || (b === id && has(a))) ||
      (spec.max !== undefined && s.mode === 'include' && s.keys.size >= spec.max) ||
      (spec.groups !== undefined && s.mode === 'include' && [...s.keys].some((k) => spec.groups![idOf(k)] !== spec.groups![id]));
    return no ? spec.reason ?? false : true;
  };
}
