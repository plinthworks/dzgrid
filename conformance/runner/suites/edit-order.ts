import {
  clientRows, createColumnModel, createKernel, dataKey, detailKey, groupKey, localeCtx, makeQuery,
  type ChangeSource, type ColumnDef, type GridCommand, type RowKey, type RowShape, type RowTransaction, type ValueReader,
} from '@dzgrid/core';
import { lockColumns } from '@dzgrid/core/internal';
import { treeShape } from '@dzgrid/core/tree';
import { detailShape } from '@dzgrid/core/detail';
import type { Suite } from './index.js';

type Row = Record<string, unknown> & { id: string };

/** A test edit overlay (Phase 5 step 2): values by row id and column, a new version for each edit. */
export function testReader() {
  const cells = new Map<string, Map<string, unknown>>();
  let version = 0;
  const reader: ValueReader<Row> = {
    get version() { return version; },
    overlay: true,
    value: (col, row, id) => {
      const m = cells.get(id);
      return m?.has(col.id) ? m.get(col.id) : col.read(row);
    },
  };
  return {
    reader,
    edit(id: string, column: string, value: unknown) {
      if (!cells.has(id)) cells.set(id, new Map());
      cells.get(id)!.set(column, value);
      version++;
    },
  };
}

/** An id, `>id` for its detail, `/a/b` for a path tree's filler, `~id` for the loading row under it. */
export const keyOf = (s: string): RowKey =>
  s.startsWith('>') ? detailKey(dataKey(s.slice(1))!) : s.startsWith('/') ? groupKey(s.slice(1).split('/')) : s.startsWith('~') ? (`l:${dataKey(s.slice(1))}` as RowKey) : dataKey(s)!;

const shapeOf = (input: any): RowShape<Row> | undefined =>
  input.shape === 'tree' ? treeShape<Row>({ parentId: (r) => r.p as string | null, ...input.tree })
    : input.shape === 'path' ? treeShape<Row>({ path: (r) => r.path as string[], ...input.tree })
      : input.shape === 'detail' ? detailShape<Row>({ ...input.detail })
        : undefined;

/** What a rule fixture named in a case does (`editable: {rule}`): the same table for every implementation. */
const RULES: Record<string, (row: Readonly<Row>, context: unknown) => unknown> = {
  'context-allows': (_row, context) => (context as { allow?: unknown } | null)?.allow === true,
  'row-ok': (row) => row.ok === true,
  'says-yes': () => 'yes',
  throws: () => {
    throw new Error('the rule failed');
  },
};
const columnsOf = (defs: any[]): ColumnDef<Row, any>[] =>
  defs.map((d) => (d && typeof d.editable === 'object' && d.editable !== null && 'rule' in d.editable ? { ...d, editable: RULES[d.editable.rule] } : d));

function setup(input: any) {
  const columns = createColumnModel<Row>(columnsOf(input.columns));
  const model = clientRows<Row>({
    rows: input.rows, getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'en-US' }),
    ...(shapeOf(input) && { shape: shapeOf(input)! }),
    ...(input.page && { page: input.page }),
  });
  const q = input.query ?? {};
  const kernel = createKernel<Row>({ rows: model, columns, ...(input.query && { query: makeQuery({ sort: q.sort ?? [], filter: q.filter ?? {}, quick: q.quick ?? '' }) }) });
  return { columns, model, kernel };
}

const shownOf = (d: { count: number; index(i: number): unknown; nodeAt(i: never): any }): string[] =>
  Array.from({ length: d.count }, (_, i) => {
    const n = d.nodeAt(d.index(i) as never);
    return n.kind === 'detail' ? `> ${String(n.master).slice(String(n.master).indexOf(':', 2) + 1)}` : n.kind === 'data' ? String(n.id) : `/${n.path?.join('/')}`;
  });

/**
 * Edits that keep the order (Phase 5 step 2, edit-reapply.md 1–2, 7; K.14): rows, a query, then steps
 * (`edit: [id, column, value]` through `edits.reader`, `reapply: source`, `sort`, `filter`, `quick`,
 * `resize: [column, width]`, `state` (a column state patch), `tx`, `load` (the host's rows again) from the host, `expand: ids`). `shown`: the rows shown at the end;
 * `stale`: `orderStale` after each step; `changes`: each model change heard, `[kind, source]`.
 */
export function runEditOrder(input: any) {
  const { model, kernel } = setup(input);
  const t = testReader();
  const changes: [string, ChangeSource][] = [];
  kernel.subscribe((e) => {
    if (e.type === 'modelUpdated') changes.push([e.kind, e.source]);
  });
  const stale: boolean[] = [];
  const go = (cmd: GridCommand, source: ChangeSource = 'user') => {
    const r = kernel.dispatch(cmd, source);
    if (!r.ok) throw new Error(`refused ${cmd.type}: ${r.reason}`);
  };
  for (const s of input.steps) {
    if (s.edit) {
      const [id, column, value] = s.edit;
      t.edit(id, column, value);
      go({ type: 'edits.reader', reader: t.reader, columns: [column] });
    }
    if (s.reapply) go({ type: 'rows.reapply' }, s.reapply);
    if (s.sort) go({ type: 'sort.set', sort: s.sort });
    if (s.filter) go({ type: 'filter.set', filter: s.filter });
    if (s.quick !== undefined) go({ type: 'quick.set', text: s.quick });
    if (s.resize) go({ type: 'column.resize', column: s.resize[0], width: s.resize[1], finished: true });
    if (s.state) go({ type: 'column.state', patch: s.state });
    if (s.tx) model.applyTransaction(s.tx as RowTransaction<Row>, 'host');
    if (s.load) model.setRows(s.load, 'host');
    if (s.expand) go({ type: 'rows.expand', rows: s.expand.map(keyOf), expanded: true });
    stale.push(kernel.orderStale);
  }
  return { shown: shownOf(model.displayed as never), stale, changes };
}

/**
 * Which cells can be edited (Phase 5 step 2, editing.md 1–2): rows, columns (`editable` true, false,
 * any other value, or `{rule}` from the fixture table), a shape, then steps (`ask: [key, column]`,
 * `app: value` through `context.app`, `lock: ids` as a tree's structure columns, `expand: ids`).
 * `answers`: one per ask; `problems`: the columns' own, then each one the kernel told.
 */
export function runEditable(input: any) {
  const { columns, kernel } = setup(input);
  const problems: unknown[] = columns.problems.map((p) => ({ ...p }));
  kernel.subscribe((e) => {
    if (e.type === 'problems') problems.push(...e.problems.map((p) => ({ ...p })));
  });
  const answers: boolean[] = [];
  for (const s of input.steps) {
    if (s.expand) kernel.dispatch({ type: 'rows.expand', rows: s.expand.map(keyOf), expanded: true }, 'user');
    if ('app' in s) kernel.dispatch({ type: 'context.app', value: s.app }, 'host');
    if (s.lock) lockColumns(kernel, s.lock);
    if (s.ask) answers.push(kernel.editable(keyOf(s.ask[0]), s.ask[1]));
  }
  return { answers, problems };
}

export const editOrder: Record<string, Suite> = {
  'edit-order': runEditOrder,
  editable: runEditable,
};
