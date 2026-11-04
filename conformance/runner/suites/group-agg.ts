import {
  clientRows, createColumnModel, createKernel, groupKey, localeCtx, makeQuery,
  type AggFn, type ColumnDef, type FilterModel, type Problem, type RowTransaction,
} from '@dzgrid/core';
import { groupConflicts, groupShape, type GroupedRows } from '@dzgrid/core/grouping';
import { iso } from '../iso.js';
import { testReader } from './edit-order.js';
import type { Suite } from './index.js';

type Row = Record<string, unknown> & { id: string };

/** The application total functions a case may name (`{ "fn": name }`): a fixture table, the same for every implementation. */
const FNS: Record<string, AggFn> = {
  // How many distinct non-empty values, as their export text would say them.
  distinct: (values) => new Set(values.filter((v) => v !== null).map(String)).size,
  // The values joined with '|', empties as '-': shows what the function is given, in which order.
  joined: (values) => values.map((v) => (v === null ? '-' : String(v))).join('|'),
  // The level it is told (null for the grand total, written 'grand').
  level: (_v, ctx) => (ctx.level === null ? 'grand' : ctx.level),
  throws: () => {
    throw new Error('the total failed');
  },
};

/** A case's column: `aggFunc` as a built-in name, or `{ fn }` from the table above. */
const columnOf = (c: any): ColumnDef<Row> => ({ ...c, ...(c.aggFunc?.fn && { aggFunc: FNS[c.aggFunc.fn] }) });

/** A value as a case writes it: instants (epoch ms of an instant column) as ISO, null as `null`. */
const written = (v: unknown, type: string | undefined): string =>
  v === null || v === undefined ? 'null' : type === 'instant' && typeof v === 'number' ? iso(v) : String(v);

/** A grouping problem names a column or a function in `detail`; never a value. */
const tell = (ps: readonly Problem[]) => ps.map((p) => ({ code: p.code, severity: p.severity, path: p.path, ...(p.detail !== undefined && { detail: p.detail }) }));

/**
 * Grouped rows and their totals (Phase 7 steps 3–4; row-grouping.md, aggregation.md). `shown`: one string per row shown,
 * a dot per level, then
 * - a group: `[label] (count) pos/size +|-` (closed / open) and its totals `{col=value …}` in the columns' order;
 * - a data row: its id and `pos/size`;
 * - a footer: `Σ label pos/size {…}`; the grand total `Σ* pos/size {…}`.
 * Steps: `{open: [[col, seg, …]]}` (a group key's segments, written by hand), `{close}`, `{expandAll, depth?}`,
 * `{sort: [[col, dir]]}`, `{filter}`, `{quick}`, `{by}`, `{tx}`, `{edit: [id, col, value]}` (through a test overlay),
 * `{reapply: true}`.
 */
export function runGroupAgg(input: any) {
  const defs: any[] = input.columns;
  const columns = createColumnModel<Row>(defs.map(columnOf));
  const typeOf = new Map(defs.map((c) => [c.id, c.type as string | undefined]));
  const g = { ...input.grouping };
  if (g.aggFuncs) g.aggFuncs = Object.fromEntries(Object.entries(g.aggFuncs).map(([k, v]: [string, any]) => [k, v?.fn ? FNS[v.fn] : v]));
  const shape = groupShape<Row>(g);
  const model = clientRows<Row>({
    rows: input.rows, getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: input.locale ?? 'en-US', timeZone: 'UTC' }), shape,
    ...(input.page && { page: input.page }),
  });
  const kernel = createKernel<Row>({ rows: model, columns });
  const edits = testReader();
  let sort: { column: string; dir: 'asc' | 'desc' }[] = [];
  let filter: FilterModel = {};
  let quick = '';
  const stale: boolean[] = [];
  const query = () => kernel.dispatch({ type: 'query.set', query: makeQuery({ sort, filter, quick }) }, 'user');
  for (const s of input.steps ?? []) {
    if (s.open) kernel.dispatch({ type: 'rows.expand', rows: s.open.map((p: string[]) => groupKey(p)), expanded: true }, 'user');
    if (s.close) kernel.dispatch({ type: 'rows.expand', rows: s.close.map((p: string[]) => groupKey(p)), expanded: false }, 'user');
    if (s.expandAll !== undefined) kernel.dispatch({ type: 'rows.expandAll', expanded: s.expandAll, ...(s.depth !== undefined && { depth: s.depth }) }, 'user');
    if (s.sort !== undefined) (sort = s.sort.map(([column, dir]: [string, 'asc' | 'desc']) => ({ column, dir }))), query();
    if (s.filter !== undefined) (filter = s.filter), query();
    if (s.quick !== undefined) (quick = s.quick), query();
    if (s.by) shape.setBy(s.by, 'user');
    if (s.tx) model.applyTransaction(s.tx as RowTransaction<Row>);
    if (s.edit) {
      edits.edit(s.edit[0], s.edit[1], s.edit[2]);
      kernel.dispatch({ type: 'edits.reader', reader: edits.reader, columns: [s.edit[1]] }, 'user');
    }
    if (s.reapply) kernel.dispatch({ type: 'rows.reapply' }, 'user');
    if (s.edit || s.reapply) stale.push(model.orderStale);
  }
  const d = model.displayed as GroupedRows<Row>;
  const order = defs.map((c) => c.id as string);
  const totals = (aggs: Readonly<Record<string, unknown>>) => {
    const parts = order.filter((c) => c in aggs).map((c) => `${c}=${written(aggs[c], typeOf.get(c))}`);
    return parts.length ? ` {${parts.join(' ')}}` : '';
  };
  const shown = Array.from({ length: d.count }, (_, i) => {
    const at = d.index(i)!;
    const n = d.nodeAt(at);
    const place = `${d.posAt(at)}/${d.sizeAt(at)}`;
    const text =
      n.kind === 'group' ? `[${n.label}] (${n.count}) ${place} ${d.expandedAt(at) ? '-' : '+'}${totals(n.aggs ?? {})}`
      : n.kind === 'footer' ? `${n.group === null ? 'Σ*' : `Σ ${n.label}`} ${place}${totals(n.aggs)}`
      : n.kind === 'data' ? `${n.id} ${place}`
      : n.kind;
    return `${'. '.repeat(d.levelAt(at))}${text}`;
  });
  const t = shape.totals();
  return {
    shown,
    counts: model.counts,
    ...(input.totals && { totals: Object.fromEntries(order.filter((c) => c in t).map((c) => [c, t[c] === null ? null : written(t[c], typeOf.get(c))])) }),
    ...(stale.length && { stale }),
    problems: tell(model.problems),
  };
}

export const groupAgg: Record<string, Suite> = {
  'group-agg': (input) => (input.conflicts ? { problems: tell(groupConflicts(input.conflicts)) } : runGroupAgg(input)),
};
