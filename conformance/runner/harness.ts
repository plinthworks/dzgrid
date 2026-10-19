import { createColumnModel, localeCtx, NO_OVERLAY, parseInstant, type ColumnDef } from '@dzgrid/core';
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
