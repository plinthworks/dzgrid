import { clientRows, createColumnModel, createKernel, dataKey, detailKey, headerSelection, localeCtx, makeQuery, type FilterModel, type Problem, type RowKey, type RowTransaction } from '@dzgrid/core';
import { csvRows, toCsv } from '@dzgrid/core/csv';
import { detailConflicts, detailShape, type DetailRows } from '@dzgrid/core/detail';
import type { Suite } from './index.js';

type Row = { id: string; n: number; t?: string };
/** An id, or `>id` for its detail's key. */
const keyOf = (id: string): RowKey => (id.startsWith('>') ? detailKey(dataKey(id.slice(1))!) : dataKey(id)!);
const tell = (ps: readonly Problem[]) => ps.map((p) => ({ code: p.code, severity: p.severity, path: p.path, ...(p.detail !== undefined && { detail: p.detail }) }));
const idOf = (k: string) => (k.startsWith('d:') ? k.slice(k.indexOf(':', 2) + 1) : k);

/**
 * Master/detail rows (Phase 4 step 8, docs/behaviors/master-detail.md): rows, then the steps a user
 * or a host takes. `shown`: one string per row shown, the id, or `> id` for a detail; `heights`: the
 * open details' heights (`detail.height` a number, or `"n*k"`: the row's n times k); `page`: the
 * page's index and count when paged; `selection` when the steps select; `csv` the file's lines and
 * count for a scope.
 */
export function runDetail(input: any) {
  const columns = createColumnModel<Row>([{ id: 'n', header: 'N', type: 'number' }, { id: 't', header: 'T' }]);
  const h = input.detail?.height;
  const height = typeof h === 'string' && h.startsWith('n*') ? (r: Row) => r.n * Number(h.slice(2)) : h;
  const shape = detailShape<Row>({ ...input.detail, ...(height !== undefined && { height }) });
  const ctx = localeCtx({ locale: 'en-US' });
  const model = clientRows<Row>({ rows: input.rows, getRowId: (r) => r.id, columns, ctx, shape, ...(input.page && { page: input.page }) });
  const kernel = createKernel<Row>({ rows: model, columns });
  let sort: { column: string; dir: 'asc' | 'desc' }[] = [];
  let filter: FilterModel = {};
  const refused: string[] = [];
  let selects = false;
  const query = () => kernel.dispatch({ type: 'query.set', query: makeQuery({ sort, filter }) }, 'user');
  for (const s of input.steps ?? []) {
    if (s.expand) refused.push(...(kernel.dispatch({ type: 'rows.expand', rows: s.expand.map(keyOf), expanded: s.expanded !== false }, 'user').ok ? [] : [`expand ${s.expand.join(',')}`]));
    if (s.expandAll !== undefined) kernel.dispatch({ type: 'rows.expandAll', expanded: s.expandAll }, 'user');
    if (s.sort !== undefined) (sort = s.sort ? [{ column: 'n', dir: s.sort }] : []), query();
    if (s.filter !== undefined) (filter = s.filter ? { t: { type: 'text', op: 'equals', value: s.filter } } : {}), query();
    if (s.page !== undefined) kernel.dispatch({ type: 'page.go', index: s.page }, 'user');
    if (s.select === 'all') (selects = true), kernel.dispatch({ type: 'selection.all' }, 'user');
    if (s.toggle) (selects = true), refused.push(...(kernel.dispatch({ type: 'selection.toggle', row: keyOf(s.toggle) }, 'user').ok ? [] : [s.toggle]));
    if (s.range) (selects = true), kernel.dispatch({ type: 'selection.range', target: keyOf(s.range), additive: false }, 'user');
    if (s.tx) model.applyTransaction(s.tx as RowTransaction<Row>);
  }
  const d = model.displayed as DetailRows<Row>;
  const shown = Array.from({ length: d.count }, (_, i) => {
    const n = d.nodeAt(d.index(i)!);
    return n.kind === 'detail' ? `> ${idOf(n.master)}` : n.kind === 'data' ? String(n.id) : '?';
  });
  const p = model.page;
  const csv = input.csv ? csvRows(model, input.csv, kernel.selection)! : null;
  return {
    shown,
    expansion: [...kernel.expansion].map(idOf).sort(),
    counts: model.counts,
    heights: [...d.heights],
    page: p && { index: p.index, pageCount: p.pageCount },
    problems: tell(model.problems),
    ...(refused.length && { refused }),
    ...(selects && { selection: { ids: [...kernel.selection.keys].map(idOf).sort(), header: headerSelection(kernel.selection, d) } }),
    ...(csv && { csv: { count: csv.count, lines: toCsv({ rows: csv.rows, at: csv.at, columns, ctx }, { bom: false }).split('\r\n').slice(0, -1) } }),
  };
}

export const detail: Record<string, Suite> = {
  detail: (input) => (input.conflicts ? { problems: tell(detailConflicts(input.conflicts)) } : runDetail(input)),
};
