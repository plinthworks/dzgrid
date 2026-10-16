import { assignKeys } from '@dzgrid/core';
import type { Suite } from './index.js';

export const rows: Record<string, Suite> = {
  'row-key': ({ ids }) => {
    const r = assignKeys(ids);
    return { accepted: r.keys.map((k) => k !== null), problems: r.problems.map((p) => [p.code, p.path]) };
  },
};
