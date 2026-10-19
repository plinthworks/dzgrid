import { clientRows, createColumnModel, localeCtx, type ColumnDef } from '@dzgrid/core';
import { csvChunks } from '@dzgrid/core/csv';
import type { Suite } from './index.js';

type Row = Record<string, unknown> & { id: string };

/** A case's rows in a client model, the file of its displayed rows: the text and the summary. */
function runCsv(input: any) {
  const ctx = localeCtx({ locale: input.locale, ...(input.timeZone && { timeZone: input.timeZone }), ...(input.numerals && { numerals: input.numerals }) });
  const columns = createColumnModel<Row>(input.columns as ColumnDef<Row>[]);
  const model = clientRows<Row>({ rows: input.rows.map((r: object, i: number) => ({ id: `r${i}`, ...r })), getRowId: (r) => r.id, columns, ctx });
  const it = csvChunks({ rows: model.displayed, columns, ctx }, input.options);
  let text = '';
  let r = it.next();
  while (!r.done) {
    text += r.value;
    r = it.next();
  }
  return { text, summary: r.value };
}

export const csv: Record<string, Suite> = { csv: runCsv };
