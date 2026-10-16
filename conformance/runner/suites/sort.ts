import { sortIndices } from '@dzgrid/core/internal';
import { harness } from '../harness.js';
import type { Suite } from './index.js';

export const sort: Record<string, Suite> = {
  sort: (input) => {
    const h = harness(input);
    const { order, problems } = sortIndices(input.sort, null, h.env());
    const ids = [...order].map((i) => h.store.snapshot.ids[i]);
    return problems.length ? { ids, problems: problems.map((p) => [p.code, p.path]) } : { ids };
  },
};
