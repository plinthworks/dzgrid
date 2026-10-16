import { createColumnModel, createRowStore, localeCtx, NO_OVERLAY, ColumnCache, type ColumnDef } from '@dzgrid/core';

type Row = Record<string, unknown> & { id: string };

/** A store, columns and a cache for a case: the pieces the client pipeline wires together. */
export function harness(input: { locale: string; timeZone?: string; columns: ColumnDef<Row>[]; rows: Row[] }) {
  const store = createRowStore<Row>((r) => r.id);
  store.replaceAll(input.rows);
  const columns = createColumnModel<Row>(input.columns);
  const ctx = localeCtx({ locale: input.locale, ...(input.timeZone && { timeZone: input.timeZone }) });
  const cache = new ColumnCache<Row>();
  return { store, columns, ctx, cache, env: () => ({ source: store.snapshot, columns, ctx, reader: NO_OVERLAY, cache }) };
}
