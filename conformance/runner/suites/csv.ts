import { clientRows, createColumnModel, createKernel, dataKey, groupKey, localeCtx, type ColumnDef, type FooterNode, type GroupNode } from '@dzgrid/core';
import { groupShape } from '@dzgrid/core/grouping';
import { columnOf, FNS } from './group-agg.js';
import { csvChunks, csvRows } from '@dzgrid/core/csv';
import { treeShape } from '@dzgrid/core/tree';
import type { Suite } from './index.js';

type Row = Record<string, unknown> & { id: string };

/** A case's rows in a client model, the file of its displayed rows: the text and the summary. */
function runCsv(input: any) {
  const ctx = localeCtx({ locale: input.locale, ...(input.timeZone && { timeZone: input.timeZone }), ...(input.numerals && { numerals: input.numerals }) });
  // `aggFunc: { fn }`: an application's function from the group-agg fixture table.
  const columns = createColumnModel<Row>((input.columns as ColumnDef<Row>[]).map(columnOf));
  // A tree (step 5): rows with a `path`, opened as `expand` says, written for `scope`, after `select`.
  // Grouped (Phase 7 step 7): `grouping` the shape's options, `open` group keys' segments written by hand.
  // The grouping's `aggFuncs` (`{ fn }` from the fixture table), handed to the file too: they win over the columns'.
  const aggFuncs = input.grouping?.aggFuncs && Object.fromEntries(Object.entries(input.grouping.aggFuncs).map(([k, v]: [string, any]) => [k, v?.fn ? FNS[v.fn]! : v]));
  const shape = input.tree ? treeShape<Row>({ path: (r) => r['path'] as string[] }) : input.grouping ? groupShape<Row>({ ...input.grouping, ...(aggFuncs && { aggFuncs }) }) : undefined;
  const model = clientRows<Row>({ rows: input.rows.map((r: object, i: number) => ({ id: `r${i}`, ...r })), getRowId: (r) => r.id, columns, ctx, ...(shape && { shape }) });
  const kernel = createKernel<Row>({ rows: model, columns });
  if (input.expand) kernel.dispatch({ type: 'rows.expand', rows: input.expand.map((id: string) => dataKey(id)!), expanded: true }, 'user');
  if (input.open) kernel.dispatch({ type: 'rows.expand', rows: input.open.map((p: string[]) => groupKey(p)), expanded: true }, 'user');
  if (input.select) kernel.dispatch({ type: 'selection.set', selection: { mode: input.select.mode, keys: new Set(input.select.ids.map((id: string) => dataKey(id)!)) } }, 'user');
  const held = csvRows(model, input.scope ?? 'displayed', kernel.selection)!;
  const it = csvChunks({ rows: held.rows, at: held.at, columns, ctx, ...(input.labels && { groupLabel }), ...(aggFuncs && { aggFuncs }) }, input.options);
  let text = '';
  let r = it.next();
  while (!r.done) {
    text += r.value;
    r = it.next();
  }
  return { text, summary: r.value };
}

/** The grid's labels as `@dzgrid/dom/grouping` writes them in English (`labels: true`): a fixture, the same everywhere. */
export const groupLabel = (n: GroupNode | FooterNode): string =>
  n.kind === 'group' ? `${n.label || '(Blank)'} (${n.count})` : n.group === null ? 'Total' : `Total ${n.label || '(Blank)'}`;

export const csv: Record<string, Suite> = { csv: runCsv };
