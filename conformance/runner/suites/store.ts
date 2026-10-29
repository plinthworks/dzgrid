import { type Problem } from '@dzgrid/core';
import { createRowStore } from '@dzgrid/core/internal';
import { sameValues } from '@dzgrid/core/compare';
import type { Suite } from './index.js';

type Row = { id: string | number; v?: number };

export const store: Record<string, Suite> = {
  // `same: "values"` (step 16e): the store compares a full reload's rows by value (`sameValues`); the last
  // result's kind and updated ids are then given too.
  transaction: ({ rows, ops, same }) => {
    const s = createRowStore<Row>((r) => r.id, same === 'values' ? sameValues : undefined);
    s.replaceAll(rows);
    const problems: Problem[] = [];
    let last;
    for (const op of ops) {
      const r = (last = op.replaceAll ? s.replaceAll(op.replaceAll) : s.apply(op.tx));
      problems.push(...r.problems);
    }
    const snap = s.snapshot;
    const out: Record<string, unknown> = { ids: [...snap.ids], problems: problems.map((p) => [p.code, p.path]) };
    if (same && last) (out['kind'] = last.kind), (out['updated'] = last.updated.map((k) => k.slice(k.indexOf(':', 2) + 1)));
    if (snap.rows.some((r) => r.v !== undefined)) out['values'] = snap.rows.map((r) => r.v ?? null);
    return out;
  },
};
