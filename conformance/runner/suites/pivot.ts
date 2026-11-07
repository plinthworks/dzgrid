import {
  clientRows, createColumnModel, createKernel, groupKey, localeCtx, makeQuery,
  type ColumnDef, type ColumnOrGroup, type FilterModel, type Problem, type RowTransaction,
} from '@dzgrid/core';
import type { GroupedRows } from '@dzgrid/core/grouping';
import { pivotShape } from '@dzgrid/core/pivot';
import { iso } from '../iso.js';
import { testReader } from './edit-order.js';
import { columnOf, FNS } from './group-agg.js';
import type { Suite } from './index.js';

type Row = Record<string, unknown> & { id: string };

const written = (v: unknown, type: string | undefined): string =>
  v === null || v === undefined ? 'null' : type === 'instant' && typeof v === 'number' ? iso(v) : String(v);
const tell = (ps: readonly Problem[]) => ps.map((p) => ({ code: p.code, severity: p.severity, path: p.path, ...(p.detail !== undefined && { detail: p.detail }) }));
const fns = (m: Record<string, any> | undefined) => m && Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v?.fn ? FNS[v.fn] : v]));

/** Each created column's header chain (bands first, `/` between), in order; with its id, its value column's type. */
function leavesOf(tree: readonly ColumnOrGroup<Row>[], up: string[] = []): { id: string; chain: string; type: string | undefined }[] {
  return tree.flatMap((n) =>
    'children' in n ? leavesOf(n.children, [...up, n.header ?? '']) : [{ id: n.id, chain: [...up, n.header ?? ''].join('/'), type: (n as ColumnDef<Row>).type }]);
}

/**
 * A pivot (Phase 10, docs/behaviors/pivot.md, aggregation.md 16–18): a client grid on `columns` and `rows` with
 * `pivotShape(pivot)` (`aggFuncs` and `values` as built-in names or `{ fn }` from the group-agg table). As the DOM will:
 * after each step, the created columns put beside the host's (`columns.set`) when their list changed. Out:
 * - `headers`: each created column's header chain;
 * - `shown`: one string per row, a dot per level: a group `[label] (count) pos/size` (`+` / `-` when it can open), then
 *   `{chain=value … | col=total …}` (crossings, then the row totals); the grand total `Σ* pos/size {…}`;
 * - `count` (created columns, made or not), `problems`; `ids` when asked; `series` for `series` options; `builds`.
 * Steps: `{sort}`, `{filter}`, `{quick}`, `{expandAll, depth?}`, `{open: [[seg…]]}`, `{pivotBy}`, `{values}`, `{on}`, `{desc}`,
 * `{tx}`, `{edit: [id, col, value]}`, `{by}`.
 */
export function runPivot(input: any) {
  const defs: ColumnDef<Row>[] = input.columns.map(columnOf);
  const typeOf = new Map((input.columns as { id: string; type?: string }[]).map((c) => [c.id, c.type]));
  const columns = createColumnModel<Row>(defs);
  const o = { ...input.pivot };
  if (o.aggFuncs) o.aggFuncs = fns(o.aggFuncs);
  if (o.values) o.values = fns(o.values);
  const shape = pivotShape<Row>(o);
  const model = clientRows<Row>({ rows: input.rows, getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: input.locale ?? 'en-US', timeZone: 'UTC' }), shape });
  const kernel = createKernel<Row>({ rows: model, columns });
  let key = '';
  const sync = () => {
    const g = shape.generated();
    if (g.key !== key) (key = g.key), kernel.dispatch({ type: 'columns.set', defs: [...defs, ...g.columns] }, 'host');
  };
  sync();
  const edits = testReader();
  let sort: { column: string; dir: 'asc' | 'desc' }[] = [];
  let filter: FilterModel = {};
  let quick = '';
  const query = () => kernel.dispatch({ type: 'query.set', query: makeQuery({ sort, filter, quick }) }, 'user');
  for (const s of input.steps ?? []) {
    if (s.sort !== undefined) (sort = s.sort.map(([column, dir]: [string, 'asc' | 'desc']) => ({ column, dir }))), query();
    if (s.filter !== undefined) (filter = s.filter), query();
    if (s.quick !== undefined) (quick = s.quick), query();
    if (s.expandAll !== undefined) kernel.dispatch({ type: 'rows.expandAll', expanded: s.expandAll, ...(s.depth !== undefined && { depth: s.depth }) }, 'user');
    if (s.open) kernel.dispatch({ type: 'rows.expand', rows: s.open.map((p: string[]) => groupKey(p)), expanded: true }, 'user');
    if (s.by) shape.setBy(s.by, 'user');
    if (s.pivotBy) shape.setPivotBy(s.pivotBy, 'user');
    if (s.values) shape.setValueFns(fns(s.values)!, 'user');
    if (s.on !== undefined) shape.setOn(s.on, 'user');
    if (s.desc) shape.set({ desc: s.desc }, 'user');
    if (s.tx) model.applyTransaction(s.tx as RowTransaction<Row>);
    if (s.edit) {
      edits.edit(s.edit[0], s.edit[1], s.edit[2]);
      kernel.dispatch({ type: 'edits.reader', reader: edits.reader, columns: [s.edit[1]] }, 'user');
    }
    sync();
  }
  const made = leavesOf(shape.generated().columns);
  const values = Object.keys(shape.valueFns());
  const cells = (aggs: Readonly<Record<string, unknown>>) => {
    const a = made.filter((c) => aggs[c.id] !== undefined).map((c) => `${c.chain}=${written(aggs[c.id], c.type)}`);
    const b = values.filter((c) => aggs[c] !== undefined && aggs[c] !== null).map((c) => `${c}=${written(aggs[c], typeOf.get(c))}`);
    return a.length || b.length ? ` {${[...a, ...(b.length ? ['|', ...b] : [])].join(' ')}}` : '';
  };
  const d = model.displayed as GroupedRows<Row>;
  const shown = Array.from({ length: d.count }, (_, i) => {
    const at = d.index(i)!;
    const n = d.nodeAt(at);
    const place = `${d.posAt(at)}/${d.sizeAt(at)}`;
    const text =
      n.kind === 'group' ? `[${n.label}] (${n.count}) ${place}${d.childrenAt(at) ? (d.expandedAt(at) ? ' -' : ' +') : ''}${cells(n.aggs ?? {})}`
      : n.kind === 'footer' ? `${n.group === null ? 'Σ*' : `Σ ${n.label}`} ${place}${cells(n.aggs)}`
      : n.kind === 'data' ? `${n.id} ${place}`
      : n.kind;
    return `${'. '.repeat(d.levelAt(at))}${text}`;
  });
  return {
    headers: made.map((c) => c.chain),
    shown,
    count: shape.generated().count,
    ...(input.ids && { ids: made.map((c) => c.id) }),
    ...(input.series && { series: shape.series(input.series) }),
    ...(input.builds && { builds: shape.diagnostics.builds }),
    problems: tell(model.problems),
  };
}

export const pivot: Record<string, Suite> = { pivot: runPivot };
