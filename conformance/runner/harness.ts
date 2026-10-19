import { createColumnModel, localeCtx, NO_OVERLAY, parseInstant, type ColumnDef } from '@dzgrid/core';
import { createRowStore, ColumnCache } from '@dzgrid/core/internal';

type Row = Record<string, unknown> & { id: string };

/** A store, columns and a cache for a case: the pieces the client pipeline wires together. */
/** `now`: the case's clock (ISO UTC), read as milliseconds; absent, no clock. */
export function harness(input: { locale: string; timeZone?: string; now?: string; columns: ColumnDef<Row>[]; rows: Row[] }) {
  const store = createRowStore<Row>((r) => r.id);
  store.replaceAll(input.rows);
  const columns = createColumnModel<Row>(input.columns);
  const ctx = localeCtx({ locale: input.locale, ...(input.timeZone && { timeZone: input.timeZone }) });
  const cache = new ColumnCache<Row>();
  const now = input.now === undefined ? undefined : parseInstant(input.now)!;
  return { store, columns, ctx, cache, env: () => ({ source: store.snapshot, columns, ctx, reader: NO_OVERLAY, cache, ...(now !== undefined && { now }) }) };
}
