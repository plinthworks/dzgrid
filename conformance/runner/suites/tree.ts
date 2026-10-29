import { clientRows, createColumnModel, createKernel, dataKey, groupKey, headerSelection, localeCtx, makeQuery, type FilterModel, type Problem, type RowKey, type RowTransaction } from '@dzgrid/core';
import { treeConflicts, treeShape, type TreeRows } from '@dzgrid/core/tree';
import { lazyShape } from '@dzgrid/core/tree-lazy';
import type { Suite } from './index.js';

type Row = { id: string; p?: string | null; n: number; t?: string; c?: Row[]; path?: string[] };
/** The shapes a case names (`input.shape`, step 5): parent ids by default, nested `c`, paths, none, two. */
const SHAPES = {
  parent: { parentId: (r: Row) => r.p },
  children: { children: (r: Row) => r.c },
  path: { path: (r: Row) => r.path! },
  none: {},
  both: { parentId: (r: Row) => r.p, path: (r: Row) => r.path! },
} as const;
/** An id, or a filler's path written `/a/b`. */
const keyOf = (id: string): RowKey => (id.startsWith('/') ? groupKey(id.slice(1).split('/')) : dataKey(id)!);
/** A tree problem names its row by id in `detail` (its place shifts on a removal). */
const tell = (ps: readonly Problem[]) => ps.map((p) => ({ code: p.code, severity: p.severity, path: p.path, ...(p.code.startsWith('tree-') && { detail: p.detail }) }));

/**
 * A tree from parent ids (Phase 4 step 3, docs/behaviors/tree-view.md, tree-filter.md): rows, then
 * steps a user or a host takes. `shown`: one string per row shown, a dot per level, the id, and
 * `posinset/setsize`; `expansion`: the user's open ids; `problems`: the model's.
 */
export function runTree(input: any) {
  const columns = createColumnModel<Row>([{ id: 'n', type: 'number' }, { id: 't' }]);
  // `fixed` (1.1.0, tree-view.md « rows always open »): the ids `fixedOpen` answers true for.
  const fixed: string[] | undefined = input.fixed;
  const base = treeShape<Row>({ ...SHAPES[(input.shape ?? 'parent') as keyof typeof SHAPES], ...input.tree, ...(fixed && { fixedOpen: (r: Row) => fixed.includes(r.id) }) });
  // Lazy children (step 7, tree-lazy.md): `lazy.has` the ids declared; each load logged (`ask a`,
  // `abort a`) and answered by a step (`answer`/`fail`: the latest request for that id, even aborted).
  const declared = new Set<string>(input.lazy?.has ?? []);
  const lazy = input.lazy ? lazyShape(base, { has: (r) => declared.has(r.id) }) : null;
  const shape = lazy ?? base;
  const loads: string[] = [];
  const asked = new Map<string, (ok: boolean, v: unknown) => void>();
  if (lazy) lazy.lazy.loader = (_p, row, answer) => {
    loads.push(`ask ${row.id}`);
    asked.set(row.id, answer);
    return () => void loads.push(`abort ${row.id}`);
  };
  const model = clientRows<Row>({
    rows: input.rows, getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'en-US' }), shape,
    ...(input.page && { page: input.page }),
  });
  const kernel = createKernel<Row>({ rows: model, columns });
  let sort: { column: string; dir: 'asc' | 'desc' }[] = [];
  let filter: FilterModel = {};
  let quick = '';
  const refused: string[] = [];
  const query = () => kernel.dispatch({ type: 'query.set', query: makeQuery({ sort, filter, quick }) }, 'user');
  for (const s of input.steps ?? []) {
    if (s.expand) kernel.dispatch({ type: 'rows.expand', rows: s.expand.map(keyOf), expanded: s.expanded !== false }, 'user');
    // Selection (step 5, tree-selection.md): `all`, a toggle, a range from the anchor; refusals listed.
    if (s.select === 'all') kernel.dispatch({ type: 'selection.all' }, 'user');
    if (s.toggle) refused.push(...(kernel.dispatch({ type: 'selection.toggle', row: keyOf(s.toggle) }, 'user').ok ? [] : [s.toggle]));
    if (s.range) kernel.dispatch({ type: 'selection.range', target: keyOf(s.range), additive: false }, 'user');
    if (s.expandAll !== undefined) kernel.dispatch({ type: 'rows.expandAll', expanded: s.expandAll, ...(s.depth !== undefined && { depth: s.depth }) }, 'user');
    if (s.sort !== undefined) (sort = s.sort ? [{ column: 'n', dir: s.sort }] : []), query();
    if (s.filter !== undefined) (filter = s.filter ? { t: { type: 'text', op: 'equals', value: s.filter } } : {}), query();
    if (s.quick !== undefined) (quick = s.quick), query();
    if (s.tx) model.applyTransaction(s.tx as RowTransaction<Row>);
    if (s.answer) asked.get(s.answer)?.(true, s.rows);
    if (s.fail) asked.get(s.fail)?.(false, new Error('failed'));
    if (s.retry && lazy) lazy.lazy.retry(keyOf(s.retry));
    if (s.refresh) kernel.dispatch({ type: 'rows.refresh' }, 'user');
    if (s.setRows) model.setRows(s.setRows);
  }
  const d = model.displayed as TreeRows<Row>;
  const shown = Array.from({ length: d.count }, (_, i) => {
    const at = d.index(i)!;
    const muted = d.matchedAt(at) ? '' : ' muted';
    const node = d.nodeAt(at);
    const name = node.kind === 'group' ? `[${node.label}]` : node.kind === 'loading' ? (node.failed ? '(failed)' : '(loading)') : String((node as { id: unknown }).id);
    return `${'. '.repeat(d.levelAt(at))}${name} ${d.posAt(at)}/${d.sizeAt(at)}${muted}`;
  });
  const idOf = (k: string) => (k.startsWith('d:') ? k.slice(k.indexOf(':', 2) + 1) : k);
  const expansion = [...kernel.expansion].map(idOf).sort();
  const selection = kernel.selection.keys.size || kernel.selection.mode === 'exclude'
    ? { mode: kernel.selection.mode, ids: [...kernel.selection.keys].map(idOf).sort(), header: headerSelection(kernel.selection, d), ...(refused.length && { refused }) }
    : undefined;
  return { shown, expansion, counts: model.counts, problems: tell(model.problems), ...(selection && { selection }), ...(input.lazy && { loads }) };
}

export const tree: Record<string, Suite> = {
  tree: (input) => (input.conflicts ? { problems: tell(treeConflicts(input.conflicts)) } : runTree(input)),
};
