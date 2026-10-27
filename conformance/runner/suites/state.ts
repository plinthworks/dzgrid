import { clientRows, createColumnModel, createKernel, localeCtx, type ColumnOrGroup, type GridCommand } from '@dzgrid/core';
import { diffState, foldedColumns, groupTable } from '@dzgrid/core/spans';
import { captureState, checkState, restoreState, stateText, type GroupsAdapter } from '@dzgrid/core/state';
import type { Suite } from './index.js';

type Row = Record<string, unknown> & { id: string };
const DENSITIES = ['compact', 'comfortable', 'spacious'];

/**
 * `grid-state` (Phase 6 step 5, docs/behaviors/grid-state.md): a client grid on `columns` and `rows` (paged by `pageSize`), the
 * user's `before` commands, then `restore` of a raw state (any JSON). `upgradeV0`: a planted v0 → v1 step (a test-only shape:
 * `{ v: 0, cols: [ids] }`). `groups`: the collapsible group ids of a stub adapter. Out: the problems, the state captured after, the rows shown, and whether a `SECRET…` cell value reached the text.
 */
export const state: Record<string, Suite> = {
  'grid-state': ({ columns, rows = [], pageSize, before = [], restore, upgradeV0, groups }) => {
    const m = createColumnModel<Row>(columns as ColumnOrGroup<Row>[]);
    const model = clientRows<Row>({ rows, getRowId: (r) => r.id, columns: m, ctx: localeCtx({ locale: 'fr-FR' }), ...(pageSize && { page: { pageSize } }) });
    const k = createKernel<Row>({ rows: model, columns: m });
    for (const cmd of before as GridCommand[]) k.dispatch(cmd, 'user');
    let open: Record<string, boolean> = {};
    let density: string | undefined;
    // Collapsible groups in the columns (Phase 6 step 7): the real table and fold, as `@dzgrid/dom/spans` wires them; else the stub.
    const t = (columns as ColumnOrGroup<Row>[]).some((c) => 'children' in c) ? groupTable(columns as ColumnOrGroup<Row>[]) : null;
    let folds = 0;
    const adapter: GroupsAdapter | undefined = t
      ? { collapsible: (id) => t.groups.has(id), get: () => diffState(t, new Map(Object.entries(open))), set: (o) => void ((open = { ...o }), folds++, m.fold(foldedColumns(t, new Map(Object.entries(open))))) }
      : groups && { collapsible: (id) => (groups as string[]).includes(id), get: () => open, set: (o) => void (open = { ...open, ...o }) };
    const env = { ...(adapter && { groups: adapter }), density: () => density as never, setDensity: (d: unknown) => DENSITIES.includes(d as string) && ((density = d as string), true) };
    const raw = upgradeV0 && checkState(restore, [(s: { cols: string[] }) => ({ v: 1, columns: s.cols.map((id, order) => ({ id, pinned: null, order })) })]).state;
    const problems = restoreState(k, upgradeV0 ? (raw ?? restore) : restore, env);
    const text = stateText(captureState(k, env));
    const secret = (rows as Row[]).flatMap((r) => Object.values(r)).filter((v) => typeof v == 'string' && v.startsWith('SECRET'));
    return {
      problems: problems.map((p) => ({ code: p.code, severity: p.severity, path: p.path, ...(p.detail !== undefined && { detail: p.detail }) })),
      state: JSON.parse(text),
      ...(secret.length > 0 && { leaks: secret.some((v) => text.includes(v as string)) }),
      // The rows shown after the restore (when the case has rows): the order and page it gave.
      ...(t && { shown: m.visible().map((c) => c.id), folds }),
      ...((rows as Row[]).length > 0 && { shown: Array.from({ length: k.rows.displayed.count }, (_, i) => String((k.rows.displayed.nodeAt(k.rows.displayed.index(i)!) as { id: unknown }).id)) }),
    };
  },
};
