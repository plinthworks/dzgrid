import { clientRows, createColumnModel, localeCtx, makeQuery, dataKey, type Query } from '@dzgrid/core';
import type { Suite } from './index.js';

type Row = Record<string, unknown> & { id: string };

export const model: Record<string, Suite> = {
  'displayed-order': ({ columns, rows, ops, at, of }) => {
    const m = clientRows<Row>({ rows, getRowId: (r) => r.id, columns: createColumnModel<Row>(columns), ctx: localeCtx({ locale: 'en-US' }) });
    let q: Query = makeQuery();
    for (const op of ops) {
      if (op.sort) q = makeQuery({ sort: op.sort, filter: q.filter, quick: q.quick });
      else if (op.filter) q = makeQuery({ sort: q.sort, filter: op.filter, quick: q.quick });
      else if ('quick' in op) q = makeQuery({ sort: q.sort, filter: q.filter, quick: op.quick });
      if (op.tx) m.applyTransaction(op.tx);
      else m.setQuery(q);
    }
    const d = m.displayed;
    const displayed = Array.from({ length: d.count }, (_, i) => String((d.nodeAt(d.index(i)!) as { id: unknown }).id));
    const atIndex = Object.fromEntries((at as number[]).map((i) => [String(i), String((d.nodeAt(d.index(i)!) as { id: unknown }).id)]));
    const indexOf = Object.fromEntries((of as string[]).map((id) => [id, d.indexOf(dataKey(id)!)]));
    return { displayed, atIndex, indexOf };
  },
};
