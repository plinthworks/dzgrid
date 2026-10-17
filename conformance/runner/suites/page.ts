import { clientRows, createColumnModel, localeCtx, makeQuery, type Query } from '@dzgrid/core';
import type { Suite } from './index.js';

type Row = Record<string, unknown> & { id: string };

export const page: Record<string, Suite> = {
  /** Client paging: the rows of the page, its state and the counts after a few steps. */
  'page-model': ({ columns, rows, page: options, ops }) => {
    const m = clientRows<Row>({ rows, getRowId: (r) => r.id, columns: createColumnModel<Row>(columns), ctx: localeCtx({ locale: 'en-US' }), page: options });
    let q: Query = makeQuery();
    for (const op of ops) {
      if (op.sort) m.setQuery((q = makeQuery({ sort: op.sort, filter: q.filter, quick: q.quick })));
      else if (op.filter) m.setQuery((q = makeQuery({ sort: q.sort, filter: op.filter, quick: q.quick })));
      else if ('quick' in op) m.setQuery((q = makeQuery({ sort: q.sort, filter: q.filter, quick: op.quick })));
      else if (op.tx) m.applyTransaction(op.tx);
      else if ('go' in op) m.setPage({ index: op.go });
      else if ('size' in op) m.setPage({ size: op.size });
    }
    const d = m.displayed;
    const p = m.page!;
    return {
      displayed: Array.from({ length: d.count }, (_, i) => String(d.nodeAt(d.index(i)!).id)),
      page: { index: p.index, size: p.size, total: p.total, pageCount: p.pageCount, hasNext: p.hasNext },
      counts: m.counts,
    };
  },
};
