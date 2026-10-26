import { createColumnModel } from '@dzgrid/core';
import type { Suite } from './index.js';

export const columns: Record<string, Suite> = {
  'columns-layout': ({ columns: defs, available, state, then }) => {
    const model = createColumnModel(defs, { availableInline: available });
    if (state) model.apply(state, 'user');
    // `then`: a second patch after the first (a width cleared by null, Phase 6 step 3).
    if (then) model.apply(then, 'user');
    const slice = (s: typeof model.layout.start) => s.columns.map((c, i) => [c.id, s.widths.sizeAt(i)]);
    return { start: slice(model.layout.start), center: slice(model.layout.center), end: slice(model.layout.end), total: model.layout.totalWidth };
  },
};
