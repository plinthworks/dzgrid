import { compileFilter, filterIndices } from '@dzgrid/core/internal';
import { harness } from '../harness.js';
import type { Suite } from './index.js';

const run: Suite = (input) => {
  const h = harness(input);
  const f = compileFilter(input.filter, h.env());
  const order = filterIndices(h.store.snapshot.count, [f]);
  const ids = order ? [...order].map((i) => h.store.snapshot.ids[i]) : [...h.store.snapshot.ids];
  return f.problems.length ? { ids, problems: f.problems.map((p) => [p.code, p.path]) } : { ids };
};

export const filter: Record<string, Suite> = {
  'filter-text': run,
  'filter-number': run,
  'filter-day': run,
  'filter-combined': run,
  'filter-instant': run,
};
