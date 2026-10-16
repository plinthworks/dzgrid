import { type Problem } from '@dzgrid/core';
import { createRowStore } from '@dzgrid/core/internal';
import type { Suite } from './index.js';

type Row = { id: string | number; v?: number };

export const store: Record<string, Suite> = {
  transaction: ({ rows, ops }) => {
    const s = createRowStore<Row>((r) => r.id);
    s.replaceAll(rows);
    const problems: Problem[] = [];
    for (const op of ops) {
      const r = op.replaceAll ? s.replaceAll(op.replaceAll) : s.apply(op.tx);
      problems.push(...r.problems);
    }
    const snap = s.snapshot;
    const out: Record<string, unknown> = { ids: [...snap.ids], problems: problems.map((p) => [p.code, p.path]) };
    if (snap.rows.some((r) => r.v !== undefined)) out['values'] = snap.rows.map((r) => r.v ?? null);
    return out;
  },
};
