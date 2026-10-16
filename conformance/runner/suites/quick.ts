import { compileQuick, filterIndices } from '@dzgrid/core';
import { harness } from '../harness.js';
import type { Suite } from './index.js';

export const quick: Record<string, Suite> = {
  'quick-filter': (input) => {
    const h = harness(input);
    const f = compileQuick(input.quick, h.columns.visible(), h.env());
    const order = filterIndices(h.store.snapshot.count, [f]);
    return { ids: order ? [...order].map((i) => h.store.snapshot.ids[i]) : [...h.store.snapshot.ids] };
  },
};
