import { liveChangeProblems, partNameFor, resolveOperations, resolveColumns, type Problem } from '@dzgrid/core';
import { createRowStore, compileFilter, sortIndices } from '@dzgrid/core/internal';
import { harness } from '../harness.js';
import type { Suite } from './index.js';

type Row = Record<string, unknown> & { id: string };
const shape = (ps: readonly Problem[]) => ps.map((p) => ({ code: p.code, severity: p.severity, path: p.path }));

export const problems: Record<string, Suite> = {
  problems: (input) => {
    switch (input.op) {
      case 'replaceAll':
        return { problems: shape(createRowStore<Row>((r) => r.id).replaceAll(input.rows).problems) };
      case 'tx': {
        const s = createRowStore<Row>((r) => r.id);
        s.replaceAll(input.rows);
        return { problems: shape(s.apply(input.tx).problems) };
      }
      case 'part-name':
        return { problems: shape(partNameFor(input.slot, input.column, new Set(input.available)).problems) };
      case 'live-change':
        return { problems: shape(liveChangeProblems(input.policy, input.prev, input.patch)) };
      case 'operations':
        return { problems: shape(resolveOperations(input.operations, input.hasSource).problems) };
      case 'columns':
        return { problems: shape(resolveColumns(input.columns).problems) };
      case 'filter': {
        const h = harness({ locale: 'en-US', ...input });
        return { problems: shape(compileFilter(input.filter, h.env()).problems) };
      }
      case 'sort': {
        const h = harness({ locale: 'en-US', ...input });
        return { problems: shape(sortIndices(input.sort, null, h.env()).problems) };
      }
    }
    throw new Error(`unknown op ${input.op}`);
  },
};
