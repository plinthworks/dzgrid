import { clientRows, createColumnModel, createKernel, dataKey, localeCtx, type ColumnOrGroup, type DisplayedRows, type Problem } from '@dzgrid/core';
import { treeShape } from '@dzgrid/core/tree';
import { createRowStore, flatDisplayed } from '@dzgrid/core/internal';
import { buildSpanMap, foldedColumns, groupTable, headerBands, navigate, type SpanCell, type SpanLookup } from '@dzgrid/core/spans';
import { FULL_WIDTH, SAME_RULES, SPAN_RULES } from '../spans-fixtures.js';
import type { Suite } from './index.js';

type Row = Record<string, unknown> & { id: string };
const shape = (ps: readonly Problem[]) => ps.map((p) => ({ code: p.code, severity: p.severity, path: p.path }));
const rule = (name: unknown) => (typeof name === 'string' ? SPAN_RULES[name] ?? (name as never) : name);

/** A case's column (or group) with its rules' fixture names replaced by the fixtures. */
export function columnOf(d: any): ColumnOrGroup<Row> {
  if (d && Array.isArray(d.children)) return { ...d, children: d.children.map(columnOf) };
  const out = { ...d };
  if (d.rowSpan !== undefined) out.rowSpan = rule(d.rowSpan);
  if (d.colSpan !== undefined) out.colSpan = rule(d.colSpan);
  if (typeof d.merge === 'string') out.merge = SAME_RULES[d.merge] ?? d.merge;
  if (d.merge && typeof d.merge === 'object' && typeof d.merge.same === 'string') out.merge = { ...d.merge, same: SAME_RULES[d.merge.same] };
  return out;
}

/** The map of a case: rows as value arrays in leaf order, an optional display order. */
export function runSpans(input: any) {
  const columns = createColumnModel<Row>(input.columns.map(columnOf));
  if (input.state) columns.apply(input.state, 'api');
  const ids = columns.state().map((s) => s.id);
  const store = createRowStore<Row>((r) => r.id);
  store.replaceAll(input.rows.map((vals: unknown[], i: number) => ({ id: `r${i}`, ...Object.fromEntries(ids.map((id, j) => [id, vals[j]])) })));
  let rows: DisplayedRows<Row> = flatDisplayed(store.snapshot, input.order ? Uint32Array.from(input.order) : null, 1);
  // A tree (1.1.0, spans.md « In a tree »): `parents` gives each row's parent (an index, null for a root), `open` the
  // rows opened; `treeColumn` the tree's column; `gaps` the rows a gap stands before (row-gaps.md).
  if (input.parents) {
    const data = input.rows.map((vals: unknown[], i: number) => ({ id: `r${i}`, p: input.parents[i] === null ? null : `r${input.parents[i]}`, ...Object.fromEntries(ids.map((id, j) => [id, vals[j]])) }));
    const model = clientRows<Row>({ rows: data, getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'en-US' }), shape: treeShape<Row>({ parentId: (r) => r.p as string | null }) });
    createKernel<Row>({ rows: model, columns }).dispatch({ type: 'rows.expand', rows: (input.open ?? []).map((i: number) => dataKey(`r${i}`)!), expanded: true }, 'user');
    rows = model.displayed;
  }
  const map = buildSpanMap({
    rows, columns, ctx: localeCtx({ locale: 'en-US' }), ...(input.fullWidth && { fullWidth: FULL_WIDTH[input.fullWidth] }),
    ...(input.treeColumn && { treeColumn: input.treeColumn }), ...(input.gaps && { apart: (i: number) => input.gaps.includes(i) }),
  });
  const n = columns.visible().length;
  const cells: SpanCell[] = [];
  const fullWidth: number[] = [];
  const seen = new Set<string>();
  for (let r = 0; r < rows.count; r++) {
    if (map.fullWidth(r)) {
      fullWidth.push(r);
      continue;
    }
    for (let c = 0; c < n; c++) {
      const o = map.ownerAt(r, c);
      if (!o || seen.has(`${o.row},${o.col}`)) continue;
      seen.add(`${o.row},${o.col}`);
      cells.push({ row: o.row, col: o.col, rows: o.rows, cols: o.cols });
    }
  }
  return { cells, ...(fullWidth.length && { fullWidth }), problems: shape(map.problems) };
}

export function runBands(input: any) {
  const tree = input.columns.map(columnOf);
  const columns = createColumnModel<Row>(tree);
  if (input.state) columns.apply(input.state, 'api');
  // Collapsible groups (Phase 6 step 7): `open` gives the groups' state; the folded columns are left out first.
  const t = input.open ? groupTable(tree) : null;
  if (t) columns.fold(foldedColumns(t, new Map(Object.entries(input.open as Record<string, boolean>))));
  const b = headerBands(tree, columns.layout);
  return { depth: b.depth, levels: b.levels, problems: shape([...b.problems, ...(t?.problems ?? [])]), ...(t && { shown: columns.visible().map((c) => c.id) }) };
}

/** A literal map: the listed cells, and full-width rows over every column. */
function lookupOf(cells: readonly SpanCell[], cols: number, fullWidth: readonly number[]): SpanLookup {
  return {
    ownerAt: (r, c) => (fullWidth.includes(r) ? { row: r, col: 0, rows: 1, cols } : cells.find((s) => r >= s.row && r < s.row + s.rows && c >= s.col && c < s.col + s.cols) ?? null),
  };
}

export const spans: Record<string, Suite> = {
  spans: runSpans,
  'header-bands': runBands,
  // Keys pressed one after the other from `start`; each step starts where the last one went.
  'keyboard-move': (input) => {
    const map = input.cells || input.fullWidth ? lookupOf(input.cells ?? [], input.cols, input.fullWidth ?? []) : null;
    const s = { rows: input.rows, cols: input.cols, page: input.page ?? 10 };
    let at = input.start;
    let goal = null;
    const moves = [];
    for (const intent of input.keys) {
      const m = navigate(map, s, at, goal, intent);
      moves.push(m);
      if (m && m.to.row >= 0) {
        at = m.to;
        goal = m.goal;
      }
    }
    return { moves };
  },
};
