import { clientRows, createColumnModel, createKernel, dataKey, localeCtx, type ColumnDef } from '@dzgrid/core';
import { csvChunks, csvRows } from '@dzgrid/core/csv';
import { treeShape } from '@dzgrid/core/tree';
import type { Suite } from './index.js';

type Row = Record<string, unknown> & { id: string };

/** A case's rows in a client model, the file of its displayed rows: the text and the summary. */
function runCsv(input: any) {
  const ctx = localeCtx({ locale: input.locale, ...(input.timeZone && { timeZone: input.timeZone }), ...(input.numerals && { numerals: input.numerals }) });
  const columns = createColumnModel<Row>(input.columns as ColumnDef<Row>[]);
  // A tree (step 5): rows with a `path`, opened as `expand` says, written for `scope`, after `select`.
  const shape = input.tree ? treeShape<Row>({ path: (r) => r['path'] as string[] }) : undefined;
  const model = clientRows<Row>({ rows: input.rows.map((r: object, i: number) => ({ id: `r${i}`, ...r })), getRowId: (r) => r.id, columns, ctx, ...(shape && { shape }) });
  const kernel = createKernel<Row>({ rows: model, columns });
  if (input.expand) kernel.dispatch({ type: 'rows.expand', rows: input.expand.map((id: string) => dataKey(id)!), expanded: true }, 'user');
  if (input.select) kernel.dispatch({ type: 'selection.set', selection: { mode: input.select.mode, keys: new Set(input.select.ids.map((id: string) => dataKey(id)!)) } }, 'user');
  const held = csvRows(model, input.scope ?? 'displayed', kernel.selection)!;
  const it = csvChunks({ rows: held.rows, at: held.at, columns, ctx }, input.options);
  let text = '';
  let r = it.next();
  while (!r.done) {
    text += r.value;
    r = it.next();
  }
  return { text, summary: r.value };
}

export const csv: Record<string, Suite> = { csv: runCsv };
