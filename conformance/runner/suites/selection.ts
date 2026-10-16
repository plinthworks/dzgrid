import { clientRows, createColumnModel, localeCtx, makeQuery, dataKey, NO_SELECTION, toggle, selectOnly, selectAll, clearSelection, selectRange, reconcileSelection, selectionCount, idOfDataKey, type SelectionState } from '@dzgrid/core';
import type { Suite } from './index.js';

type Row = { id: string; v: number };

export const selection: Record<string, Suite> = {
  selection: ({ rows, sort, filter, ops }) => {
    const m = clientRows<Row>({ rows, getRowId: (r) => r.id, columns: createColumnModel<Row>([{ id: 'v', type: 'number' }]), ctx: localeCtx({ locale: 'en-US' }) });
    m.setQuery(makeQuery({ ...(sort && { sort }), ...(filter && { filter }) }));
    let s: SelectionState = NO_SELECTION;
    let reason: string | undefined;
    const k = (id: string) => dataKey(id)!;
    for (const op of ops) {
      if (op.op === 'toggle') s = toggle(s, k(op.id));
      else if (op.op === 'only') s = selectOnly(op.ids.map(k));
      else if (op.op === 'all') s = selectAll();
      else if (op.op === 'clear') s = clearSelection();
      else if (op.op === 'sort') m.setQuery(makeQuery({ sort: op.sort }));
      else if (op.op === 'remove') m.applyTransaction({ remove: op.ids });
      else if (op.op === 'reconcile') s = reconcileSelection(s, (key) => m.store.get(key) !== undefined);
      else if (op.op === 'range') {
        const r = selectRange(s, m.displayed, k(op.anchor), k(op.target), { additive: op.additive ?? false });
        if (r.ok) s = r.state;
        else reason = r.reason;
      }
    }
    const out: Record<string, unknown> = {
      mode: s.mode,
      keys: [...s.keys].map((key) => idOfDataKey(key)).sort(),
      count: selectionCount(s, m.store.size),
    };
    if (reason) out['reason'] = reason;
    return out;
  },
};
