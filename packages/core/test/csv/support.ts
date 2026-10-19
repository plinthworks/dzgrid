import { clientRows, createColumnModel, localeCtx, type ColumnOrGroup, type LocaleCtx } from '@dzgrid/core';
import { toCsv, type CsvOptions } from '@dzgrid/core/csv';

export type Row = Record<string, unknown> & { id: string };

export const EN = localeCtx({ locale: 'en-US', timeZone: 'Africa/Algiers' });
export const FR = localeCtx({ locale: 'fr-FR', timeZone: 'Africa/Algiers' });
export const AR = localeCtx({ locale: 'ar-DZ', timeZone: 'Africa/Algiers' });

/** Invisible characters by code point, so the sources stay readable. */
export const ch = (cp: number): string => String.fromCodePoint(cp);
export const BOM = ch(0xfeff);
export const LRM = ch(0x200e);
export const RLM = ch(0x200f);
export const ALM = ch(0x061c);
export const NBSP = ch(0xa0);

/** A client model over rows given as objects (`id` added from the position when absent). */
export function grid(defs: readonly ColumnOrGroup<Row>[], rows: readonly Record<string, unknown>[], ctx: LocaleCtx = EN, page?: { pageSize: number }) {
  const columns = createColumnModel<Row>(defs);
  const data = rows.map((r, i) => ({ id: `r${i}`, ...r }) as Row);
  const model = clientRows<Row>({ rows: data, getRowId: (r) => r.id, columns, ctx, ...(page && { page }) });
  return { columns, model, ctx };
}

/** The file for the displayed rows, BOM off unless asked. */
export function csv(defs: readonly ColumnOrGroup<Row>[], rows: readonly Record<string, unknown>[], o: CsvOptions = {}, ctx: LocaleCtx = EN): string {
  const g = grid(defs, rows, ctx);
  return toCsv({ rows: g.model.displayed, columns: g.columns, ctx }, { bom: false, ...o });
}
