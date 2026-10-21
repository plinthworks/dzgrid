import { clientRows, createColumnModel, createKernel, dataKey, localeCtx, makeQuery, type FilterModel, type Problem, type RowTransaction } from '@dzgrid/core';
import { treeConflicts, treeShape, type TreeRows } from '@dzgrid/core/tree';
import type { Suite } from './index.js';

type Row = { id: string; p?: string | null; n: number; t?: string };
const shape = (ps: readonly Problem[]) => ps.map((p) => ({ code: p.code, severity: p.severity, path: p.path }));

/**
 * A tree from parent ids (Phase 4 step 3, docs/behaviors/tree-view.md, tree-filter.md): rows, then
 * steps a user or a host takes. `shown`: one string per row shown, a dot per level, the id, and
 * `posinset/setsize`; `expansion`: the user's open ids; `problems`: the model's.
 */
export function runTree(input: any) {
  const columns = createColumnModel<Row>([{ id: 'n', type: 'number' }, { id: 't' }]);
  const model = clientRows<Row>({
    rows: input.rows, getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'en-US' }),
    shape: treeShape<Row>({ parentId: (r) => r.p, ...input.tree }),
    ...(input.page && { page: input.page }),
  });
  const kernel = createKernel<Row>({ rows: model, columns });
  let sort: { column: string; dir: 'asc' | 'desc' }[] = [];
  let filter: FilterModel = {};
  let quick = '';
  const query = () => kernel.dispatch({ type: 'query.set', query: makeQuery({ sort, filter, quick }) }, 'user');
  for (const s of input.steps ?? []) {
    if (s.expand) kernel.dispatch({ type: 'rows.expand', rows: s.expand.map((id: string) => dataKey(id)!), expanded: s.expanded !== false }, 'user');
    if (s.expandAll !== undefined) kernel.dispatch({ type: 'rows.expandAll', expanded: s.expandAll, ...(s.depth !== undefined && { depth: s.depth }) }, 'user');
    if (s.sort !== undefined) (sort = s.sort ? [{ column: 'n', dir: s.sort }] : []), query();
    if (s.filter !== undefined) (filter = s.filter ? { t: { type: 'text', op: 'equals', value: s.filter } } : {}), query();
    if (s.quick !== undefined) (quick = s.quick), query();
    if (s.tx) model.applyTransaction(s.tx as RowTransaction<Row>);
  }
  const d = model.displayed as TreeRows<Row>;
  const shown = Array.from({ length: d.count }, (_, i) => {
    const at = d.index(i)!;
    const muted = d.matchedAt(at) ? '' : ' muted';
    return `${'. '.repeat(d.levelAt(at))}${String((d.nodeAt(at) as { id: unknown }).id)} ${d.posAt(at)}/${d.sizeAt(at)}${muted}`;
  });
  const expansion = [...kernel.expansion].map((k) => k.slice(k.indexOf(':', 2) + 1)).sort();
  return { shown, expansion, counts: model.counts, problems: shape(model.problems) };
}

export const tree: Record<string, Suite> = {
  tree: (input) => (input.conflicts ? { problems: shape(treeConflicts(input.conflicts)) } : runTree(input)),
};
