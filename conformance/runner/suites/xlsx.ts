import { deflateRawSync } from 'node:zlib';
import { clientRows, createColumnModel, createKernel, dataKey, groupKey, localeCtx, type ColumnDef } from '@dzgrid/core';
import { groupShape } from '@dzgrid/core/grouping';
import { groupLabel } from './csv.js';
import { csvRows } from '@dzgrid/core/csv';
import { buildSpanMap } from '@dzgrid/core/spans';
import { treeShape } from '@dzgrid/core/tree';
import { toXlsx } from '@dzgrid/core/xlsx';
import { joinParts, readXlsx } from '../xlsx-read.js';
import type { Suite } from './index.js';

type Row = Record<string, unknown> & { id: string };

/** `{ "$repeat": ["a", 32768] }` in a case's row: the text repeated (a long cell stays readable in JSON). */
const expand = (r: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(r).map(([k, v]) => [k, (v as { $repeat?: [string, number] })?.$repeat ? (v as { $repeat: [string, number] }).$repeat[0].repeat((v as { $repeat: [string, number] }).$repeat[1]) : v]));

/**
 * A case's rows in a client model, written as an .xlsx by `@dzgrid/core/xlsx` (stored, or deflated by node's zlib with
 * `deflate`), then read back (xlsx-read.ts): what the sheet holds, the counts and the problems. `widths` are pixels by
 * column id; the start-pinned columns and the groups come from `columns`; `spans` builds the span map; `style` maps a
 * column id (or `header`) to what the `xlsxStyle` hook returns.
 */
function runXlsx(input: any) {
  const ctx = localeCtx({ locale: input.locale, ...(input.timeZone && { timeZone: input.timeZone }) });
  const columns = createColumnModel<Row>(input.columns as ColumnDef<Row>[]);
  // Grouped (Phase 7 step 7): `grouping` the shape's options, `open` group keys' segments, `labels` the grid's texts (csv.ts).
  const shape = input.tree ? treeShape<Row>({ path: (r) => r['path'] as string[] }) : input.grouping ? groupShape<Row>(input.grouping) : undefined;
  const model = clientRows<Row>({ rows: input.rows.map((r: Record<string, unknown>, i: number) => ({ id: `r${i}`, ...expand(r) })), getRowId: (r) => r.id, columns, ctx, ...(shape && { shape }) });
  const kernel = createKernel<Row>({ rows: model, columns });
  if (input.open) kernel.dispatch({ type: 'rows.expand', rows: input.open.map((p: string[]) => groupKey(p)), expanded: true }, 'user');
  if (input.select) kernel.dispatch({ type: 'selection.set', selection: { mode: 'include', keys: new Set(input.select.map((id: string) => dataKey(id)!)) } }, 'user');
  const held = csvRows(model, input.scope ?? 'displayed', kernel.selection)!;
  const spans = input.spans ? { spans: buildSpanMap({ rows: model.displayed, columns, ctx }), spanColumns: columns.visible().map((c) => c.id) } : {};
  const style = input.style as Record<string, object> | undefined;
  const { parts, summary } = toXlsx(
    { rows: held.rows, at: held.at, columns, ctx, ...spans, ...(input.labels && { groupLabel }), widths: input.widths, pinned: columns.layout.start.columns.map((c) => c.id), groups: input.columns },
    { ...input.options, ...(style && { xlsxStyle: (c: { column: string; header: boolean }) => style[c.header ? 'header' : c.column] ?? null }) },
    input.deflate ? (b: Uint8Array) => new Uint8Array(deflateRawSync(b)) : undefined,
  );
  const read = readXlsx(joinParts(parts));
  const { problems, ...counts } = summary;
  return {
    ...read,
    merges: [...read.merges].sort(),
    // Long texts by length, so a case need not hold 32 767 characters.
    lengths: Object.fromEntries(Object.entries(read.cells).flatMap(([k, v]) => (typeof v === 'string' && v.length > 1000 ? [[k, v.length]] : []))),
    summary: counts,
    problems: problems.map((p) => ({ code: p.code, severity: p.severity, path: p.path, ...(p.detail !== undefined && { detail: p.detail }) })),
  };
}

export const xlsx: Record<string, Suite> = { xlsx: runXlsx };
